import type { Command } from "commander";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { Readable, Writable } from "node:stream";
import { spawn } from "node:child_process";
import { checkDockerCompose } from "./docker-utils.js";
import { ensureGitignoreEntry } from "../../runtime/gitignore.js";
import { resolveRoleMountVolumes, type RoleMount } from "../../generator/mount-volumes.js";
import type { ResolvedAgent, RoleType } from "@clawmasons/shared";
import { computeToolFilters, resolveRole as resolveRoleByName, adaptRoleToResolvedAgent, getAppShortName } from "@clawmasons/shared";
import { getRegisteredAgentTypes, getAgentFromRegistry, initRegistry } from "../../materializer/role-materializer.js";
import { AcpSession, type AcpSessionConfig, type AcpSessionDeps } from "../../acp/session.js";
import { AcpSdkBridge, type AcpSdkBridgeConfig } from "../../acp/bridge.js";
import { CredentialService, CredentialWSClient } from "@clawmasons/credential-service";
import { createFileLogger, type AcpLogger } from "../../acp/logger.js";
import { generateRoleDockerBuildDir } from "../../materializer/docker-generator.js";
import { ensureProxyDependencies, synthesizeRolePackages } from "../../materializer/proxy-dependencies.js";

// ── Role-based Agent Resolution ───────────────────────────────────────

/**
 * Resolve a RoleType from a role name in the project directory.
 */
async function defaultResolveRole(
  roleName: string,
  projectDir: string,
): Promise<RoleType> {
  return resolveRoleByName(roleName, projectDir);
}

/**
 * Resolve a ResolvedAgent from a RoleType and agent type.
 */
function defaultAdaptRole(
  roleType: RoleType,
  agentType: string,
): ResolvedAgent {
  return adaptRoleToResolvedAgent(roleType, agentType);
}

/**
 * Infer the agent type from a RoleType's source dialect.
 * Falls back to "claude-code" if not determinable.
 */
export function inferAgentType(roleType: RoleType): string {
  return roleType.source.agentDialect ?? "claude-code";
}

// ── Types ──────────────────────────────────────────────────────────────

export interface RunAcpAgentOptions {
  agent?: string;
  role: string;
  proxyPort?: number;
}

/**
 * Generate a short unique session ID (8 hex characters).
 */
export function generateSessionId(): string {
  return crypto.randomBytes(4).toString("hex");
}

// ── Agent Type Aliases ────────────────────────────────────────────────

/**
 * Legacy alias map kept for backward compatibility.
 * @deprecated Aliases are now declared by AgentPackage.aliases in agent packages.
 */
export const AGENT_TYPE_ALIASES: Record<string, string> = {
  claude: "claude-code",
  codex: "codex",
  aider: "aider",
  pi: "pi-coding-agent",
  mcp: "mcp-agent",
};

/**
 * Resolve a user-provided agent type string to the internal materializer name.
 * Checks the agent registry (which includes aliases from AgentPackage),
 * then falls back to the legacy alias map, then checks direct registered types.
 *
 * @returns The resolved agent type, or undefined if not recognized
 */
export function resolveAgentType(input: string): string | undefined {
  // Check registry (includes aliases from AgentPackage)
  const agentPkg = getAgentFromRegistry(input);
  if (agentPkg) return agentPkg.name;

  // Legacy fallback: check hardcoded aliases for agents not yet packaged (codex, aider)
  const aliased = AGENT_TYPE_ALIASES[input];
  if (aliased) return aliased;

  return undefined;
}

/**
 * Check whether a string matches a known agent type (including aliases).
 */
export function isKnownAgentType(input: string): boolean {
  return resolveAgentType(input) !== undefined;
}

/**
 * Get a user-friendly list of known agent type names (aliases + registered).
 */
export function getKnownAgentTypeNames(): string[] {
  const names = new Set<string>(Object.keys(AGENT_TYPE_ALIASES));
  for (const t of getRegisteredAgentTypes()) {
    names.add(t);
  }
  return [...names].sort();
}

/**
 * Resolve required credentials from an agent and role's apps.
 * Returns a map of credential key -> list of declaring package names.
 */
export function resolveRequiredCredentials(
  agentName: string,
  agentCredentials: string[],
  roleApps: Array<{ name: string; credentials: string[] }>,
): Map<string, string[]> {
  const credentialMap = new Map<string, string[]>();

  // Add agent-level credentials
  for (const key of agentCredentials) {
    const declarers = credentialMap.get(key) ?? [];
    declarers.push(agentName);
    credentialMap.set(key, declarers);
  }

  // Add app-level credentials
  for (const app of roleApps) {
    for (const key of app.credentials) {
      const declarers = credentialMap.get(key) ?? [];
      declarers.push(app.name);
      credentialMap.set(key, declarers);
    }
  }

  return credentialMap;
}

/**
 * Display required credentials and risk level to the operator.
 */
export function displayCredentials(
  credentials: Map<string, string[]>,
  riskLevel: string,
  roleName: string,
): void {
  console.log(`  Role: ${roleName} (${riskLevel} risk)`);
  console.log("");

  if (credentials.size === 0) {
    console.log("  No credentials required.");
    return;
  }

  console.log("  Required credentials:");
  for (const [key, declarers] of credentials) {
    const uniqueDeclarers = [...new Set(declarers)];
    console.log(`    ${key}  (declared by: ${uniqueDeclarers.join(", ")})`);
  }
}

/**
 * Generate a docker-compose.yml for a run-agent interactive session.
 *
 * Uses the project-local docker build directory layout:
 *   .mason/docker/{role}/
 *     {agent-type}/Dockerfile
 *     mcp-proxy/Dockerfile
 */
export function generateComposeYml(opts: {
  dockerBuildDir: string;
  dockerDir: string;
  projectDir: string;
  agent: string;
  role: string;
  logsDir: string;
  proxyToken: string;
  credentialProxyToken: string;
  proxyPort?: number;
  roleMounts?: RoleMount[];
  credentialKeys?: string[];
  bashMode?: boolean;
  verbose?: boolean;
}): string {
  const { dockerBuildDir, dockerDir, projectDir, agent, role, logsDir, proxyToken, credentialProxyToken, proxyPort = 3000, roleMounts, credentialKeys } = opts;

  // Per-role cache directory for NODE_COMPILE_CACHE and NPM_CONFIG_CACHE
  const cacheDir = path.join(dockerBuildDir, "mcp-proxy", ".cache");

  // Proxy: context is dockerDir (has node_modules), dockerfile is role-specific
  const proxyDockerfile = path.relative(dockerDir, path.join(dockerBuildDir, "mcp-proxy", "Dockerfile"));
  // Agent: context is dockerDir (has node_modules), dockerfile is role/agent-type specific
  const agentDockerfile = path.relative(dockerDir, path.join(dockerBuildDir, agent, "Dockerfile"));

  const proxyServiceName = `proxy-${role}`;
  const agentServiceName = `agent-${role}`;

  // Unique compose project name derived from project directory
  const projectHash = crypto.createHash("sha256").update(projectDir).digest("hex").slice(0, 8);
  const composeName = `mason-${projectHash}`;

  // Build agent volume lines: workspace mount + role-declared mounts
  const agentVolumeLines = [`      - "${projectDir}:/home/mason/workspace/project"`];
  for (const vol of resolveRoleMountVolumes(roleMounts)) {
    agentVolumeLines.push(`      - "${vol}"`);
  }

  return `# Generated by mason run-agent
name: ${composeName}
services:
  ${proxyServiceName}:
    build:
      context: "${dockerDir}"
      dockerfile: "${proxyDockerfile}"
    volumes:
      - "${projectDir}:/home/mason/workspace/project"
      - "${logsDir}:/logs"
      - "${cacheDir}:/app/.cache"
    environment:
      - CHAPTER_PROXY_TOKEN=${proxyToken}
      - CREDENTIAL_PROXY_TOKEN=${credentialProxyToken}
      - PROJECT_DIR=/home/mason/workspace/project${credentialKeys && credentialKeys.length > 0 ? `\n      - CHAPTER_DECLARED_CREDENTIALS=${JSON.stringify(credentialKeys)}` : ""}
    ports:
      - "${proxyPort}:9090"
    restart: "no"

  ${agentServiceName}:
    build:
      context: "${dockerDir}"
      dockerfile: "${agentDockerfile}"
    volumes:
${agentVolumeLines.join("\n")}
    depends_on:
      - ${proxyServiceName}
    environment:
      - MCP_PROXY_TOKEN=${proxyToken}
      - MCP_PROXY_URL=http://${proxyServiceName}:9090${credentialKeys && credentialKeys.length > 0 ? `\n      - AGENT_CREDENTIALS=${JSON.stringify(credentialKeys)}` : ""}${opts.bashMode ? `\n      - AGENT_COMMAND_OVERRIDE=bash` : ""}${opts.verbose ? `\n      - AGENT_ENTRY_VERBOSE=1` : ""}
    stdin_open: true
    tty: true
    init: true
    restart: "no"
`;
}

/**
 * Execute a docker compose command with the given compose file.
 * Returns a promise that resolves with the exit code.
 */
export function execComposeCommand(
  composeFile: string,
  args: string[],
  opts?: { interactive?: boolean; verbose?: boolean },
): Promise<number> {
  const baseArgs = ["compose", "-f", composeFile, ...args];
  const showOutput = opts?.interactive || opts?.verbose;

  return new Promise((resolve) => {
    if (showOutput) {
      const child = spawn("docker", baseArgs, { stdio: "inherit" });
      child.on("close", (code) => resolve(code ?? 0));
      child.on("error", () => resolve(1));
    } else {
      // Capture stderr so we can show it on failure
      const child = spawn("docker", baseArgs, {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on("close", (code) => {
        if (code !== 0 && stderr) {
          console.error(stderr);
        }
        resolve(code ?? 0);
      });
      child.on("error", () => resolve(1));
    }
  });
}

// ── Environment Variable Credential Collection ───────────────────────

/**
 * Collect environment variables from process.env that match the agent's
 * declared credentials (agent-level + app-level across all roles).
 */
export function collectEnvCredentials(
  agent: ResolvedAgent,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const declaredKeys = new Set<string>(agent.credentials);
  for (const role of agent.roles) {
    for (const app of role.apps) {
      for (const key of app.credentials) {
        declaredKeys.add(key);
      }
    }
  }

  const collected: Record<string, string> = {};
  for (const key of declaredKeys) {
    const value = env[key];
    if (value !== undefined && value !== "") {
      collected[key] = value;
    }
  }

  return collected;
}

// ── Docker Auto-Build ──────────────────────────────────────────────────

/**
 * Ensure docker build artifacts exist for a role. If not, trigger docker-init.
 */
async function ensureDockerBuild(
  roleType: RoleType,
  agentType: string,
  projectDir: string,
  deps?: { existsSyncFn?: (p: string) => boolean; forceRebuild?: boolean },
): Promise<{ dockerBuildDir: string; dockerDir: string }> {
  const existsSync = deps?.existsSyncFn ?? fs.existsSync;
  const roleName = getAppShortName(roleType.metadata.name);
  const dockerDir = path.join(projectDir, ".mason", "docker");
  const dockerBuildDir = path.join(dockerDir, roleName);

  // When --build is used, remove stale build context so node_modules are re-copied
  if (deps?.forceRebuild && existsSync(dockerBuildDir)) {
    console.log(`\n  Removing stale docker build context...`);
    fs.rmSync(dockerBuildDir, { recursive: true, force: true });
  }

  if (!existsSync(path.join(dockerBuildDir, agentType, "Dockerfile"))) {
    console.log(`\n  Docker artifacts not found. Building...`);

    // Ensure .mason/.gitignore has docker/ entry
    const gitignorePath = path.join(projectDir, ".mason", ".gitignore");
    const gitignoreDir = path.dirname(gitignorePath);
    fs.mkdirSync(gitignoreDir, { recursive: true });
    if (!existsSync(gitignorePath) || !fs.readFileSync(gitignorePath, "utf-8").includes("docker/")) {
      fs.appendFileSync(gitignorePath, "docker/\nsessions/\n");
    }

    // Generate the build directory
    generateRoleDockerBuildDir({
      role: roleType,
      agentType,
      projectDir,
      agentName: roleName,
    });

    // Populate shared proxy dependencies
    ensureProxyDependencies(dockerDir, projectDir);

    // Synthesize inline app/role packages (e.g. mcp_servers from ROLE.md)
    synthesizeRolePackages(roleType, dockerDir);

    // Create per-role cache directory for NODE_COMPILE_CACHE and NPM_CONFIG_CACHE
    fs.mkdirSync(path.join(dockerBuildDir, "mcp-proxy", ".cache"), { recursive: true });

    console.log(`  Docker artifacts built at .mason/docker/${roleName}/`);
  }

  return { dockerBuildDir, dockerDir };
}

// ── Help Text ─────────────────────────────────────────────────────────

export const RUN_ACP_AGENT_HELP_EPILOG = `
Command Syntax:
  mason run --role <name>                      # infers agent type from role
  mason run --role <name> --agent-type claude   # explicit agent type
  mason run --role <name> --acp                 # ACP mode

Agent Types:
  claude (claude-code), codex, aider, pi (pi-coding-agent), mcp (mcp-agent)

Session Behavior:
  When an ACP client sends session/new with a "cwd" field, the agent
  container mounts that directory as /home/mason/workspace/project.
  Each session/new starts a fresh agent container; the proxy stays running.
  The credential service runs in-process on the host.

Side Effects:
  - Creates .mason/ in the project for docker builds and session state
  - Appends ".mason" to the project's .gitignore if present

  Credential env vars (e.g. OPEN_ROUTER_KEY, ANTHROPIC_API_KEY) are
  passed through to the credential-service when set in the client's
  env block.
`;

// ── Deps Interface ────────────────────────────────────────────────────

/**
 * Dependencies for run-agent, injectable for testing.
 */
export interface RunAgentDeps {
  /** Override the compose command executor (for testing). */
  execComposeFn?: (
    composeFile: string,
    args: string[],
    opts?: { interactive?: boolean; verbose?: boolean },
  ) => Promise<number>;
  /** Override session ID generation (for testing). */
  generateSessionIdFn?: () => string;
  /** Override docker compose check (for testing). */
  checkDockerComposeFn?: () => void;
  /** Override .gitignore entry management (for testing). */
  ensureGitignoreEntryFn?: (dir: string, pattern: string) => boolean;
  /** Override role resolution (for testing). */
  resolveRoleFn?: (roleName: string, projectDir: string) => Promise<RoleType>;
  /** Override agent adaptation (for testing). */
  adaptRoleFn?: (roleType: RoleType, agentType: string) => ResolvedAgent;
  /** Override AcpSession construction (for testing, ACP mode). */
  createSessionFn?: (config: AcpSessionConfig, sessionDeps?: AcpSessionDeps) => AcpSession;
  /** Override AcpSdkBridge construction (for testing, ACP mode). */
  createBridgeFn?: (config: AcpSdkBridgeConfig) => AcpSdkBridge;
  /** Override fs.mkdirSync (for testing). */
  mkdirSyncFn?: (dirPath: string, options?: { recursive?: boolean }) => void;
  /** Override fs.existsSync (for testing). */
  existsSyncFn?: (filePath: string) => boolean;
  /** Override credential service startup (for testing). */
  startCredentialServiceFn?: (opts: {
    proxyPort: number;
    credentialProxyToken: string;
    envCredentials: Record<string, string>;
  }) => Promise<{ disconnect: () => void; close: () => void }>;
  /** Override proxy health check (for testing). */
  waitForProxyHealthFn?: (url: string, timeoutMs: number) => Promise<void>;
  /** Override logger creation (for testing, ACP mode). */
  createLoggerFn?: (logDir: string) => AcpLogger;
}

// ── Backward-compat aliases ───────────────────────────────────────────
export type RunAcpAgentDeps = RunAgentDeps;

// ── Command Registration ──────────────────────────────────────────────

/**
 * Create the action handler for the `run` command.
 */
function createRunAction() {
  return async (
    positionalAgentType: string | undefined,
    options: {
      acp?: boolean;
      bash?: boolean;
      build?: boolean;
      verbose?: boolean;
      proxyOnly?: boolean;
      agentType?: string;
      role?: string;
      proxyPort: string;
    },
  ) => {
    const agentTypeInput = positionalAgentType ?? options.agentType;
    const role = options.role;

    if (!role) {
      console.error("\n  --role <name> is required.\n  Usage: mason run --role <name> [--agent-type <type>]\n");
      process.exit(1);
      return;
    }

    if (options.bash && options.acp) {
      console.error("\n  --bash and --acp are mutually exclusive.\n");
      process.exit(1);
      return;
    }

    // Resolve agent type if provided (alias or direct)
    let resolvedAgentType: string | undefined;
    if (agentTypeInput) {
      resolvedAgentType = resolveAgentType(agentTypeInput);
      if (!resolvedAgentType) {
        const known = getKnownAgentTypeNames().join(", ");
        console.error(`\n  Unknown agent type "${agentTypeInput}".\n  Available agent types: ${known}\n`);
        process.exit(1);
        return;
      }
    }

    if (options.proxyOnly) {
      await runProxyOnly(process.cwd(), resolvedAgentType, role, parseInt(options.proxyPort, 10));
    } else if (options.acp) {
      await runAgent(process.cwd(), resolvedAgentType, role, undefined, {
        acp: true,
        proxyPort: parseInt(options.proxyPort, 10),
      });
    } else {
      await runAgent(process.cwd(), resolvedAgentType, role, undefined, {
        proxyPort: parseInt(options.proxyPort, 10),
        bash: options.bash,
        build: options.build,
        verbose: options.verbose,
      });
    }
  };
}

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run a role on the specified agent runtime")
    .argument("[agent-type]", "Agent runtime type (e.g., claude, codex, aider, pi, mcp)")
    .option("--acp", "Start in ACP mode for editor integration")
    .option("--bash", "Launch bash shell instead of the agent (for debugging)")
    .option("--build", "Force rebuild Docker images before running")
    .option("--role <name>", "Role name to run (required)")
    .option("--agent-type <name>", "Agent type (alternative to positional argument, overrides inference)")
    .option("--proxy-only", "Start proxy infrastructure only, output connection info as JSON")
    .option("--verbose", "Show Docker build and compose output")
    .option("--proxy-port <number>", "Internal proxy port (default: 3000)", "3000")
    .addHelpText("after", RUN_ACP_AGENT_HELP_EPILOG)
    .action(createRunAction());
}

/**
 * @deprecated Use registerRunCommand instead.
 */
export function registerRunAgentCommand(program: Command): void {
  registerRunCommand(program);
}

/**
 * @deprecated Use registerRunAgentCommand instead.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerRunAcpAgentCommand(_program: Command): void {
  // No-op: kept for backward compatibility.
}

// ── Main Orchestrator ─────────────────────────────────────────────────

export async function runAgent(
  projectDir: string,
  agent: string | undefined,
  role: string,
  deps?: RunAgentDeps,
  acpOptions?: {
    acp?: boolean;
    proxyPort?: number;
    bash?: boolean;
    build?: boolean;
    verbose?: boolean;
  },
): Promise<void> {
  // Initialize agent registry with config-declared agents from .mason/config.json
  await initRegistry(projectDir);

  const isAcpMode = acpOptions?.acp === true;
  const proxyPort = acpOptions?.proxyPort ?? 3000;
  const bashMode = acpOptions?.bash === true;
  const buildMode = acpOptions?.build === true;

  if (isAcpMode) {
    return runAgentAcpMode(projectDir, agent, role, proxyPort, deps);
  } else {
    const verbose = acpOptions?.verbose === true;
    return runAgentInteractiveMode(projectDir, agent, role, proxyPort, deps, bashMode, buildMode, verbose);
  }
}

// ── Backward-compat alias ─────────────────────────────────────────────

/**
 * @deprecated Use `runAgent` with `acpOptions: { acp: true }` instead.
 */
export async function runAcpAgent(
  rootDir: string,
  options: RunAcpAgentOptions,
  deps?: RunAgentDeps,
): Promise<void> {
  return runAgent(rootDir, options.agent, options.role, deps, {
    acp: true,
    proxyPort: options.proxyPort,
  });
}

// ── Interactive Mode ──────────────────────────────────────────────────

async function runAgentInteractiveMode(
  projectDir: string,
  agentOverride: string | undefined,
  role: string,
  proxyPort: number,
  deps?: RunAgentDeps,
  bashMode?: boolean,
  buildMode?: boolean,
  verbose?: boolean,
): Promise<void> {
  const execCompose = deps?.execComposeFn ?? execComposeCommand;
  const checkDocker = deps?.checkDockerComposeFn ?? checkDockerCompose;
  const ensureGitignore = deps?.ensureGitignoreEntryFn ?? ensureGitignoreEntry;
  const startCredService = deps?.startCredentialServiceFn ?? defaultStartCredentialService;
  const resolveRoleFn = deps?.resolveRoleFn ?? defaultResolveRole;
  const waitForProxyHealth = deps?.waitForProxyHealthFn ?? defaultWaitForProxyHealth;

  try {
    // 1. Pre-flight: check docker compose is available
    checkDocker();

    // 2. Resolve role from project directory
    const roleType = await resolveRoleFn(role, projectDir);
    const roleName = getAppShortName(roleType.metadata.name);

    // 3. Infer or override agent type
    const agentType = agentOverride ?? inferAgentType(roleType);

    console.log(`\n  Agent: ${agentType}`);
    console.log(`  Role: ${roleName}`);

    // 4. Ensure docker build artifacts exist (auto-build if missing)
    const { dockerBuildDir, dockerDir } = await ensureDockerBuild(
      roleType, agentType, projectDir, { existsSyncFn: deps?.existsSyncFn, forceRebuild: buildMode },
    );

    // 5. Ensure .mason is in project's .gitignore
    ensureGitignore(projectDir, ".mason");

    // 6. Generate session ID and create session directory
    const sessionId = (deps?.generateSessionIdFn ?? generateSessionId)();
    const sessionDir = path.join(projectDir, ".mason", "sessions", sessionId);
    const dockerSessionDir = path.join(sessionDir, "docker");
    fs.mkdirSync(dockerSessionDir, { recursive: true });

    const logsDir = path.join(sessionDir, "logs");
    fs.mkdirSync(logsDir, { recursive: true });

    console.log(`  Session: ${sessionId}`);

    // 7. Generate tokens and docker-compose.yml
    const proxyToken = crypto.randomBytes(32).toString("hex");
    const credentialProxyToken = crypto.randomBytes(32).toString("hex");

    // Collect declared credential keys from the role
    const declaredCredentialKeys = [...(roleType.governance?.credentials ?? [])];
    for (const app of roleType.apps ?? []) {
      for (const key of app.credentials ?? []) {
        if (!declaredCredentialKeys.includes(key)) {
          declaredCredentialKeys.push(key);
        }
      }
    }

    const composeContent = generateComposeYml({
      dockerBuildDir,
      dockerDir,
      projectDir,
      agent: agentType,
      role: roleName,
      logsDir,
      proxyToken,
      credentialProxyToken,
      proxyPort,
      roleMounts: roleType.container?.mounts,
      credentialKeys: declaredCredentialKeys,
      bashMode,
      verbose,
    });

    const composeFile = path.join(dockerSessionDir, "docker-compose.yml");
    fs.writeFileSync(composeFile, composeContent);
    console.log(`  Compose: .mason/sessions/${sessionId}/docker/docker-compose.yml`);

    // 8. Build and start proxy detached
    const proxyServiceName = `proxy-${roleName}`;
    console.log(`\n  Building proxy (${proxyServiceName})...`);

    const buildArgs = ["build"];
    if (buildMode) buildArgs.push("--no-cache");
    buildArgs.push(proxyServiceName);

    const buildCode = await execCompose(
      composeFile,
      buildArgs,
      { verbose },
    );
    if (buildCode !== 0) {
      throw new Error(`Failed to build proxy image (exit code ${buildCode}).`);
    }

    console.log(`  Starting proxy (${proxyServiceName})...`);

    const proxyCode = await execCompose(
      composeFile,
      ["up", "-d", proxyServiceName],
      { verbose },
    );
    if (proxyCode !== 0) {
      throw new Error(`Failed to start proxy (exit code ${proxyCode}).`);
    }
    console.log(`  Proxy started in background.`);

    // 8b. Wait for proxy health before connecting credential service
    console.log(`  Waiting for proxy to be ready...`);
    await waitForProxyHealth(`http://localhost:${proxyPort}/health`, 60_000);
    console.log(`  Proxy ready.`);

    // 9. Collect env credentials and start credential service in-process
    const adaptRoleFn = deps?.adaptRoleFn ?? defaultAdaptRole;
    const resolvedAgent = adaptRoleFn(roleType, agentType);
    const envCredentials = collectEnvCredentials(resolvedAgent);

    console.log(`  Starting credential service (in-process)...`);

    let credServiceHandle: { disconnect: () => void; close: () => void } | null = null;
    try {
      credServiceHandle = await startCredService({
        proxyPort,
        credentialProxyToken,
        envCredentials,
      });
      console.log(`  Credential service connected to proxy.`);
    } catch (err) {
      throw new Error(`Failed to start credential service: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 10. Start agent interactively
    const agentServiceName = `agent-${roleName}`;
    console.log(`  Starting agent (${agentServiceName})...\n`);

    // When stdin is not a TTY (e.g. piped from a test), pass -T to disable
    // pseudo-TTY allocation so docker compose run works with piped stdio.
    const runArgs = ["run", "--rm", "--service-ports"];
    if (buildMode) {
      runArgs.push("--build");
    }
    if (!process.stdin.isTTY) {
      runArgs.push("-T");
    }
    runArgs.push(agentServiceName);

    const agentCode = await execCompose(
      composeFile,
      runArgs,
      { interactive: true },
    );

    // 11. Tear down all containers on agent exit
    console.log(`\n  Agent exited (code ${agentCode}). Tearing down services...`);

    try {
      if (credServiceHandle) {
        credServiceHandle.disconnect();
        credServiceHandle.close();
      }
    } catch { /* best-effort */ }

    await execCompose(composeFile, ["down"], { verbose });

    console.log(`  Services stopped.`);
    console.log(`  Session retained at: .mason/sessions/${sessionId}/`);
    console.log(`\n  agent complete\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  agent failed: ${message}\n`);
    process.exit(1);
  }
}

// ── Proxy-Only Mode ───────────────────────────────────────────────────

/**
 * Start only the proxy infrastructure (no agent, no credential service).
 * Outputs connection info as JSON to stdout and returns.
 */
export async function runProxyOnly(
  projectDir: string,
  agentOverride: string | undefined,
  role: string,
  proxyPort: number,
  deps?: RunAgentDeps,
): Promise<void> {
  const execCompose = deps?.execComposeFn ?? execComposeCommand;
  const checkDocker = deps?.checkDockerComposeFn ?? checkDockerCompose;
  const ensureGitignore = deps?.ensureGitignoreEntryFn ?? ensureGitignoreEntry;
  const resolveRoleFn = deps?.resolveRoleFn ?? defaultResolveRole;

  // Redirect console.log to stderr so only JSON goes to stdout
  const origLog = console.log;
  console.log = (...args: unknown[]) => console.error(...args);

  try {
  // 1. Pre-flight: check docker compose is available
  checkDocker();

  // 2. Resolve role from project directory
  const roleType = await resolveRoleFn(role, projectDir);
  const roleName = getAppShortName(roleType.metadata.name);

  // 3. Infer or override agent type
  const agentType = agentOverride ?? inferAgentType(roleType);

  // 4. Ensure docker build artifacts exist (auto-build if missing)
  const { dockerBuildDir, dockerDir } = await ensureDockerBuild(
    roleType, agentType, projectDir, { existsSyncFn: deps?.existsSyncFn },
  );

  // 5. Ensure .mason is in project's .gitignore
  ensureGitignore(projectDir, ".mason");

  // 6. Generate session ID and create session directory
  const sessionId = (deps?.generateSessionIdFn ?? generateSessionId)();
  const sessionDir = path.join(projectDir, ".mason", "sessions", sessionId);
  const dockerSessionDir = path.join(sessionDir, "docker");
  fs.mkdirSync(dockerSessionDir, { recursive: true });

  const logsDir = path.join(sessionDir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });

  // 7. Generate tokens and docker-compose.yml
  const proxyToken = crypto.randomBytes(32).toString("hex");
  const credentialProxyToken = crypto.randomBytes(32).toString("hex");

  const composeContent = generateComposeYml({
    dockerBuildDir,
    dockerDir,
    projectDir,
    agent: agentType,
    role: roleName,
    logsDir,
    proxyToken,
    credentialProxyToken,
    proxyPort,
    roleMounts: roleType.container?.mounts,
  });

  const composeFile = path.join(dockerSessionDir, "docker-compose.yml");
  fs.writeFileSync(composeFile, composeContent);

  // 8. Build and start proxy detached
  const proxyServiceName = `proxy-${roleName}`;

  const buildCode = await execCompose(composeFile, ["build", proxyServiceName]);
  if (buildCode !== 0) {
    throw new Error(`Failed to build proxy image (exit code ${buildCode}).`);
  }

  const upCode = await execCompose(composeFile, ["up", "-d", proxyServiceName]);
  if (upCode !== 0) {
    throw new Error(`Failed to start proxy (exit code ${upCode}).`);
  }

  // 9. Output connection info as JSON to stdout
  const info = {
    proxyPort,
    proxyToken,
    composeFile,
    proxyServiceName,
    sessionId,
  };
  origLog(JSON.stringify(info));

  } finally {
    console.log = origLog;
  }
}

// ── ACP Mode ──────────────────────────────────────────────────────────

async function runAgentAcpMode(
  projectDir: string,
  agentOverride: string | undefined,
  role: string,
  proxyPort: number,
  deps?: RunAgentDeps,
): Promise<void> {
  const resolveRoleFn = deps?.resolveRoleFn ?? defaultResolveRole;
  const adaptRoleFn = deps?.adaptRoleFn ?? defaultAdaptRole;
  const createSession = deps?.createSessionFn ?? ((config: AcpSessionConfig, sessionDeps?: AcpSessionDeps) => new AcpSession(config, sessionDeps));
  const createBridge = deps?.createBridgeFn ?? ((config: AcpSdkBridgeConfig) => new AcpSdkBridge(config));
  const ensureGitignore = deps?.ensureGitignoreEntryFn ?? ensureGitignoreEntry;
  const mkdirSync = deps?.mkdirSyncFn ?? fs.mkdirSync;

  // ── Protect stdout from console pollution ────────────────────────────
  const origLog = console.log.bind(console);
  const origError = console.error.bind(console);
  const earlyBuffer: unknown[][] = [];
  if (!deps?.createLoggerFn) {
    const noop = (...args: unknown[]) => { earlyBuffer.push(args); };
    console.log = noop;
    console.error = noop;
  }

  let logger: AcpLogger | null = null;

  let session: AcpSession | null = null;
  let bridge: AcpSdkBridge | null = null;
  let credentialWsClient: CredentialWSClient | null = null;
  let shuttingDown = false;
  let credentialService: CredentialService | null = null;

  // Graceful shutdown handler
  const shutdown = async () => {
    shuttingDown = true;
    process.exitCode = 0;
    console.log = origLog;
    console.error = origError;
    const log = logger ?? { log: origError, error: origError, close: () => {} };
    log.log("\n[mason agent --acp] Shutting down...");
    try {
      if (bridge) await bridge.stop();
    } catch { /* best-effort */ }
    try {
      if (credentialWsClient) credentialWsClient.disconnect();
    } catch { /* best-effort */ }
    try {
      if (credentialService) credentialService.close();
    } catch { /* best-effort */ }
    try { log.close(); } catch { /* best-effort */ }
    try {
      if (session) await session.stop();
    } catch { /* best-effort */ }
    process.exit(0);
  };

  const onSignal = () => void shutdown();
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    // ── Step 1: Resolve role from project directory ──────────────────
    const roleType = await resolveRoleFn(role, projectDir);
    const roleName = getAppShortName(roleType.metadata.name);

    // ── Step 2: Infer or override agent type ─────────────────────────
    const agentType = agentOverride ?? inferAgentType(roleType);

    // ── Step 3: Ensure docker build artifacts ────────────────────────
    const { dockerBuildDir, dockerDir } = await ensureDockerBuild(
      roleType, agentType, projectDir, { existsSyncFn: deps?.existsSyncFn },
    );

    // ── Create file logger in session-local logs ─────────────────────
    const sessionLogsDir = path.join(projectDir, ".mason", "logs");
    mkdirSync(sessionLogsDir, { recursive: true });
    const makeLogger = deps?.createLoggerFn ?? createFileLogger;
    logger = makeLogger(sessionLogsDir);

    // Flush buffered early output to the file logger.
    for (const args of earlyBuffer) { logger.log(...args); }
    earlyBuffer.length = 0;

    if (!deps?.createLoggerFn) {
      const fileLogger = logger;
      console.log = (...args: unknown[]) => fileLogger.log(...args);
      console.error = (...args: unknown[]) => fileLogger.error(...args);
    }

    // Ensure .mason is in project's .gitignore
    ensureGitignore(projectDir, ".mason");

    // ── Step 4: Resolve agent from role ──────────────────────────────
    logger.log(`[mason run --acp] Resolving role "${role}" for agent type "${agentType}"...`);
    const resolvedAgent = adaptRoleFn(roleType, agentType);

    // ── Step 5: Compute tool filters ─────────────────────────────────
    const toolFilters = computeToolFilters(resolvedAgent);
    const toolCount = Object.keys(toolFilters).length;

    // ── Step 5b: Collect env credentials ─────────────────────────────
    const envCredentials = collectEnvCredentials(resolvedAgent);
    const envCredCount = Object.keys(envCredentials).length;

    logger.log(`[mason agent --acp] Agent: ${resolvedAgent.name}`);
    logger.log(`[mason agent --acp] Role: ${roleName}`);
    logger.log(`[mason agent --acp] Tool filters: ${toolCount} app(s)`);
    if (envCredCount > 0) {
      logger.log(`[mason agent --acp] Env credentials: ${envCredCount} key(s) from process.env`);
    }

    // ── Step 6: Create session and start infrastructure ──────────────
    const runtime = resolvedAgent.runtimes[0] ?? "node";
    const agentPkg = getAgentFromRegistry(runtime);
    const acpRuntimeCmd = agentPkg?.acp?.command;
    const acpCommand = acpRuntimeCmd
      ? [...acpRuntimeCmd.split(" ").slice(1)]
      : undefined;

    const declaredCredentialKeys = new Set<string>(resolvedAgent.credentials);
    for (const agentRole of resolvedAgent.roles) {
      for (const app of agentRole.apps) {
        for (const key of app.credentials) {
          declaredCredentialKeys.add(key);
        }
      }
    }

    // dtg: investigate whay the credential keys are being passed here, would expect them to be 
    //.     accessed via the credential service only
    session = createSession({
      projectDir,
      agent: resolvedAgent.slug,
      role: roleName,
      proxyPort,
      acpCommand,
      credentialKeys: [...declaredCredentialKeys],
      dockerBuildDir,
      dockerDir,
    }, { logger });

    logger.log("[mason agent --acp] Starting infrastructure (proxy)...");
    const infraInfo = await session.startInfrastructure();
    logger.log(`[mason agent --acp] Infrastructure started (${infraInfo.sessionId})`);

    // ── Step 6b: Start credential service in-process ─────────────────
    logger.log("[mason agent --acp] Starting credential service (in-process)...");
    const startCredService = deps?.startCredentialServiceFn ?? defaultStartCredentialService;

    const credServiceHandle = await startCredService({
      proxyPort,
      credentialProxyToken: infraInfo.credentialProxyToken,
      envCredentials,
    });
    credentialWsClient = { disconnect: credServiceHandle.disconnect } as CredentialWSClient;
    credentialService = { close: credServiceHandle.close } as CredentialService;
    logger.log("[mason agent --acp] Credential service connected to proxy.");

    // ── Step 7: Create and start ACP SDK bridge ──────────────────────
    const logRef = logger;
    const sessionRef = session;

    bridge = createBridge({
      onSessionNew: async (cwd: string) => {
        logRef.log(`[mason agent --acp] session/new received — cwd: "${cwd}"`);

        const masonDir = path.join(cwd, ".mason");
        mkdirSync(masonDir, { recursive: true });

        ensureGitignore(cwd, ".mason");

        logRef.log("[mason agent --acp] Starting agent container...");
        const { child } = await sessionRef.startAgentProcess(cwd);
        logRef.log("[mason agent --acp] Agent process started.");

        return child;
      },
      logger,
    });

    // Start bridge with editor-facing streams (process stdin/stdout)
    const editorInput = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;
    const editorOutput = Writable.toWeb(process.stdout) as WritableStream<Uint8Array>;
    bridge.start(editorInput, editorOutput);

    logger.log(
      `\n[mason agent --acp] Ready -- stdio transport active\n` +
      `  Agent:      ${resolvedAgent.name}\n` +
      `  Role:       ${roleName}\n` +
      `  Proxy port: ${proxyPort}\n` +
      `  Mode:       deferred (agent starts on session/new)\n`,
    );

    // Keep process alive until the editor disconnects.
    await bridge.closed;

  } catch (error) {
    if (shuttingDown) return;

    console.log = origLog;
    console.error = origError;
    const message = error instanceof Error ? error.message : String(error);
    const log = logger ?? { log: origError, error: origError, close: () => {} };
    log.error(`\n[mason agent --acp] Failed: ${message}\n`);

    try { if (bridge) await bridge.stop(); } catch { /* best-effort */ }
    try { if (session) await session.stop(); } catch { /* best-effort */ }
    try { log.close(); } catch { /* best-effort */ }
    process.exit(1);
  }
}

// ── Default proxy health check ─────────────────────────────────────────

async function defaultWaitForProxyHealth(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return;
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`Proxy health endpoint did not become ready within ${timeoutMs}ms`);
}

// ── Default credential service startup ────────────────────────────────

async function defaultStartCredentialService(opts: {
  proxyPort: number;
  credentialProxyToken: string;
  envCredentials: Record<string, string>;
}): Promise<{ disconnect: () => void; close: () => void }> {
  const svc = new CredentialService({
    dbPath: ":memory:",
    keychainService: "mason",
  });
  const credCount = Object.keys(opts.envCredentials).length;
  if (credCount > 0) {
    svc.setSessionOverrides(opts.envCredentials);
  }
  const client = new CredentialWSClient(svc, {
    maxRetries: 60,
    retryDelayMs: 2000,
  });
  await client.connect(
    `ws://localhost:${opts.proxyPort}/ws/credentials`,
    opts.credentialProxyToken,
  );
  return { disconnect: () => client.disconnect(), close: () => svc.close() };
}
