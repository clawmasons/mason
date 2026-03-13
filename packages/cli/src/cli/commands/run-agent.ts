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
import { ACP_RUNTIME_COMMANDS } from "../../materializer/common.js";
import { getRegisteredAgentTypes } from "../../materializer/role-materializer.js";
import { AcpSession, type AcpSessionConfig, type AcpSessionDeps } from "../../acp/session.js";
import { AcpSdkBridge, type AcpSdkBridgeConfig } from "../../acp/bridge.js";
import { CredentialService, CredentialWSClient } from "@clawmasons/credential-service";
import { createFileLogger, type AcpLogger } from "../../acp/logger.js";
import { generateRoleDockerBuildDir } from "../../materializer/docker-generator.js";
import { ensureProxyDependencies } from "../../materializer/proxy-dependencies.js";

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
 * Map user-friendly agent type names to internal materializer registry names.
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
 * Checks aliases first, then the raw value against registered agent types.
 *
 * @returns The resolved agent type, or undefined if not recognized
 */
export function resolveAgentType(input: string): string | undefined {
  // Check alias first
  const aliased = AGENT_TYPE_ALIASES[input];
  if (aliased) return aliased;

  // Check if it's a direct registered agent type
  const registered = getRegisteredAgentTypes();
  if (registered.includes(input)) return input;

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
 *   .clawmasons/docker/{role}/
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
}): string {
  const { dockerBuildDir, dockerDir, projectDir, agent, role, logsDir, proxyToken, credentialProxyToken, proxyPort = 3000, roleMounts } = opts;

  // Proxy: context is dockerDir (has node_modules), dockerfile is role-specific
  const proxyDockerfile = path.relative(dockerDir, path.join(dockerBuildDir, "mcp-proxy", "Dockerfile"));
  // Agent: context is the agent-type subdirectory
  const agentContext = path.join(dockerBuildDir, agent);

  const proxyServiceName = `proxy-${role}`;
  const agentServiceName = `agent-${role}`;

  // Build agent volume lines: workspace mount + role-declared mounts
  const agentVolumeLines = [`      - "${projectDir}:/home/mason/workspace/project"`];
  for (const vol of resolveRoleMountVolumes(roleMounts)) {
    agentVolumeLines.push(`      - "${vol}"`);
  }

  return `# Generated by clawmasons run-agent
services:
  ${proxyServiceName}:
    build:
      context: "${dockerDir}"
      dockerfile: "${proxyDockerfile}"
    volumes:
      - "${projectDir}:/home/mason/workspace/project:ro"
      - "${logsDir}:/logs"
    environment:
      - CHAPTER_PROXY_TOKEN=${proxyToken}
      - CREDENTIAL_PROXY_TOKEN=${credentialProxyToken}
    ports:
      - "${proxyPort}:9090"
    restart: "no"

  ${agentServiceName}:
    build:
      context: "${agentContext}"
      dockerfile: Dockerfile
    volumes:
${agentVolumeLines.join("\n")}
    depends_on:
      - ${proxyServiceName}
    environment:
      - MCP_PROXY_TOKEN=${proxyToken}
      - MCP_PROXY_URL=http://${proxyServiceName}:9090
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
  opts?: { interactive?: boolean },
): Promise<number> {
  const baseArgs = ["compose", "-f", composeFile, ...args];
  const stdio = opts?.interactive ? "inherit" as const : "ignore" as const;

  return new Promise((resolve) => {
    const child = spawn("docker", baseArgs, { stdio });
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(1));
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
  deps?: { existsSyncFn?: (p: string) => boolean },
): Promise<{ dockerBuildDir: string; dockerDir: string }> {
  const existsSync = deps?.existsSyncFn ?? fs.existsSync;
  const roleName = getAppShortName(roleType.metadata.name);
  const dockerDir = path.join(projectDir, ".clawmasons", "docker");
  const dockerBuildDir = path.join(dockerDir, roleName);

  if (!existsSync(path.join(dockerBuildDir, agentType, "Dockerfile"))) {
    console.log(`\n  Docker artifacts not found. Building...`);

    // Ensure .clawmasons/.gitignore has docker/ entry
    const gitignorePath = path.join(projectDir, ".clawmasons", ".gitignore");
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

    console.log(`  Docker artifacts built at .clawmasons/docker/${roleName}/`);
  }

  return { dockerBuildDir, dockerDir };
}

// ── Help Text ─────────────────────────────────────────────────────────

export const RUN_ACP_AGENT_HELP_EPILOG = `
Command Syntax:
  clawmasons run --role <name>                      # infers agent type from role
  clawmasons run --role <name> --agent-type claude   # explicit agent type
  clawmasons run --role <name> --acp                 # ACP mode

Agent Types:
  claude (claude-code), codex, aider, pi (pi-coding-agent), mcp (mcp-agent)

Session Behavior:
  When an ACP client sends session/new with a "cwd" field, the agent
  container mounts that directory as /home/mason/workspace/project.
  Each session/new starts a fresh agent container; the proxy stays running.
  The credential service runs in-process on the host.

Side Effects:
  - Creates .clawmasons/ in the project for docker builds and session state
  - Appends ".clawmasons" to the project's .gitignore if present

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
    opts?: { interactive?: boolean },
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
      agentType?: string;
      role?: string;
      proxyPort: string;
    },
  ) => {
    const agentTypeInput = positionalAgentType ?? options.agentType;
    const role = options.role;

    if (!role) {
      console.error("\n  --role <name> is required.\n  Usage: clawmasons run --role <name> [--agent-type <type>]\n");
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

    if (options.acp) {
      await runAgent(process.cwd(), resolvedAgentType, role, undefined, {
        acp: true,
        proxyPort: parseInt(options.proxyPort, 10),
      });
    } else {
      await runAgent(process.cwd(), resolvedAgentType, role);
    }
  };
}

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run a role on the specified agent runtime")
    .argument("[agent-type]", "Agent runtime type (e.g., claude, codex, aider, pi, mcp)")
    .option("--acp", "Start in ACP mode for editor integration")
    .option("--role <name>", "Role name to run (required)")
    .option("--agent-type <name>", "Agent type (alternative to positional argument, overrides inference)")
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
  },
): Promise<void> {
  const isAcpMode = acpOptions?.acp === true;
  const proxyPort = acpOptions?.proxyPort ?? 3000;

  if (isAcpMode) {
    return runAgentAcpMode(projectDir, agent, role, proxyPort, deps);
  } else {
    return runAgentInteractiveMode(projectDir, agent, role, proxyPort, deps);
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
): Promise<void> {
  const execCompose = deps?.execComposeFn ?? execComposeCommand;
  const checkDocker = deps?.checkDockerComposeFn ?? checkDockerCompose;
  const ensureGitignore = deps?.ensureGitignoreEntryFn ?? ensureGitignoreEntry;
  const startCredService = deps?.startCredentialServiceFn ?? defaultStartCredentialService;
  const resolveRoleFn = deps?.resolveRoleFn ?? defaultResolveRole;

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
      roleType, agentType, projectDir, { existsSyncFn: deps?.existsSyncFn },
    );

    // 5. Ensure .clawmasons is in project's .gitignore
    ensureGitignore(projectDir, ".clawmasons");

    // 6. Generate session ID and create session directory
    const sessionId = (deps?.generateSessionIdFn ?? generateSessionId)();
    const sessionDir = path.join(projectDir, ".clawmasons", "sessions", sessionId);
    const dockerSessionDir = path.join(sessionDir, "docker");
    fs.mkdirSync(dockerSessionDir, { recursive: true });

    const logsDir = path.join(sessionDir, "logs");
    fs.mkdirSync(logsDir, { recursive: true });

    console.log(`  Session: ${sessionId}`);

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
    });

    const composeFile = path.join(dockerSessionDir, "docker-compose.yml");
    fs.writeFileSync(composeFile, composeContent);
    console.log(`  Compose: .clawmasons/sessions/${sessionId}/docker/docker-compose.yml`);

    // 8. Start proxy detached
    const proxyServiceName = `proxy-${roleName}`;
    console.log(`\n  Starting proxy (${proxyServiceName})...`);

    const proxyCode = await execCompose(
      composeFile,
      ["up", "-d", proxyServiceName],
    );
    if (proxyCode !== 0) {
      throw new Error(`Failed to start proxy (exit code ${proxyCode}).`);
    }
    console.log(`  Proxy started in background.`);

    // 9. Start credential service in-process
    console.log(`  Starting credential service (in-process)...`);

    let credServiceHandle: { disconnect: () => void; close: () => void } | null = null;
    try {
      credServiceHandle = await startCredService({
        proxyPort,
        credentialProxyToken,
        envCredentials: {},
      });
      console.log(`  Credential service connected to proxy.`);
    } catch (err) {
      throw new Error(`Failed to start credential service: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 10. Start agent interactively
    const agentServiceName = `agent-${roleName}`;
    console.log(`  Starting agent (${agentServiceName})...\n`);

    const agentCode = await execCompose(
      composeFile,
      ["run", "--rm", "--service-ports", agentServiceName],
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

    await execCompose(composeFile, ["down"]);

    console.log(`  Services stopped.`);
    console.log(`  Session retained at: .clawmasons/sessions/${sessionId}/`);
    console.log(`\n  agent complete\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  agent failed: ${message}\n`);
    process.exit(1);
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
    log.log("\n[clawmasons agent --acp] Shutting down...");
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
    const sessionLogsDir = path.join(projectDir, ".clawmasons", "logs");
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

    // Ensure .clawmasons is in project's .gitignore
    ensureGitignore(projectDir, ".clawmasons");

    // ── Step 4: Resolve agent from role ──────────────────────────────
    logger.log(`[clawmasons run --acp] Resolving role "${role}" for agent type "${agentType}"...`);
    const resolvedAgent = adaptRoleFn(roleType, agentType);

    // ── Step 5: Compute tool filters ─────────────────────────────────
    const toolFilters = computeToolFilters(resolvedAgent);
    const toolCount = Object.keys(toolFilters).length;

    // ── Step 5b: Collect env credentials ─────────────────────────────
    const envCredentials = collectEnvCredentials(resolvedAgent);
    const envCredCount = Object.keys(envCredentials).length;

    logger.log(`[clawmasons agent --acp] Agent: ${resolvedAgent.name}`);
    logger.log(`[clawmasons agent --acp] Role: ${roleName}`);
    logger.log(`[clawmasons agent --acp] Tool filters: ${toolCount} app(s)`);
    if (envCredCount > 0) {
      logger.log(`[clawmasons agent --acp] Env credentials: ${envCredCount} key(s) from process.env`);
    }

    // ── Step 6: Create session and start infrastructure ──────────────
    const runtime = resolvedAgent.runtimes[0] ?? "node";
    const acpRuntimeCmd = ACP_RUNTIME_COMMANDS[runtime];
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

    logger.log("[clawmasons agent --acp] Starting infrastructure (proxy)...");
    const infraInfo = await session.startInfrastructure();
    logger.log(`[clawmasons agent --acp] Infrastructure started (${infraInfo.sessionId})`);

    // ── Step 6b: Start credential service in-process ─────────────────
    logger.log("[clawmasons agent --acp] Starting credential service (in-process)...");
    const startCredService = deps?.startCredentialServiceFn ?? defaultStartCredentialService;

    const credServiceHandle = await startCredService({
      proxyPort,
      credentialProxyToken: infraInfo.credentialProxyToken,
      envCredentials,
    });
    credentialWsClient = { disconnect: credServiceHandle.disconnect } as CredentialWSClient;
    credentialService = { close: credServiceHandle.close } as CredentialService;
    logger.log("[clawmasons agent --acp] Credential service connected to proxy.");

    // ── Step 7: Create and start ACP SDK bridge ──────────────────────
    const logRef = logger;
    const sessionRef = session;

    bridge = createBridge({
      onSessionNew: async (cwd: string) => {
        logRef.log(`[clawmasons agent --acp] session/new received — cwd: "${cwd}"`);

        const clawmasonsDir = path.join(cwd, ".clawmasons");
        mkdirSync(clawmasonsDir, { recursive: true });

        ensureGitignore(cwd, ".clawmasons");

        logRef.log("[clawmasons agent --acp] Starting agent container...");
        const { child } = await sessionRef.startAgentProcess(cwd);
        logRef.log("[clawmasons agent --acp] Agent process started.");

        return child;
      },
      logger,
    });

    // Start bridge with editor-facing streams (process stdin/stdout)
    const editorInput = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;
    const editorOutput = Writable.toWeb(process.stdout) as WritableStream<Uint8Array>;
    bridge.start(editorInput, editorOutput);

    logger.log(
      `\n[clawmasons agent --acp] Ready -- stdio transport active\n` +
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
    log.error(`\n[clawmasons agent --acp] Failed: ${message}\n`);

    try { if (bridge) await bridge.stop(); } catch { /* best-effort */ }
    try { if (session) await session.stop(); } catch { /* best-effort */ }
    try { log.close(); } catch { /* best-effort */ }
    process.exit(1);
  }
}

// ── Default credential service startup ────────────────────────────────

async function defaultStartCredentialService(opts: {
  proxyPort: number;
  credentialProxyToken: string;
  envCredentials: Record<string, string>;
}): Promise<{ disconnect: () => void; close: () => void }> {
  const svc = new CredentialService({
    dbPath: ":memory:",
    keychainService: "clawmasons",
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
