import type { Command } from "commander";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Readable, Writable } from "node:stream";
import { spawn } from "node:child_process";
import { checkDockerCompose } from "./docker-utils.js";
import { ensureGitignoreEntry } from "../../runtime/gitignore.js";
import type { ResolvedAgent, ResolvedApp, Role } from "@clawmasons/shared";
import { computeToolFilters, resolveRole as resolveRoleByName, adaptRoleToResolvedAgent, getAppShortName } from "@clawmasons/shared";
import { getRegisteredAgentTypes, getAgentFromRegistry, initRegistry } from "../../materializer/role-materializer.js";
import { loadConfigAgentEntry, loadConfigAliasEntry } from "@clawmasons/agent-sdk";
import { AcpSession, type AcpSessionConfig, type AcpSessionDeps } from "../../acp/session.js";
import { AcpSdkBridge, type AcpSdkBridgeConfig } from "../../acp/bridge.js";
import { HostProxy } from "@clawmasons/proxy";
import { createFileLogger, type AcpLogger } from "../../acp/logger.js";
import { generateRoleDockerBuildDir, createSessionDirectory, getHostIds } from "../../materializer/docker-generator.js";
import { ensureProxyDependencies, synthesizeRolePackages } from "../../materializer/proxy-dependencies.js";

// ── Local type alias (mirrors DevContainerCustomizations from agent-sdk) ──────
type DevContainerCustomizations = { vscode?: { extensions?: string[]; settings?: Record<string, unknown> } };

// ── Role-based Agent Resolution ───────────────────────────────────────

/**
 * Resolve a Role from a role name in the project directory.
 */
async function defaultResolveRole(
  roleName: string,
  projectDir: string,
): Promise<Role> {
  return resolveRoleByName(roleName, projectDir);
}

/**
 * Resolve a ResolvedAgent from a Role and agent type.
 */
function defaultAdaptRole(
  roleType: Role,
  agentType: string,
): ResolvedAgent {
  return adaptRoleToResolvedAgent(roleType, agentType);
}

/**
 * Infer the agent type from a Role's source dialect.
 * Falls back to "claude-code-agent" if not determinable.
 */
export function inferAgentType(roleType: Role): string {
  const dialect = roleType.source.agentDialect;
  // "mason" is the agent-agnostic canonical location — default to claude-code-agent
  if (!dialect || dialect === "mason") return "claude-code-agent";
  return dialect;
}

// ── Types ──────────────────────────────────────────────────────────────

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
  claude: "claude-code-agent",
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

// ── OCI Restart Policy ───────────────────────────────────────────────

const OCI_RESTART_MAX = 3;
const OCI_RESTART_DELAY_MS = 2000;

/**
 * Run `docker compose run` interactively while capturing stderr for OCI detection.
 * stdin and stdout are inherited (interactive); stderr is piped and tee'd to process.stderr.
 * Returns { code, stderr }.
 */
export function execComposeRunWithStderr(
  composeFile: string,
  args: string[],
): Promise<{ code: number; stderr: string }> {
  const baseArgs = ["compose", "-f", composeFile, ...args];
  return new Promise((resolve) => {
    const child = spawn("docker", baseArgs, {
      stdio: ["inherit", "inherit", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("close", (code) => resolve({ code: code ?? 0, stderr }));
    child.on("error", () => resolve({ code: 1, stderr }));
  });
}

/**
 * Collect single-file volume bind-mount host paths from a compose YAML string.
 * Returns paths where the host side resolves to a regular file (not a directory).
 */
export function collectSingleFileMounts(composeYaml: string, baseDir: string): string[] {
  const singleFiles: string[] = [];
  // Match volume lines of the form: - <hostPath>:<containerPath>[:<options>]
  const volumeLineRe = /^\s*-\s+([^:]+):[^:]/gm;
  let match: RegExpExecArray | null;
  while ((match = volumeLineRe.exec(composeYaml)) !== null) {
    const hostPart = match[1].trim();
    // Skip named volumes (no path separator)
    if (!hostPart.includes("/") && !hostPart.startsWith(".")) continue;
    const resolved = path.resolve(baseDir, hostPart);
    try {
      const stat = fs.statSync(resolved);
      if (stat.isFile()) {
        singleFiles.push(hostPart);
      }
    } catch { /* path doesn't exist — skip */ }
  }
  return singleFiles;
}

/**
 * Run the agent container with OCI-gated restart policy.
 * Restarts only when output contains "OCI runtime", with a 2s pause and max 3 attempts.
 * Prints single-file mount paths on restart with a recommendation.
 */
export async function runAgentWithOciRestart(
  composeFile: string,
  runArgs: string[],
): Promise<number> {
  let attempts = 0;
  while (true) {
    const { code, stderr } = await execComposeRunWithStderr(composeFile, runArgs);
    if (code === 0) return 0;

    const isOciError = stderr.includes("OCI runtime");
    if (!isOciError || attempts >= OCI_RESTART_MAX) {
      if (attempts >= OCI_RESTART_MAX) {
        console.error(`\n  Max OCI restart attempts (${OCI_RESTART_MAX}) reached. Giving up.`);
      }
      return code;
    }

    attempts++;

    // Show single-file mount warning
    try {
      const composeYaml = fs.readFileSync(composeFile, "utf-8");
      const composeDir = path.dirname(composeFile);
      const singleFiles = collectSingleFileMounts(composeYaml, composeDir);
      if (singleFiles.length > 0) {
        console.error(`\n  OCI runtime error detected (attempt ${attempts}/${OCI_RESTART_MAX}). Retrying in ${OCI_RESTART_DELAY_MS / 1000}s...`);
        console.error(`\n  Single-file mounts detected (these can cause mount ordering races):`);
        for (const f of singleFiles) {
          console.error(`    - ${f}`);
        }
        console.error(`  Recommendation: move these files into a directory and mount the directory instead.`);
      } else {
        console.error(`\n  OCI runtime error detected (attempt ${attempts}/${OCI_RESTART_MAX}). Retrying in ${OCI_RESTART_DELAY_MS / 1000}s...`);
      }
    } catch { /* best-effort */ }

    await new Promise((r) => setTimeout(r, OCI_RESTART_DELAY_MS));
  }
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
  roleType: Role,
  agentType: string,
  projectDir: string,
  deps?: { existsSyncFn?: (p: string) => boolean; forceRebuild?: boolean; devContainerCustomizations?: DevContainerCustomizations; agentConfigCredentials?: string[]; agentArgs?: string[]; initialPrompt?: string },
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

  // Compute hash of container.packages to detect changes since last build
  const packagesHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(roleType.container?.packages ?? {}))
    .digest("hex");
  const hashFilePath = path.join(dockerBuildDir, agentType, ".packages-hash");

  // If the Dockerfile exists but packages have changed, invalidate the build dir
  if (existsSync(path.join(dockerBuildDir, agentType, "Dockerfile"))) {
    const storedHash = existsSync(hashFilePath)
      ? fs.readFileSync(hashFilePath, "utf-8").trim()
      : null;
    if (storedHash !== packagesHash) {
      console.log(`\n  Detected container.packages change. Rebuilding Docker artifacts...`);
      fs.rmSync(dockerBuildDir, { recursive: true, force: true });
    }
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
      devContainerCustomizations: deps?.devContainerCustomizations,
      agentConfigCredentials: deps?.agentConfigCredentials,
      agentArgs: deps?.agentArgs,
    });

    // Populate shared proxy dependencies
    ensureProxyDependencies(dockerDir, projectDir);

    // Synthesize inline app/role packages (e.g. mcp_servers from ROLE.md)
    synthesizeRolePackages(roleType, dockerDir);

    // Create per-role cache directory for NODE_COMPILE_CACHE and NPM_CONFIG_CACHE
    fs.mkdirSync(path.join(dockerBuildDir, "mcp-proxy", ".cache"), { recursive: true });

    // Write packages hash so future runs can detect changes
    fs.writeFileSync(hashFilePath, packagesHash);

    console.log(`  Docker artifacts built at .mason/docker/${roleName}/`);
  }

  return { dockerBuildDir, dockerDir };
}

// ── Help Text ─────────────────────────────────────────────────────────

export const RUN_ACP_AGENT_HELP_EPILOG = `
Command Syntax:
  mason run --role <name>                    # infers agent from role dialect
  mason run --role <name> --agent claude     # explicit agent (renamed from --agent-type)
  mason run --role <name> --acp              # ACP mode
  mason claude --role <name>                 # shorthand (config-declared or built-in agent)

  --agent <name>   Agent name from .mason/config.json or built-in alias.
                   Config entry can supply defaults for --role, --home, and mode.
  --home <path>    Bind-mount <path> over /home/mason/ in the agent container.
                   Overrides the "home" property in .mason/config.json.
  --terminal       Force terminal (interactive) mode, overriding config mode.
  --acp            Start in ACP mode (overrides config mode).
  --bash           Launch bash shell (overrides config mode).

Agent Types (built-in):
  claude (claude-code-agent), pi (pi-coding-agent), mcp (mcp-agent)

Session Behavior:
  When an ACP client sends session/new with a "cwd" field, the agent
  container mounts that directory as /home/mason/workspace/project.
  Each session/new starts a fresh agent container; the proxy stays running.
  The credential service runs in-process on the host.

Side Effects:
  - Creates .mason/ in the project for docker builds and session state
  - Appends ".mason" to the project's .gitignore if present
  - Creates .mason/config.json from a default template if absent and
    an agent name is provided

  Credential env vars (e.g. OPEN_ROUTER_KEY, ANTHROPIC_API_KEY) are
  passed through to the credential-service when set in the client's
  env block.
`;

// ── Config Auto-Init ──────────────────────────────────────────────────

const DEFAULT_MASON_CONFIG = JSON.stringify(
  {
    agents: {
      claude: { package: "@clawmasons/claude-code-agent" },
      "pi-mono-agent": { package: "@clawmasons/pi-mono-agent" },
      mcp: { package: "@clawmasons/mcp-agent" },
    },
  },
  null,
  2,
);

/**
 * Create .mason/config.json from the default template if it does not exist.
 * Only called when an agent name is provided on the command line.
 */
export function ensureMasonConfig(projectDir: string): void {
  const masonDir = path.join(projectDir, ".mason");
  const configPath = path.join(masonDir, "config.json");
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(masonDir, { recursive: true });
    fs.writeFileSync(configPath, DEFAULT_MASON_CONFIG + "\n");
    console.error(`  Created .mason/config.json with default agent configuration.`);
  }
}

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
  resolveRoleFn?: (roleName: string, projectDir: string) => Promise<Role>;
  /** Override agent adaptation (for testing). */
  adaptRoleFn?: (roleType: Role, agentType: string) => ResolvedAgent;
  /** Override AcpSession construction (for testing, ACP mode). */
  createSessionFn?: (config: AcpSessionConfig, sessionDeps?: AcpSessionDeps) => AcpSession;
  /** Override AcpSdkBridge construction (for testing, ACP mode). */
  createBridgeFn?: (config: AcpSdkBridgeConfig) => AcpSdkBridge;
  /** Override fs.mkdirSync (for testing). */
  mkdirSyncFn?: (dirPath: string, options?: { recursive?: boolean }) => void;
  /** Override fs.existsSync (for testing). */
  existsSyncFn?: (filePath: string) => boolean;
  /** Override the agent run function (for testing). When set, bypasses OCI restart logic. */
  runAgentFn?: (composeFile: string, args: string[]) => Promise<number>;
  /** Override host proxy startup (for testing). */
  startHostProxyFn?: (opts: {
    proxyPort: number;
    relayToken: string;
    envCredentials: Record<string, string>;
    hostApps?: ResolvedApp[];
  }) => Promise<{ stop: () => Promise<void> }>;
  /** Override proxy health check (for testing). */
  waitForProxyHealthFn?: (url: string, timeoutMs: number) => Promise<void>;
  /** Override logger creation (for testing, ACP mode). */
  createLoggerFn?: (logDir: string) => AcpLogger;
  /** Override home path (for testing). */
  homeOverride?: string;
}

// ── Backward-compat aliases ───────────────────────────────────────────
export type RunAcpAgentDeps = RunAgentDeps;

// ── Command Registration ──────────────────────────────────────────────

/**
 * Expand a leading ~ in a path to the user's home directory.
 */
function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Create the action handler for the `run` command.
 */
function createRunAction(overrideRole?: string, overridePrompt?: string) {
  return async (
    positionalAgent: string | undefined,
    positionalPrompt: string | undefined,
    options: {
      acp?: boolean;
      bash?: boolean;
      terminal?: boolean;
      build?: boolean;
      verbose?: boolean;
      proxyOnly?: boolean;
      devContainer?: boolean;
      agent?: string;
      role?: string;
      home?: string;
      proxyPort: string;
    },
  ) => {
    // Disambiguate positional args:
    // - When --agent is set AND positionalAgent is also set, treat positionalAgent as prompt
    // - Otherwise positionalAgent is the agent name and positionalPrompt is the prompt
    let agentPositional: string | undefined;
    let promptPositional: string | undefined;
    if (options.agent && positionalAgent) {
      agentPositional = undefined;
      promptPositional = positionalAgent;
    } else {
      agentPositional = positionalAgent;
      promptPositional = positionalPrompt;
    }

    const agentInput = agentPositional ?? options.agent;
    const initialPrompt = promptPositional ?? overridePrompt;
    const projectDir = process.cwd();

    // Auto-init .mason/config.json when an agent name is provided
    if (agentInput) {
      ensureMasonConfig(projectDir);
    }

    // Alias resolution: check aliases first (alias takes precedence over agent name)
    const aliasEntry = agentInput ? loadConfigAliasEntry(projectDir, agentInput) : undefined;
    if (aliasEntry) {
      // Warn if the alias name collides with an agent key
      const directAgentEntry = agentInput ? loadConfigAgentEntry(projectDir, agentInput) : undefined;
      if (directAgentEntry) {
        console.warn(`[config] Alias "${agentInput}" shadows agent name "${agentInput}". The alias will be used.`);
      }
    }

    // Effective agent name: from alias reference, or the direct input
    const effectiveAgentInput = aliasEntry ? aliasEntry.agent : agentInput;

    // Runtime config: alias fields take precedence, fall back to agent config entry (deprecated)
    const configEntry = aliasEntry ?? (agentInput ? loadConfigAgentEntry(projectDir, agentInput) : undefined);

    // Derive effective role: override (for configure) > --role flag > config role > error
    const role = overrideRole ?? options.role ?? configEntry?.role;
    if (!role) {
      console.error(
        "\n  --role <name> is required (or set \"role\" in .mason/config.json for this agent or alias).\n" +
        "  Usage: mason run --role <name> [--agent <name>]\n",
      );
      process.exit(1);
      return;
    }

    if (options.bash && options.acp) {
      console.error("\n  --bash and --acp are mutually exclusive.\n");
      process.exit(1);
      return;
    }

    // Derive effective mode: explicit flags > config mode > terminal (default)
    const effectiveAcp =
      options.acp ||
      (!options.bash && !options.terminal && configEntry?.mode === "acp");
    const effectiveBash =
      options.bash ||
      (!options.acp && !options.terminal && configEntry?.mode === "bash");

    // Resolve agent type from effective agent name (after alias resolution)
    let resolvedAgentType: string | undefined;
    if (effectiveAgentInput) {
      resolvedAgentType = resolveAgentType(effectiveAgentInput);
      if (!resolvedAgentType) {
        const known = getKnownAgentTypeNames().join(", ");
        console.error(`\n  Unknown agent "${effectiveAgentInput}".\n  Available agents: ${known}\n`);
        process.exit(1);
        return;
      }
    }

    // Derive effective home: --home flag > config home > undefined
    let homeOverride: string | undefined;
    const rawHome = options.home ?? configEntry?.home;
    if (rawHome) {
      homeOverride = expandHome(rawHome);
      if (!fs.existsSync(homeOverride)) {
        console.warn(`  Warning: agent home path "${rawHome}" does not exist. The mount will be empty.`);
      }
    }

    // agent-args from alias config (undefined if not an alias or no agent-args set)
    const agentArgs = aliasEntry?.agentArgs;

    if (options.proxyOnly) {
      await runProxyOnly(projectDir, resolvedAgentType, role, parseInt(options.proxyPort, 10));
    } else if (effectiveAcp) {
      await runAgent(projectDir, resolvedAgentType, role, undefined, {
        acp: true,
        proxyPort: parseInt(options.proxyPort, 10),
        homeOverride,
        agentConfigCredentials: configEntry?.credentials,
        agentArgs,
        // initialPrompt intentionally omitted for ACP mode
      });
    } else if (options.devContainer) {
      await runAgent(projectDir, resolvedAgentType, role, undefined, {
        devContainer: true,
        proxyPort: parseInt(options.proxyPort, 10),
        build: options.build,
        verbose: options.verbose,
        homeOverride,
        devContainerCustomizations: (configEntry as { devContainerCustomizations?: DevContainerCustomizations } | undefined)?.devContainerCustomizations,
        agentConfigCredentials: configEntry?.credentials,
        agentArgs,
        initialPrompt,
      });
    } else {
      await runAgent(projectDir, resolvedAgentType, role, undefined, {
        proxyPort: parseInt(options.proxyPort, 10),
        bash: effectiveBash,
        build: options.build,
        verbose: options.verbose,
        homeOverride,
        agentConfigCredentials: configEntry?.credentials,
        agentArgs,
        initialPrompt,
      });
    }
  };
}

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run a role on the specified agent runtime")
    .argument("[agent]", "Agent name from config or built-in type (e.g., claude, pi, mcp)")
    .argument("[prompt]", "Initial prompt passed to the agent as the first message")
    .option("--acp", "Start in ACP mode for editor integration")
    .option("--bash", "Launch bash shell instead of the agent (for debugging)")
    .option("--terminal", "Force terminal (interactive) mode, overriding config mode")
    .option("--build", "Force rebuild Docker images before running")
    .option("--role <name>", "Role name to run")
    .option("--agent <name>", "Agent name from .mason/config.json or built-in alias")
    .option("--home <path>", "Bind-mount path over /home/mason/ in the agent container")
    .option("--dev-container", "Start in dev-container mode: print IDE attach instructions and optionally launch VSCode")
    .option("--proxy-only", "Start proxy infrastructure only, output connection info as JSON")
    .option("--verbose", "Show Docker build and compose output")
    .option("--proxy-port <number>", "Internal proxy port (default: 3000)", "3000")
    .addHelpText("after", RUN_ACP_AGENT_HELP_EPILOG)
    .action(createRunAction());
}

const CONFIGURE_ROLE = "@clawmasons/role-configure-project";
const CONFIGURE_PROMPT = "create and implement role plan";

export function registerConfigureCommand(program: Command): void {
  program
    .command("configure")
    .description("Configure a project for mason (alias for run with the configure-project role)")
    .argument("[agent]", "Agent name from config or built-in type (e.g., claude, pi, mcp)")
    .argument("[prompt]", "Initial prompt (defaults to \"create and implement role plan\")")
    .option("--acp", "Start in ACP mode for editor integration")
    .option("--bash", "Launch bash shell instead of the agent (for debugging)")
    .option("--terminal", "Force terminal (interactive) mode, overriding config mode")
    .option("--build", "Force rebuild Docker images before running")
    .option("--agent <name>", "Agent name from .mason/config.json or built-in alias")
    .option("--home <path>", "Bind-mount path over /home/mason/ in the agent container")
    .option("--dev-container", "Start in dev-container mode: print IDE attach instructions and optionally launch VSCode")
    .option("--proxy-only", "Start proxy infrastructure only, output connection info as JSON")
    .option("--verbose", "Show Docker build and compose output")
    .option("--proxy-port <number>", "Internal proxy port (default: 3000)", "3000")
    .action(createRunAction(CONFIGURE_ROLE, CONFIGURE_PROMPT));
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
    homeOverride?: string;
    devContainer?: boolean;
    devContainerCustomizations?: DevContainerCustomizations;
    agentConfigCredentials?: string[];
    agentArgs?: string[];
    initialPrompt?: string;
  },
): Promise<void> {
  // Initialize agent registry with config-declared agents from .mason/config.json
  await initRegistry(projectDir);

  const isAcpMode = acpOptions?.acp === true;
  const isDevContainerMode = acpOptions?.devContainer === true;
  const proxyPort = acpOptions?.proxyPort ?? 3000;
  const bashMode = acpOptions?.bash === true;
  const buildMode = acpOptions?.build === true;
  const homeOverride = deps?.homeOverride ?? acpOptions?.homeOverride;
  const agentConfigCredentials = acpOptions?.agentConfigCredentials;
  const agentArgs = acpOptions?.agentArgs;
  const initialPrompt = acpOptions?.initialPrompt;

  if (isAcpMode) {
    return runAgentAcpMode(projectDir, agent, role, proxyPort, deps, homeOverride, agentConfigCredentials, agentArgs);
  } else if (isDevContainerMode) {
    const verbose = acpOptions?.verbose === true;
    return runAgentDevContainerMode(
      projectDir, agent, role, proxyPort, deps, buildMode, verbose, homeOverride,
      acpOptions?.devContainerCustomizations,
      agentConfigCredentials,
      agentArgs,
      initialPrompt,
    );
  } else {
    const verbose = acpOptions?.verbose === true;
    return runAgentInteractiveMode(projectDir, agent, role, proxyPort, deps, bashMode, buildMode, verbose, homeOverride, agentConfigCredentials, agentArgs, initialPrompt);
  }
}

// ── Shared Helpers ────────────────────────────────────────────────────

/**
 * Collect declared credential keys from SDK defaults, agent config, role governance, and app-level.
 */
function collectDeclaredCredentialKeys(
  agentType: string,
  agentConfigCredentials: string[] | undefined,
  roleType: Role,
): string[] {
  const agentPkg = getAgentFromRegistry(agentType);
  const sdkCredKeys = agentPkg?.runtime?.credentials?.map((c) => c.key) ?? [];
  const keys = [...sdkCredKeys, ...(agentConfigCredentials ?? []), ...(roleType.governance?.credentials ?? [])];
  for (const app of roleType.apps ?? []) {
    for (const key of app.credentials ?? []) {
      if (!keys.includes(key)) {
        keys.push(key);
      }
    }
  }
  return keys;
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
  homeOverride?: string,
  agentConfigCredentials?: string[],
  agentArgs?: string[],
  initialPrompt?: string,
): Promise<void> {
  const execCompose = deps?.execComposeFn ?? execComposeCommand;
  const runAgent = deps?.runAgentFn ?? runAgentWithOciRestart;
  const checkDocker = deps?.checkDockerComposeFn ?? checkDockerCompose;
  const ensureGitignore = deps?.ensureGitignoreEntryFn ?? ensureGitignoreEntry;
  const startHostProxy = deps?.startHostProxyFn ?? defaultStartHostProxy;
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
    console.log(`  Role: ${roleName} (${roleType.type})`);

    // 4. Ensure docker build artifacts exist (auto-build if missing)
    const { dockerBuildDir, dockerDir } = await ensureDockerBuild(
      roleType, agentType, projectDir, { existsSyncFn: deps?.existsSyncFn, forceRebuild: buildMode, agentConfigCredentials, agentArgs, initialPrompt },
    );

    // 5. Ensure .mason is in project's .gitignore
    ensureGitignore(projectDir, ".mason");

    // 6. Create session directory with compose file
    const { uid, gid } = getHostIds();
    const declaredCredentialKeys = collectDeclaredCredentialKeys(agentType, agentConfigCredentials, roleType);
    const sessionIdOverride = (deps?.generateSessionIdFn ?? generateSessionId)();
    const session = createSessionDirectory({
      projectDir,
      dockerBuildDir,
      dockerDir,
      role: roleType,
      agentType,
      agentName: roleName,
      proxyPort,
      roleMounts: roleType.container?.mounts,
      credentialKeys: declaredCredentialKeys,
      hostUid: uid,
      hostGid: gid,
      homeOverride,
      bashMode,
      verbose,
      sessionId: sessionIdOverride,
    });

    const { sessionId, composeFile, relayToken, proxyServiceName, agentServiceName } = session;
    console.log(`  Session: ${sessionId}`);
    console.log(`  Compose: .mason/sessions/${sessionId}/docker-compose.yaml`);

    // 7. Build and start proxy detached
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

    // 9. Collect env credentials, partition apps, and start host proxy in-process
    const adaptRoleFn = deps?.adaptRoleFn ?? defaultAdaptRole;
    const resolvedAgent = adaptRoleFn(roleType, agentType);
    const envCredentials = collectEnvCredentials(resolvedAgent);
    const hostApps = resolvedAgent.roles.flatMap((r) => r.apps).filter((a) => a.location === "host");

    console.log(`  Starting host proxy (in-process)...`);

    let hostProxyHandle: { stop: () => Promise<void> } | null = null;
    try {
      hostProxyHandle = await startHostProxy({
        proxyPort,
        relayToken,
        envCredentials,
        hostApps: hostApps.length > 0 ? hostApps : undefined,
      });
      console.log(`  Host proxy connected to Docker proxy.`);
    } catch (err) {
      throw new Error(`Failed to start host proxy: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 10. Start agent interactively
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

    const agentCode = await runAgent(composeFile, runArgs);

    // 11. Tear down all containers on agent exit
    console.log(`\n  Agent exited (code ${agentCode}). Tearing down services...`);

    try {
      if (hostProxyHandle) {
        await hostProxyHandle.stop();
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

// ── Dev-Container Mode ────────────────────────────────────────────────

/**
 * Build a VSCode attached-container URI for the given docker compose project and service.
 * Hex-encodes JSON config using Buffer (no shell dependency).
 */
export function buildVscodeAttachUri(containerName: string, workspacePath: string): string {
  const config = JSON.stringify({ containerName: `/${containerName}` });
  const hex = Buffer.from(config).toString("hex");
  return `vscode-remote://attached-container+${hex}${workspacePath}`;
}

/**
 * Derive the docker container name from a compose project name and service name.
 * Docker compose names containers as: <project>-<service>-<index>
 */
export function deriveContainerName(composeName: string, serviceShortName: string): string {
  return `${composeName}-${serviceShortName}-1`;
}

async function runAgentDevContainerMode(
  projectDir: string,
  agentOverride: string | undefined,
  role: string,
  proxyPort: number,
  deps?: RunAgentDeps,
  buildMode?: boolean,
  verbose?: boolean,
  homeOverride?: string,
  devContainerCustomizations?: DevContainerCustomizations,
  agentConfigCredentials?: string[],
  agentArgs?: string[],
  initialPrompt?: string,
): Promise<void> {
  const execCompose = deps?.execComposeFn ?? execComposeCommand;
  const checkDocker = deps?.checkDockerComposeFn ?? checkDockerCompose;
  const ensureGitignore = deps?.ensureGitignoreEntryFn ?? ensureGitignoreEntry;
  const startHostProxy = deps?.startHostProxyFn ?? defaultStartHostProxy;
  const resolveRoleFn = deps?.resolveRoleFn ?? defaultResolveRole;
  const waitForProxyHealth = deps?.waitForProxyHealthFn ?? defaultWaitForProxyHealth;
  const adaptRoleFn = deps?.adaptRoleFn ?? defaultAdaptRole;

  try {
    // 1. Pre-flight
    checkDocker();

    // 2. Resolve role
    const roleType = await resolveRoleFn(role, projectDir);
    const roleName = getAppShortName(roleType.metadata.name);
    const agentType = agentOverride ?? inferAgentType(roleType);

    console.log(`\n  Agent: ${agentType}`);
    console.log(`  Role: ${roleName}`);
    console.log(`  Mode: dev-container`);

    // 3. Ensure docker build artifacts
    const { dockerBuildDir, dockerDir } = await ensureDockerBuild(
      roleType, agentType, projectDir,
      { existsSyncFn: deps?.existsSyncFn, forceRebuild: buildMode, devContainerCustomizations, agentConfigCredentials, agentArgs, initialPrompt },
    );

    // 4. Ensure .mason is in .gitignore
    ensureGitignore(projectDir, ".mason");

    // 5. Create vscode-server persistent directory and write static server-env-setup
    const vscodeServerHostPath = path.join(projectDir, ".mason", "docker", "vscode-server");
    fs.mkdirSync(vscodeServerHostPath, { recursive: true });

    const serverEnvSetupPath = path.join(vscodeServerHostPath, "server-env-setup");
    const serverEnvSetupContent = [
      "#!/bin/sh",
      "_LOG=/logs/server-env-setup.log",
      `echo "[$(date -u +%H:%M:%S)] server-env-setup: MCP_PROXY_TOKEN=\${MCP_PROXY_TOKEN:+set} MCP_PROXY_URL=\${MCP_PROXY_URL} AGENT_CREDENTIALS=\${AGENT_CREDENTIALS}" >> "$_LOG" 2>&1`,
      `_OUT=$(agent-entry cred-fetch 2>>"$_LOG")`,
      "_EXIT=$?",
      `echo "[$(date -u +%H:%M:%S)] cred-fetch exit=$_EXIT output_len=\${#_OUT}" >> "$_LOG"`,
      `if [ "$_EXIT" -eq 0 ]; then`,
      `  eval "$_OUT"`,
      `  echo "[$(date -u +%H:%M:%S)] CLAUDE_CODE_OAUTH_TOKEN=\${CLAUDE_CODE_OAUTH_TOKEN:+set}" >> "$_LOG"`,
      "fi",
      "",
    ].join("\n");
    if (!fs.existsSync(serverEnvSetupPath) ||
        fs.readFileSync(serverEnvSetupPath, "utf-8") !== serverEnvSetupContent) {
      fs.writeFileSync(serverEnvSetupPath, serverEnvSetupContent, { mode: 0o755 });
    }

    // 6. Create session directory with compose file
    const { uid, gid } = getHostIds();
    const declaredCredentialKeys = collectDeclaredCredentialKeys(agentType, agentConfigCredentials, roleType);
    const sessionIdOverride = (deps?.generateSessionIdFn ?? generateSessionId)();
    const session = createSessionDirectory({
      projectDir,
      dockerBuildDir,
      dockerDir,
      role: roleType,
      agentType,
      agentName: roleName,
      proxyPort,
      roleMounts: roleType.container?.mounts,
      credentialKeys: declaredCredentialKeys,
      hostUid: uid,
      hostGid: gid,
      homeOverride,
      vscodeServerHostPath,
      verbose,
      sessionId: sessionIdOverride,
    });

    const { sessionId, composeFile, relayToken, proxyServiceName, agentServiceName } = session;

    // Derive compose project name for container name (VSCode attach)
    const projectHash = crypto.createHash("sha256").update(projectDir).digest("hex").slice(0, 8);
    const composeName = `mason-${projectHash}`;
    const containerName = deriveContainerName(composeName, agentServiceName);

    console.log(`  Session: ${sessionId}`);
    console.log(`  Compose: .mason/sessions/${sessionId}/docker-compose.yaml`);

    // 7. Build and start proxy
    console.log(`\n  Building proxy (${proxyServiceName})...`);
    const buildArgs = ["build"];
    if (buildMode) buildArgs.push("--no-cache");
    buildArgs.push(proxyServiceName);
    const buildCode = await execCompose(composeFile, buildArgs, { verbose });
    if (buildCode !== 0) throw new Error(`Failed to build proxy image (exit code ${buildCode}).`);

    const proxyCode = await execCompose(composeFile, ["up", "-d", proxyServiceName], { verbose });
    if (proxyCode !== 0) throw new Error(`Failed to start proxy (exit code ${proxyCode}).`);
    console.log(`  Proxy started.`);

    await waitForProxyHealth(`http://localhost:${proxyPort}/health`, 60_000);
    console.log(`  Proxy ready.`);

    // 9. Start host proxy
    const resolvedAgent = adaptRoleFn(roleType, agentType);
    const envCredentials = collectEnvCredentials(resolvedAgent);
    const hostAppsDevContainer = resolvedAgent.roles.flatMap((r) => r.apps).filter((a) => a.location === "host");
    const hostProxyHandle = await startHostProxy({
      proxyPort,
      relayToken,
      envCredentials,
      hostApps: hostAppsDevContainer.length > 0 ? hostAppsDevContainer : undefined,
    });
    console.log(`  Host proxy connected.`);

    // 10. Build and start agent container in background (detached)
    console.log(`\n  Building agent (${agentServiceName})...`);
    const agentBuildArgs = ["build"];
    if (buildMode) agentBuildArgs.push("--no-cache");
    agentBuildArgs.push(agentServiceName);
    const agentBuildCode = await execCompose(composeFile, agentBuildArgs, { verbose });
    if (agentBuildCode !== 0) throw new Error(`Failed to build agent image (exit code ${agentBuildCode}).`);

    const agentUpCode = await execCompose(composeFile, ["up", "-d", agentServiceName], { verbose });
    if (agentUpCode !== 0) throw new Error(`Failed to start agent container (exit code ${agentUpCode}).`);
    console.log(`  Agent container started.`);

    // 11. Print IDE connection instructions
    console.log(`
  ┌─────────────────────────────────────────────────────────────┐
  │  Dev-Container Ready                                        │
  ├─────────────────────────────────────────────────────────────┤
  │  Container:  ${containerName.padEnd(47)}│
  │  Workspace:  /home/mason/workspace/project                  │
  │                                                             │
  │  To attach from any dev-container-compatible IDE:           │
  │    1. Open the Remote Explorer                              │
  │    2. Select "Attach to Running Container"                  │
  │    3. Choose: ${containerName.padEnd(46)}│
  │                                                             │
  │  Press Ctrl+C to stop the session                           │
  └─────────────────────────────────────────────────────────────┘
`);

    // 12. Prompt to launch VSCode
    await promptAndLaunchVscode(containerName, "/home/mason/workspace/project");

    // 13. Stay alive until Ctrl+C
    console.log(`  Session running. Press Ctrl+C to tear down.\n`);
    await new Promise<void>((resolve) => {
      const onSignal = () => resolve();
      process.once("SIGINT", onSignal);
      process.once("SIGTERM", onSignal);
    });

    // 14. Tear down
    console.log(`\n  Tearing down services...`);
    try { await hostProxyHandle.stop(); } catch { /* best-effort */ }
    await execCompose(composeFile, ["down"], { verbose });
    console.log(`  Services stopped.`);
    console.log(`  Session retained at: .mason/sessions/${sessionId}/`);
    console.log(`\n  dev-container session complete\n`);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  dev-container failed: ${message}\n`);
    process.exit(1);
  }
}

/**
 * Prompt the user to optionally launch VSCode and attach to the running container.
 * Spawns `code --folder-uri` if the user confirms and `code` is on PATH.
 */
async function promptAndLaunchVscode(containerName: string, workspacePath: string): Promise<void> {
  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  await new Promise<void>((resolve) => {
    rl.question("  Would you like to launch VSCode and attach to the container? (y/N) ", (answer) => {
      rl.close();
      if (answer.toLowerCase() !== "y") {
        resolve();
        return;
      }

      const uri = buildVscodeAttachUri(containerName, workspacePath);
      const child = spawn("code", ["--folder-uri", uri], {
        detached: true,
        stdio: "ignore",
      });
      child.on("error", () => {
        console.error(`\n  VSCode (\`code\`) not found on PATH — attach manually using the instructions above.\n`);
      });
      child.unref();
      resolve();
    });
  });
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

  // 6. Create session directory with compose file
  const { uid, gid } = getHostIds();
  const sessionIdOverride = (deps?.generateSessionIdFn ?? generateSessionId)();
  const session = createSessionDirectory({
    projectDir,
    dockerBuildDir,
    dockerDir,
    role: roleType,
    agentType,
    agentName: roleName,
    proxyPort,
    roleMounts: roleType.container?.mounts,
    hostUid: uid,
    hostGid: gid,
    sessionId: sessionIdOverride,
  });

  const { sessionId, composeFile, proxyToken, proxyServiceName } = session;

  // 7. Build and start proxy detached
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
  homeOverride?: string,
  agentConfigCredentials?: string[],
  agentArgs?: string[],
  // initialPrompt is intentionally omitted: ACP mode does not forward initial prompts
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
  let hostProxyHandle: { stop: () => Promise<void> } | null = null;
  let shuttingDown = false;

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
      if (hostProxyHandle) await hostProxyHandle.stop();
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
      roleType, agentType, projectDir, { existsSyncFn: deps?.existsSyncFn, agentConfigCredentials, agentArgs },
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

    const sdkCredKeys = agentPkg?.runtime?.credentials?.map((c) => c.key) ?? [];
    const declaredCredentialKeys = new Set<string>([...sdkCredKeys, ...(agentConfigCredentials ?? []), ...resolvedAgent.credentials]);
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

    // ── Step 6b: Start host proxy in-process ──────────────────────────
    logger.log("[mason agent --acp] Starting host proxy (in-process)...");
    const startHostProxy = deps?.startHostProxyFn ?? defaultStartHostProxy;
    const hostAppsAcp = resolvedAgent.roles.flatMap((r) => r.apps).filter((a) => a.location === "host");

    hostProxyHandle = await startHostProxy({
      proxyPort,
      relayToken: infraInfo.relayToken,
      envCredentials,
      hostApps: hostAppsAcp.length > 0 ? hostAppsAcp : undefined,
    });
    logger.log("[mason agent --acp] Host proxy connected to Docker proxy.");

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

// ── Default host proxy startup ─────────────────────────────────────────

async function defaultStartHostProxy(opts: {
  proxyPort: number;
  relayToken: string;
  envCredentials: Record<string, string>;
  hostApps?: ResolvedApp[];
}): Promise<{ stop: () => Promise<void> }> {
  const hostProxy = new HostProxy({
    relayUrl: `ws://localhost:${opts.proxyPort}/ws/relay`,
    token: opts.relayToken,
    keychainService: "mason",
    envCredentials: opts.envCredentials,
    hostApps: opts.hostApps,
  });
  await hostProxy.start();
  return { stop: () => hostProxy.stop() };
}
