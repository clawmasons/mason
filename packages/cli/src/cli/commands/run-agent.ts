import type { Command } from "commander";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { Readable, Writable } from "node:stream";
import { spawn } from "node:child_process";
import type { RunConfig } from "./run-init.js";
import { checkDockerCompose } from "./docker-utils.js";
import {
  getClawmasonsHome,
  findRoleEntryByRole,
  resolveLodgeVars,
  type ChapterEntry,
} from "../../runtime/home.js";
import { ensureGitignoreEntry } from "../../runtime/gitignore.js";
import { initRole, type InitRoleOptions, type InitRoleDeps } from "./init-role.js";
import { resolveRoleMountVolumes, type RoleMount } from "../../generator/mount-volumes.js";
import type { DiscoveredPackage, ResolvedAgent } from "@clawmasons/shared";
import { computeToolFilters, resolveRole as resolveRoleByName, adaptRoleToResolvedAgent } from "@clawmasons/shared";
import { ACP_RUNTIME_COMMANDS } from "../../materializer/common.js";
import { getRegisteredAgentTypes } from "../../materializer/role-materializer.js";
import { AcpSession, type AcpSessionConfig, type AcpSessionDeps } from "../../acp/session.js";
import { AcpSdkBridge, type AcpSdkBridgeConfig } from "../../acp/bridge.js";
import { CredentialService, CredentialWSClient } from "@clawmasons/credential-service";
import { initLodge, type LodgeInitOptions, type LodgeInitResult } from "./lodge-init.js";
import { runInit, type InitOptions } from "./init.js";
import { runBuild } from "./build.js";
import { createFileLogger, type AcpLogger } from "../../acp/logger.js";

// ── Role-based Agent Resolution ───────────────────────────────────────

/**
 * Default implementation for resolving a ResolvedAgent from a role name
 * using the role-based pipeline (ROLE_TYPES → adapter → ResolvedAgent).
 */
async function defaultResolveAgentFromRole(
  roleName: string,
  rootDir: string,
  agentType: string,
): Promise<ResolvedAgent> {
  const roleType = await resolveRoleByName(roleName, rootDir);
  return adaptRoleToResolvedAgent(roleType, agentType);
}

// ── Types ──────────────────────────────────────────────────────────────

export interface RunAcpAgentOptions {
  agent?: string;
  role: string;
  proxyPort?: number;
  chapter?: string;
  initAgent?: string;
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
 * Read and validate the run-init `.clawmasons/chapter.json` config
 * from the given project directory.
 *
 * @deprecated Kept for backward compatibility. `runAgent` now reads from
 * CLAWMASONS_HOME/chapters.json instead.
 */
export function readRunConfig(projectDir: string): RunConfig {
  const configPath = path.join(projectDir, ".clawmasons", "chapter.json");

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `No .clawmasons/chapter.json found. Run "clawmasons run-init" first to initialize the project.`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    throw new Error(`.clawmasons/chapter.json is not valid JSON.`);
  }

  if (
    typeof raw !== "object" ||
    raw === null ||
    !("chapter" in raw) ||
    typeof (raw as RunConfig).chapter !== "string" ||
    !("docker-build" in raw) ||
    typeof (raw as RunConfig)["docker-build"] !== "string"
  ) {
    throw new Error(
      `.clawmasons/chapter.json must contain "chapter" and "docker-build" fields. Run "clawmasons run-init" to regenerate.`,
    );
  }

  return raw as RunConfig;
}

/**
 * Validate that the docker-build path has the expected Dockerfiles
 * for the given agent and role.
 */
export function validateDockerfiles(
  dockerBuildPath: string,
  agent: string,
  role: string,
): { proxyDockerfile: string; agentDockerfile: string } {
  const proxyDockerfile = path.join(dockerBuildPath, "proxy", role, "Dockerfile");
  const agentDockerfile = path.join(dockerBuildPath, "agent", agent, role, "Dockerfile");

  if (!fs.existsSync(proxyDockerfile)) {
    throw new Error(
      `Proxy Dockerfile not found: ${proxyDockerfile}\nRun "clawmasons build" in the chapter project to generate Dockerfiles.`,
    );
  }

  if (!fs.existsSync(agentDockerfile)) {
    throw new Error(
      `Agent Dockerfile not found: ${agentDockerfile}\nRun "clawmasons build" in the chapter project to generate Dockerfiles.`,
    );
  }

  return { proxyDockerfile, agentDockerfile };
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
 * Generate a docker-compose.yml for a run-agent session.
 *
 * The compose file defines two services:
 * - proxy: built from the proxy Dockerfile, runs detached
 * - agent: built from the agent Dockerfile, runs interactively with stdin, depends on proxy
 *
 * The credential service runs in-process on the host (not in Docker).
 * The project directory is bind-mounted into both proxy and agent containers at /workspace.
 * The agent container receives only MCP_PROXY_TOKEN — no API keys.
 */
export function generateComposeYml(opts: {
  dockerBuildPath: string;
  projectDir: string;
  agent: string;
  role: string;
  logsDir: string;
  proxyToken: string;
  credentialProxyToken: string;
  proxyPort?: number;
  roleMounts?: RoleMount[];
}): string {
  const { dockerBuildPath, projectDir, agent, role, logsDir, proxyToken, credentialProxyToken, proxyPort = 3000, roleMounts } = opts;

  const proxyContext = path.join(dockerBuildPath);
  const proxyDockerfile = path.join("proxy", role, "Dockerfile");
  const agentContext = path.join(dockerBuildPath);
  const agentDockerfile = path.join("agent", agent, role, "Dockerfile");

  const proxyServiceName = `proxy-${role}`;
  const agentServiceName = `agent-${agent}-${role}`;

  // Build agent volume lines: workspace mount + role-declared mounts
  const agentVolumeLines = [`      - "${projectDir}:/workspace"`];
  for (const vol of resolveRoleMountVolumes(roleMounts)) {
    agentVolumeLines.push(`      - "${vol}"`);
  }

  // Use YAML template literal for clarity
  return `# Generated by clawmasons run-agent
services:
  ${proxyServiceName}:
    build:
      context: "${proxyContext}"
      dockerfile: "${proxyDockerfile}"
    volumes:
      - "${projectDir}:/workspace"
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
      dockerfile: "${agentDockerfile}"
    volumes:
${agentVolumeLines.join("\n")}
    depends_on:
      - ${proxyServiceName}
    environment:
      - MCP_PROXY_TOKEN=${proxyToken}
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
 *
 * This enables the ACP client's `env` block to flow credentials through
 * to the credential-service container as session overrides.
 *
 * @param agent - The resolved agent with credential declarations
 * @param env - The environment to read from (defaults to process.env)
 * @returns A record of credential key -> value for all matched env vars
 */
export function collectEnvCredentials(
  agent: ResolvedAgent,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  // Build the set of all declared credential keys
  const declaredKeys = new Set<string>(agent.credentials);
  for (const role of agent.roles) {
    for (const app of role.apps) {
      for (const key of app.credentials) {
        declaredKeys.add(key);
      }
    }
  }

  // Collect matching env vars
  const collected: Record<string, string> = {};
  for (const key of declaredKeys) {
    const value = env[key];
    if (value !== undefined && value !== "") {
      collected[key] = value;
    }
  }

  return collected;
}

// ── Agent Name Resolution ─────────────────────────────────────────────

/**
 * Resolve the agent name from --agent flag.
 * With the agent package type removed, this function simply validates
 * that an agent name was provided.
 *
 * @deprecated Agent packages are removed. Use role-based resolution instead.
 */
export function resolveAgentName(
  agentFlag: string | undefined,
): string {
  if (agentFlag) return agentFlag;

  throw new Error(
    "An agent name is required. Use --agent <name> to specify which agent to use.\n" +
    "Note: Agent packages have been replaced by roles. Use 'clawmasons run <agent-type> --role <name>' instead.",
  );
}

// ── Chapter Bootstrap ─────────────────────────────────────────────────

/**
 * Dependencies for bootstrapChapter, extracted from RunAgentDeps.
 */
export interface BootstrapChapterDeps {
  initLodgeFn: (options: LodgeInitOptions) => LodgeInitResult;
  runInitFn: (
    targetDir: string,
    options: InitOptions,
    deps?: { templatesDir?: string; skipNpmInstall?: boolean },
  ) => Promise<void>;
  runBuildFn: (
    rootDir: string,
    agentName: string | undefined,
    options: Record<string, unknown>,
  ) => Promise<void>;
  resolveLodgeVarsFn: (options?: {
    home?: string;
    lodge?: string;
    lodgeHome?: string;
  }) => { clawmasonsHome: string; lodge: string; lodgeHome: string };
  existsSyncFn: (filePath: string) => boolean;
  mkdirSyncFn: (dirPath: string, options?: { recursive?: boolean }) => void;
  /** Override fs.readFileSync (for testing). */
  readFileSyncFn?: (filePath: string, encoding: BufferEncoding) => string;
  /** Override fs.writeFileSync (for testing). */
  writeFileSyncFn?: (filePath: string, data: string) => void;
}

/**
 * Bootstrap a chapter workspace. When chapterName is "initiate", runs the
 * full flow: lodge init -> chapter init (with template) -> chapter build.
 * For other chapter names, resolves the chapter directory without bootstrap.
 *
 * Returns the chapter directory to use as rootDir for the ACP session.
 */
export async function bootstrapChapter(
  chapterName: string,
  deps: BootstrapChapterDeps,
): Promise<string> {
  // Bootstrap logs go to stderr so they never corrupt stdio JSON-RPC on stdout.
  const log = (...args: unknown[]) => console.error(...args);

  // 1. Init lodge (idempotent)
  log("[clawmasons agent] Initializing lodge...");
  const lodgeResult = deps.initLodgeFn({});
  const { lodge, lodgeHome } = lodgeResult;

  if (lodgeResult.skipped) {
    log(`[clawmasons agent] Lodge '${lodge}' already initialized.`);
  } else {
    log(`[clawmasons agent] Lodge '${lodge}' initialized at ${lodgeHome}`);
  }

  // 2. Resolve chapter directory
  const chapterDir = path.join(lodgeHome, "chapters", chapterName);

  // 3. For "initiate" chapter, run full bootstrap if needed
  const chapterMarker = path.join(chapterDir, ".clawmasons");
  if (!deps.existsSyncFn(chapterMarker)) {
    log(`[clawmasons agent] Bootstrapping '${chapterName}' chapter...`);

    // Create the chapter directory
    deps.mkdirSyncFn(chapterDir, { recursive: true });

    // Init chapter with template
    log("[clawmasons agent] Running chapter init...");
    await deps.runInitFn(
      chapterDir,
      { name: `${lodge}.${chapterName}`, template: chapterName },
      { skipNpmInstall: true },
    );

    // Build the chapter
    log("[clawmasons agent] Running chapter build...");
    await deps.runBuildFn(chapterDir, undefined, {});

    // Write docker-build path into .clawmasons/chapter.json so AcpSession can find it
    const readFile = deps.readFileSyncFn ?? fs.readFileSync;
    const writeFile = deps.writeFileSyncFn ?? fs.writeFileSync;
    const chapterJsonPath = path.join(chapterDir, ".clawmasons", "chapter.json");
    const dockerBuildPath = path.join(chapterDir, "docker");
    let chapterJson: Record<string, unknown> = {};
    try {
      chapterJson = JSON.parse(readFile(chapterJsonPath, "utf-8")) as Record<string, unknown>;
    } catch { /* start fresh if missing/invalid */ }
    chapterJson["docker-build"] = dockerBuildPath;
    if (!chapterJson["docker-registries"]) {
      chapterJson["docker-registries"] = ["local"];
    }
    writeFile(chapterJsonPath, JSON.stringify(chapterJson, null, 2) + "\n");

    log(`[clawmasons agent] Bootstrap complete for '${chapterName}'.`);
  } else {
    log(`[clawmasons agent] Chapter '${chapterName}' already initialized. Skipping bootstrap.`);
  }

  return chapterDir;
}

// ── Help Text ─────────────────────────────────────────────────────────

export const RUN_ACP_AGENT_HELP_EPILOG = `
Command Syntax:
  clawmasons run <agent-type> --role <name>          # primary form
  clawmasons <agent-type> --role <name>              # shorthand
  clawmasons run <agent-type> --role <name> --acp    # ACP mode

Agent Types:
  claude (claude-code), codex, aider, pi (pi-coding-agent), mcp (mcp-agent)

Session Behavior:
  When an ACP client sends session/new with a "cwd" field, the agent
  container mounts that directory as /workspace. Each session/new starts
  a fresh agent container; the proxy stays running. The credential
  service runs in-process on the host.

  If no "cwd" is provided in session/new, the current working directory
  of this process is used as the default.

Side Effects:
  - Creates .clawmasons/ in the session's CWD for session logs
  - Appends ".clawmasons" to the project's .gitignore if present

Environment:
  CLAWMASONS_HOME    Base directory for chapter runtime state.
                     Default: ~/.clawmasons
  LODGE              Lodge name for multi-tenant setups.
                     Default: auto-detected from CLAWMASONS_HOME
  LODGE_HOME         Lodge home directory override.
                     Default: $CLAWMASONS_HOME/$LODGE

  Credential env vars (e.g. OPEN_ROUTER_KEY, ANTHROPIC_API_KEY) are
  passed through to the credential-service when set in the client's
  env block. The credential-service checks process.env as priority 1
  (after session overrides).

Bootstrap Flow (--chapter initiate):
  When --chapter initiate is specified, the CLI runs a full bootstrap:
    1. Lodge init   — creates ~/.clawmasons/<lodge>/ (idempotent)
    2. Chapter init — scaffolds the "initiate" chapter from template
    3. Chapter build — builds the chapter workspace
  The agent then starts against the bootstrapped chapter directory.
  Use this for zero-setup onboarding with a new lodge.

  Logs are always written to <roleDir>/logs/acp.log. Stdout is
  reserved for ACP protocol messages; all diagnostics go to the
  log file only.

ACP Client Configuration Example (Zed / acpx / VS Code):
  Add to your editor's agent_servers config (e.g. Zed settings.json).
  The agent communicates via stdio ndjson (ACP protocol):

  {
    "agent_servers": {
      "Clawmasons": {
        "type": "custom",
        "command": "npx",
        "args": [
          "clawmasons",
          "run", "pi",
          "--acp",
          "--chapter", "initiate",
          "--role", "chapter-creator"
        ],
        "env": {
          "CLAWMASONS_HOME": "~/.clawmasons",
          "LODGE": "acme",
          "LODGE_HOME": "~/.clawmasons/acme",
          "OPEN_ROUTER_KEY": "$OPENROUTER_API_KEY"
        }
      }
    }
  }
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
  /** Override CLAWMASONS_HOME resolution (for testing). */
  getClawmasonsHomeFn?: () => string;
  /** Override chapters.json role lookup (for testing). */
  findRoleEntryByRoleFn?: (
    home: string,
    role: string,
  ) => ChapterEntry | undefined;
  /** Override init-role invocation for auto-init (for testing). */
  initRoleFn?: (
    rootDir: string,
    options: InitRoleOptions,
    deps?: InitRoleDeps,
  ) => Promise<void>;
  /** Override .gitignore entry management (for testing). */
  ensureGitignoreEntryFn?: (dir: string, pattern: string) => boolean;
  /** Override package discovery (for testing, ACP mode). */
  discoverPackagesFn?: (rootDir: string) => Map<string, DiscoveredPackage>;
  /** Override agent resolution (for testing, ACP mode). Uses role-based resolution. */
  resolveAgentFn?: (roleName: string, rootDir: string, agentType: string) => Promise<ResolvedAgent>;
  /** Override AcpSession construction (for testing, ACP mode). */
  createSessionFn?: (config: AcpSessionConfig, sessionDeps?: AcpSessionDeps) => AcpSession;
  /** Override AcpSdkBridge construction (for testing, ACP mode). */
  createBridgeFn?: (config: AcpSdkBridgeConfig) => AcpSdkBridge;
  /** Override fs.mkdirSync (for testing). */
  mkdirSyncFn?: (dirPath: string, options?: { recursive?: boolean }) => void;
  /** Override lodge init for bootstrap (for testing). */
  initLodgeFn?: (options: LodgeInitOptions) => LodgeInitResult;
  /** Override chapter init for bootstrap (for testing). */
  runInitFn?: (
    targetDir: string,
    options: InitOptions,
    deps?: { templatesDir?: string; skipNpmInstall?: boolean },
  ) => Promise<void>;
  /** Override chapter build for bootstrap (for testing). */
  runBuildFn?: (
    rootDir: string,
    agentName: string | undefined,
    options: Record<string, unknown>,
  ) => Promise<void>;
  /** Override lodge variable resolution (for testing). */
  resolveLodgeVarsFn?: (options?: {
    home?: string;
    lodge?: string;
    lodgeHome?: string;
  }) => { clawmasonsHome: string; lodge: string; lodgeHome: string };
  /** Override fs.existsSync (for testing). */
  existsSyncFn?: (filePath: string) => boolean;
  /** Override fs.readFileSync (for testing). */
  readFileSyncFn?: (filePath: string, encoding: BufferEncoding) => string;
  /** Override fs.writeFileSync (for testing). */
  writeFileSyncFn?: (filePath: string, data: string) => void;
  /** Override credential service startup (for testing). */
  startCredentialServiceFn?: (opts: {
    proxyPort: number;
    credentialProxyToken: string;
    envCredentials: Record<string, string>;
  }) => Promise<{ disconnect: () => void; close: () => void }>;
  /** Override logger creation (for testing, ACP mode). */
  createLoggerFn?: (logDir: string) => AcpLogger;
}

// ── Backward-compat alias ─────────────────────────────────────────────
export type RunAcpAgentDeps = RunAgentDeps;

// ── Command Registration ──────────────────────────────────────────────

/**
 * Create the action handler for both `run` and the hidden `agent` alias.
 */
function createRunAction() {
  return async (
    positionalAgentType: string | undefined,
    options: {
      acp?: boolean;
      agentType?: string;
      role?: string;
      proxyPort: string;
      chapter?: string;
      initAgent?: string;
    },
  ) => {
    const agentTypeInput = positionalAgentType ?? options.agentType;
    const role = options.role;

    if (!role) {
      console.error("\n  --role <name> is required.\n  Usage: clawmasons run <agent-type> --role <name>\n");
      process.exit(1);
      return;
    }

    // Resolve agent type (alias or direct)
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
        chapter: options.chapter,
        initAgent: options.initAgent,
      });
    } else {
      if (!resolvedAgentType) {
        console.error("\n  Interactive mode requires an agent type.\n  Usage: clawmasons run <agent-type> --role <name>\n");
        process.exit(1);
        return;
      }
      await runAgent(process.cwd(), resolvedAgentType, role);
    }
  };
}

export function registerRunCommand(program: Command): void {
  // Primary `run` command
  program
    .command("run")
    .description("Run a role on the specified agent runtime")
    .argument("[agent-type]", "Agent runtime type (e.g., claude, codex, aider, pi, mcp)")
    .option("--acp", "Start in ACP mode for editor integration")
    .option("--role <name>", "Role name to run (required)")
    .option("--agent-type <name>", "Agent type (alternative to positional argument)")
    .option("--proxy-port <number>", "Internal proxy port (default: 3000)", "3000")
    .option("--chapter <name>", "Chapter name (use 'initiate' for full bootstrap flow, ACP mode only)")
    .option("--init-agent <name>", "Agent name override for bootstrap (ACP mode only)")
    .addHelpText("after", RUN_ACP_AGENT_HELP_EPILOG)
    .action(createRunAction());

}

/**
 * @deprecated Use registerRunCommand instead.
 */
export function registerRunAgentCommand(program: Command): void {
  registerRunCommand(program);
}

// ── Backward-compat: registerRunAcpAgentCommand ─────────────────────

/**
 * @deprecated Use registerRunAgentCommand instead. The `acp` command is
 * now consolidated into `agent --acp`.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerRunAcpAgentCommand(_program: Command): void {
  // No-op: the `acp` command is now part of `agent --acp`.
  // Kept for backward compatibility during transition.
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
    chapter?: string;
    initAgent?: string;
  },
): Promise<void> {
  const isAcpMode = acpOptions?.acp === true;
  const proxyPort = acpOptions?.proxyPort ?? 3000;

  if (isAcpMode) {
    return runAgentAcpMode(projectDir, agent, role, proxyPort, acpOptions, deps);
  } else {
    if (!agent) {
      throw new Error("Agent name is required for interactive mode.");
    }
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
    chapter: options.chapter,
    initAgent: options.initAgent,
  });
}

// ── Interactive Mode ──────────────────────────────────────────────────

async function runAgentInteractiveMode(
  projectDir: string,
  agent: string,
  role: string,
  proxyPort: number,
  deps?: RunAgentDeps,
): Promise<void> {
  const execCompose = deps?.execComposeFn ?? execComposeCommand;
  const genSessionId = deps?.generateSessionIdFn ?? generateSessionId;
  const checkDocker = deps?.checkDockerComposeFn ?? checkDockerCompose;
  const getHome = deps?.getClawmasonsHomeFn ?? getClawmasonsHome;
  const findRole = deps?.findRoleEntryByRoleFn ?? findRoleEntryByRole;
  const autoInitRole = deps?.initRoleFn ?? initRole;
  const ensureGitignore = deps?.ensureGitignoreEntryFn ?? ensureGitignoreEntry;
  const startCredService = deps?.startCredentialServiceFn ?? defaultStartCredentialService;

  try {
    // 1. Pre-flight: check docker compose is available
    checkDocker();

    // 2. Resolve role from CLAWMASONS_HOME/chapters.json
    const home = getHome();
    let entry = findRole(home, role);

    // 3. Auto-init if role not found
    if (!entry) {
      console.log(`\n  Role "${role}" not found in chapters.json. Auto-initializing...`);
      await autoInitRole(projectDir, { role });

      // Re-read after init
      entry = findRole(home, role);

      if (!entry) {
        throw new Error(
          `Role "${role}" not initialized and auto-init failed. Run "clawmasons chapter init-role --role ${role}" from your chapter workspace.`,
        );
      }
    }

    const dockerBuildPath = entry.dockerBuild;
    const chapterName = `${entry.lodge}.${entry.chapter}`;

    console.log(`\n  Chapter: ${chapterName}`);
    console.log(`  Agent: ${agent}`);
    console.log(`  Role: ${role}`);

    // 4. Validate Dockerfiles exist
    validateDockerfiles(dockerBuildPath, agent, role);

    // 5. Ensure .clawmasons is in project's .gitignore
    ensureGitignore(projectDir, ".clawmasons");

    // 6. Generate session ID and create session directory
    const sessionId = genSessionId();
    const sessionDir = path.join(projectDir, ".clawmasons", "sessions", sessionId, "docker");
    fs.mkdirSync(sessionDir, { recursive: true });

    const logsDir = path.join(projectDir, ".clawmasons", "logs");
    fs.mkdirSync(logsDir, { recursive: true });

    console.log(`  Session: ${sessionId}`);

    // 7. Generate tokens and docker-compose.yml
    const proxyToken = crypto.randomBytes(32).toString("hex");
    const credentialProxyToken = crypto.randomBytes(32).toString("hex");

    const composeContent = generateComposeYml({
      dockerBuildPath,
      projectDir,
      agent,
      role,
      logsDir,
      proxyToken,
      credentialProxyToken,
      proxyPort,
    });

    const composeFile = path.join(sessionDir, "docker-compose.yml");
    fs.writeFileSync(composeFile, composeContent);
    console.log(`  Compose: .clawmasons/sessions/${sessionId}/docker/docker-compose.yml`);

    // 8. Start proxy detached
    const proxyServiceName = `proxy-${role}`;
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
    const agentServiceName = `agent-${agent}-${role}`;
    console.log(`  Starting agent (${agentServiceName})...\n`);

    const agentCode = await execCompose(
      composeFile,
      ["run", "--rm", "--service-ports", agentServiceName],
      { interactive: true },
    );

    // 11. Tear down all containers on agent exit
    console.log(`\n  Agent exited (code ${agentCode}). Tearing down services...`);

    // Disconnect credential service
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
  rootDir: string,
  agentFlag: string | undefined,
  role: string,
  proxyPort: number,
  acpOptions?: {
    chapter?: string;
    initAgent?: string;
  },
  deps?: RunAgentDeps,
): Promise<void> {
  const resolveAgentFromRole = deps?.resolveAgentFn ?? defaultResolveAgentFromRole;
  const createSession = deps?.createSessionFn ?? ((config: AcpSessionConfig, sessionDeps?: AcpSessionDeps) => new AcpSession(config, sessionDeps));
  const createBridge = deps?.createBridgeFn ?? ((config: AcpSdkBridgeConfig) => new AcpSdkBridge(config));
  const getHome = deps?.getClawmasonsHomeFn ?? getClawmasonsHome;
  const findRole = deps?.findRoleEntryByRoleFn ?? findRoleEntryByRole;
  const autoInitRole = deps?.initRoleFn ?? initRole;
  const ensureGitignore = deps?.ensureGitignoreEntryFn ?? ensureGitignoreEntry;
  const mkdirSync = deps?.mkdirSyncFn ?? fs.mkdirSync;
  const initLodgeDep = deps?.initLodgeFn ?? initLodge;
  const runInitDep = deps?.runInitFn ?? runInit;
  const runBuildDep = deps?.runBuildFn ?? runBuild;
  const resolveLodgeVarsDep = deps?.resolveLodgeVarsFn ?? resolveLodgeVars;
  const existsSyncDep = deps?.existsSyncFn ?? fs.existsSync;
  const readFileSyncDep = deps?.readFileSyncFn;
  const writeFileSyncDep = deps?.writeFileSyncFn;

  // ── Protect stdout from console pollution ────────────────────────────
  const origLog = console.log.bind(console);
  const origError = console.error.bind(console);
  const earlyBuffer: unknown[][] = [];
  if (!deps?.createLoggerFn) {
    const noop = (...args: unknown[]) => { earlyBuffer.push(args); };
    console.log = noop;
    console.error = noop;
  }

  // Logger is created once we know the roleDir (after role resolution).
  let logger: AcpLogger | null = null;

  // Resolve effective rootDir based on --chapter flag
  let effectiveRootDir = rootDir;

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
    // ── Step 0: Chapter bootstrap (if --chapter specified) ──────────────
    if (acpOptions?.chapter) {
      if (acpOptions.chapter === "initiate") {
        effectiveRootDir = await bootstrapChapter(acpOptions.chapter, {
          initLodgeFn: initLodgeDep,
          runInitFn: runInitDep,
          runBuildFn: runBuildDep,
          resolveLodgeVarsFn: resolveLodgeVarsDep,
          existsSyncFn: existsSyncDep,
          mkdirSyncFn: mkdirSync,
          readFileSyncFn: readFileSyncDep,
          writeFileSyncFn: writeFileSyncDep,
        });
      } else {
        const { lodgeHome } = resolveLodgeVarsDep();
        effectiveRootDir = path.join(lodgeHome, "chapters", acpOptions.chapter);
        if (!existsSyncDep(effectiveRootDir)) {
          throw new Error(
            `Chapter '${acpOptions.chapter}' not found at ${effectiveRootDir}. ` +
            `Use '--chapter initiate' for automatic bootstrap, or create the chapter manually.`,
          );
        }
        console.log(`[clawmasons agent --acp] Using chapter '${acpOptions.chapter}' at ${effectiveRootDir}`);
      }
    }

    // ── Step 1: Resolve role from CLAWMASONS_HOME ───────────────────────
    const home = getHome();
    let entry = findRole(home, role);

    if (!entry) {
      console.error(`\n[clawmasons agent --acp] Role "${role}" not found in chapters.json. Auto-initializing...`);
      await autoInitRole(effectiveRootDir, { role });

      entry = findRole(home, role);

      if (!entry) {
        throw new Error(
          `Role "${role}" not initialized and auto-init failed. Run "clawmasons chapter init-role --role ${role}" from your chapter workspace.`,
        );
      }
    }

    // ── Create file logger from roleDir ──────────────────────────────
    const logsDir = path.join(entry.roleDir, "logs");
    const makeLogger = deps?.createLoggerFn ?? createFileLogger;
    logger = makeLogger(logsDir);

    // Flush buffered early output to the file logger.
    for (const args of earlyBuffer) { logger.log(...args); }
    earlyBuffer.length = 0;

    if (!deps?.createLoggerFn) {
      const fileLogger = logger;
      console.log = (...args: unknown[]) => fileLogger.log(...args);
      console.error = (...args: unknown[]) => fileLogger.error(...args);
    }

    // Ensure .clawmasons is in chapter workspace's .gitignore
    ensureGitignore(effectiveRootDir, ".clawmasons");

    // ── Step 2: Resolve agent from role ─────────────────────────────────
    const effectiveAgentType = agentFlag ?? "claude-code";
    logger.log(`[clawmasons run --acp] Resolving role "${role}" for agent type "${effectiveAgentType}"...`);
    const resolvedAgent = await resolveAgentFromRole(role, effectiveRootDir, effectiveAgentType);

    // ── Step 4: Compute tool filters ───────────────────────────────────
    const toolFilters = computeToolFilters(resolvedAgent);
    const toolCount = Object.keys(toolFilters).length;

    // ── Step 4b: Collect env credentials ─────────────────────────────
    const envCredentials = collectEnvCredentials(resolvedAgent);
    const envCredCount = Object.keys(envCredentials).length;

    logger.log(`[clawmasons agent --acp] Agent: ${resolvedAgent.name}`);
    logger.log(`[clawmasons agent --acp] Role: ${role}`);
    logger.log(`[clawmasons agent --acp] Tool filters: ${toolCount} app(s)`);
    if (envCredCount > 0) {
      logger.log(`[clawmasons agent --acp] Env credentials: ${envCredCount} key(s) from process.env`);
    }

    // ── Step 5: Create session and start infrastructure ────────────────
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

    session = createSession({
      projectDir: effectiveRootDir,
      agent: resolvedAgent.slug,
      role,
      proxyPort,
      acpCommand,
      credentialKeys: [...declaredCredentialKeys],
    }, { logger });

    logger.log("[clawmasons agent --acp] Starting infrastructure (proxy)...");
    const infraInfo = await session.startInfrastructure();
    logger.log(`[clawmasons agent --acp] Infrastructure started (${infraInfo.sessionId})`);

    // ── Step 5b: Start credential service in-process ──────────────────
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

    // ── Step 6: Create and start ACP SDK bridge ──────────────────────────
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

    const chapterInfo = acpOptions?.chapter ? `\n  Chapter:    ${acpOptions.chapter}` : "";
    logger.log(
      `\n[clawmasons agent --acp] Ready -- stdio transport active\n` +
      `  Agent:      ${resolvedAgent.name}\n` +
      `  Role:       ${role}\n` +
      `  Proxy port: ${proxyPort}${chapterInfo}\n` +
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
