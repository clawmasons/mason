import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import type { DiscoveredPackage, ResolvedAgent } from "@clawmasons/shared";
import { computeToolFilters } from "@clawmasons/shared";
import { ACP_RUNTIME_COMMANDS } from "../../materializer/common.js";
import { discoverPackages } from "../../resolver/discover.js";
import { resolveAgent } from "../../resolver/resolve.js";
import { AcpSession, type AcpSessionConfig, type AcpSessionDeps } from "../../acp/session.js";
import { AcpBridge, type AcpBridgeConfig } from "../../acp/bridge.js";
import { CredentialService, CredentialWSClient } from "@clawmasons/credential-service";
import {
  getClawmasonsHome,
  findRoleEntryByRole,
  resolveLodgeVars,
  type ChapterEntry,
} from "../../runtime/home.js";
import { ensureGitignoreEntry } from "../../runtime/gitignore.js";
import { initRole, type InitRoleOptions, type InitRoleDeps } from "./init-role.js";
import { initLodge, type LodgeInitOptions, type LodgeInitResult } from "./lodge-init.js";
import { runInit, type InitOptions } from "./init.js";
import { runBuild } from "./build.js";
import { createFileLogger, type AcpLogger } from "../../acp/logger.js";
import { StdioBridge } from "../../acp/stdio-bridge.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface RunAcpAgentOptions {
  agent?: string;
  role: string;
  port?: number;
  proxyPort?: number;
  chapter?: string;
  initAgent?: string;
  transport?: "stdio" | "http";
}

/**
 * Dependencies for runAcpAgent, injectable for testing.
 */
export interface RunAcpAgentDeps {
  /** Override package discovery (for testing). */
  discoverPackagesFn?: (rootDir: string) => Map<string, DiscoveredPackage>;
  /** Override agent resolution (for testing). */
  resolveAgentFn?: (name: string, packages: Map<string, DiscoveredPackage>) => ResolvedAgent;
  /** Override AcpSession construction (for testing). */
  createSessionFn?: (config: AcpSessionConfig, sessionDeps?: AcpSessionDeps) => AcpSession;
  /** Override AcpBridge construction (for testing). */
  createBridgeFn?: (config: AcpBridgeConfig) => AcpBridge;
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
  /** Override logger creation (for testing). */
  createLoggerFn?: (logDir: string) => AcpLogger;
}

// ── Help Text ─────────────────────────────────────────────────────────

export const RUN_ACP_AGENT_HELP_EPILOG = `
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

Transport Modes:
  --transport stdio  (default) Communicates via stdin/stdout JSON-RPC.
                     Suitable for editors that spawn the server as a subprocess.
  --transport http   Listens on --port (default 3001) for HTTP requests.
                     Use when connecting from a separate client process.

  Logs are always written to <roleDir>/logs/acp.log regardless of
  transport mode. In stdio mode, stdout is reserved for protocol
  messages; all diagnostics go to the log file only.

ACP Client Configuration Example (Zed / acpx / VS Code):
  Add to your editor's agent_servers config (e.g. Zed settings.json).
  The default stdio transport works with command-based spawning:

  {
    "agent_servers": {
      "Clawmasons": {
        "type": "custom",
        "command": "npx",
        "args": [
          "clawmasons",
          "acp",
          "--chapter", "initiate",
          "--role", "chapter-creator",
          "--init-agent", "pi"
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

  For HTTP transport (e.g. remote or URL-based clients):

  {
    "agent_servers": {
      "Clawmasons": {
        "type": "custom",
        "command": "npx",
        "args": [
          "clawmasons",
          "acp",
          "--transport", "http",
          "--role", "<role-name>"
        ],
        "env": {
          "CLAWMASONS_HOME": "~/.clawmasons"
        }
      }
    }
  }
`;

// ── Command Registration ──────────────────────────────────────────────

export function registerRunAcpAgentCommand(program: Command): void {
  program
    .command("acp")
    .description("Start an ACP-compliant agent endpoint for editor integration")
    .requiredOption("--role <name>", "Role to use for the session")
    .option("--agent <name>", "Agent package name (auto-detected if only one)")
    .option("--port <number>", "ACP endpoint port for http transport (default: 3001)", "3001")
    .option("--proxy-port <number>", "Internal chapter proxy port (default: 3000)", "3000")
    .option("--transport <mode>", "Transport mode: stdio (default) or http", "stdio")
    .option("--chapter <name>", "Chapter name (use 'initiate' for full bootstrap flow)")
    .option("--init-agent <name>", "Agent name override for bootstrap (auto-detected if only one)")
    .addHelpText("after", RUN_ACP_AGENT_HELP_EPILOG)
    .action(async (options: { agent?: string; role: string; port: string; proxyPort: string; transport: string; chapter?: string; initAgent?: string }) => {
      await runAcpAgent(process.cwd(), {
        agent: options.agent,
        role: options.role,
        port: parseInt(options.port, 10),
        proxyPort: parseInt(options.proxyPort, 10),
        transport: options.transport as "stdio" | "http",
        chapter: options.chapter,
        initAgent: options.initAgent,
      });
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
 * Resolve the agent name from --agent flag or auto-detect from discovered packages.
 */
export function resolveAgentName(
  agentFlag: string | undefined,
  packages: Map<string, DiscoveredPackage>,
): string {
  if (agentFlag) return agentFlag;

  const agents: string[] = [];
  for (const [name, pkg] of packages) {
    if (pkg.chapterField.type === "agent") {
      agents.push(name);
    }
  }

  if (agents.length === 0) {
    throw new Error(
      "No agent packages found in this workspace. " +
      "Make sure you're in a chapter workspace root with an agents/ directory.",
    );
  }

  if (agents.length > 1) {
    throw new Error(
      `Multiple agent packages found: ${agents.join(", ")}. ` +
      "Use --agent <name> to specify which agent to run.",
    );
  }

  const agentName = agents[0];
  if (!agentName) {
    throw new Error("Unexpected empty agents array");
  }
  return agentName;
}

// ── Chapter Bootstrap ─────────────────────────────────────────────────

/**
 * Dependencies for bootstrapChapter, extracted from RunAcpAgentDeps.
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
  log("[clawmasons acp] Initializing lodge...");
  const lodgeResult = deps.initLodgeFn({});
  const { lodge, lodgeHome } = lodgeResult;

  if (lodgeResult.skipped) {
    log(`[clawmasons acp] Lodge '${lodge}' already initialized.`);
  } else {
    log(`[clawmasons acp] Lodge '${lodge}' initialized at ${lodgeHome}`);
  }

  // 2. Resolve chapter directory
  const chapterDir = path.join(lodgeHome, "chapters", chapterName);

  // 3. For "initiate" chapter, run full bootstrap if needed
  const chapterMarker = path.join(chapterDir, ".clawmasons");
  if (!deps.existsSyncFn(chapterMarker)) {
    log(`[clawmasons acp] Bootstrapping '${chapterName}' chapter...`);

    // Create the chapter directory
    deps.mkdirSyncFn(chapterDir, { recursive: true });

    // Init chapter with template
    log("[clawmasons acp] Running chapter init...");
    await deps.runInitFn(
      chapterDir,
      { name: `${lodge}.${chapterName}`, template: chapterName },
      { skipNpmInstall: true },
    );

    // Build the chapter
    log("[clawmasons acp] Running chapter build...");
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

    log(`[clawmasons acp] Bootstrap complete for '${chapterName}'.`);
  } else {
    log(`[clawmasons acp] Chapter '${chapterName}' already initialized. Skipping bootstrap.`);
  }

  return chapterDir;
}

// ── Main Orchestrator ─────────────────────────────────────────────────

export async function runAcpAgent(
  rootDir: string,
  options: RunAcpAgentOptions,
  deps?: RunAcpAgentDeps,
): Promise<void> {
  const discover = deps?.discoverPackagesFn ?? discoverPackages;
  const resolve = deps?.resolveAgentFn ?? resolveAgent;
  const createSession = deps?.createSessionFn ?? ((config: AcpSessionConfig, sessionDeps?: AcpSessionDeps) => new AcpSession(config, sessionDeps));
  const createBridge = deps?.createBridgeFn ?? ((config: AcpBridgeConfig) => new AcpBridge(config));
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

  const port = options.port ?? 3001;
  const proxyPort = options.proxyPort ?? 3000;
  const acpAgentPort = 3002;
  const transport = options.transport ?? "stdio";

  // ── Protect stdout from console pollution ────────────────────────────
  // In stdio mode, stdout is reserved for JSON-RPC messages. Redirect
  // all console output to stderr immediately (catches bootstrap, init,
  // build, pack, docker-init, etc.). Once the file logger is ready,
  // both console.log and console.error are routed to it instead.
  const origLog = console.log.bind(console);
  const origError = console.error.bind(console);
  const earlyBuffer: unknown[][] = [];
  if (transport === "stdio" && !deps?.createLoggerFn) {
    // Buffer all output until the file logger is ready.
    const noop = (...args: unknown[]) => { earlyBuffer.push(args); };
    console.log = noop;
    console.error = noop;
  }

  // Logger is created once we know the roleDir (after role resolution).
  let logger: AcpLogger | null = null;
  let stdioBridge: StdioBridge | null = null;

  // Resolve effective rootDir based on --chapter flag
  let effectiveRootDir = rootDir;

  let session: AcpSession | null = null;
  let bridge: AcpBridge | null = null;
  let credentialWsClient: CredentialWSClient | null = null;
  let credentialService: CredentialService | null = null;

  // Graceful shutdown handler
  const shutdown = async () => {
    // Restore console so shutdown messages reach the terminal
    console.log = origLog;
    console.error = origError;
    const log = logger ?? { log: origError, error: origError, close: () => {} };
    log.log("\n[clawmasons acp] Shutting down...");
    try { if (stdioBridge) stdioBridge.stop(); } catch { /* best-effort */ }
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
    if (options.chapter) {
      if (options.chapter === "initiate") {
        // Full bootstrap: lodge init -> chapter init -> chapter build
        effectiveRootDir = await bootstrapChapter(options.chapter, {
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
        // Non-initiate: just resolve the chapter directory
        const { lodgeHome } = resolveLodgeVarsDep();
        effectiveRootDir = path.join(lodgeHome, "chapters", options.chapter);
        if (!existsSyncDep(effectiveRootDir)) {
          throw new Error(
            `Chapter '${options.chapter}' not found at ${effectiveRootDir}. ` +
            `Use '--chapter initiate' for automatic bootstrap, or create the chapter manually.`,
          );
        }
        console.log(`[clawmasons acp] Using chapter '${options.chapter}' at ${effectiveRootDir}`);
      }
    }

    // ── Step 1: Resolve role from CLAWMASONS_HOME ───────────────────────
    const home = getHome();
    let entry = findRole(home, options.role);

    // Auto-init if role not found
    if (!entry) {
      console.error(`\n[clawmasons acp] Role "${options.role}" not found in chapters.json. Auto-initializing...`);
      await autoInitRole(effectiveRootDir, { role: options.role });

      // Re-read after init
      entry = findRole(home, options.role);

      if (!entry) {
        throw new Error(
          `Role "${options.role}" not initialized and auto-init failed. Run "clawmasons chapter init-role --role ${options.role}" from your chapter workspace.`,
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

    // Route ALL console output to the file logger so downstream modules
    // (build, pack, docker-init, init-role, etc.) never pollute stdout.
    // Skip when a custom logger is injected (e.g. tests) to avoid interfering
    // with test spies.
    if (!deps?.createLoggerFn) {
      console.log = (...args: unknown[]) => logger!.log(...args);
      console.error = (...args: unknown[]) => logger!.error(...args);
    }

    // Ensure .clawmasons is in chapter workspace's .gitignore
    ensureGitignore(effectiveRootDir, ".clawmasons");

    // ── Step 2: Discover packages ──────────────────────────────────────
    logger.log("[clawmasons acp] Discovering packages...");
    const packages = discover(effectiveRootDir);

    // ── Step 3: Resolve agent ──────────────────────────────────────────
    const agentName = resolveAgentName(options.initAgent ?? options.agent, packages);
    logger.log(`[clawmasons acp] Resolving agent "${agentName}"...`);
    const agent = resolve(agentName, packages);

    // ── Step 4: Compute tool filters ───────────────────────────────────
    const toolFilters = computeToolFilters(agent);
    const toolCount = Object.keys(toolFilters).length;

    // ── Step 4b: Collect env credentials ─────────────────────────────
    const envCredentials = collectEnvCredentials(agent);
    const envCredCount = Object.keys(envCredentials).length;

    logger.log(`[clawmasons acp] Agent: ${agent.name}`);
    logger.log(`[clawmasons acp] Role: ${options.role}`);
    logger.log(`[clawmasons acp] Tool filters: ${toolCount} app(s)`);
    if (envCredCount > 0) {
      logger.log(`[clawmasons acp] Env credentials: ${envCredCount} key(s) from process.env`);
    }

    // ── Step 5: Create session and start infrastructure ────────────────
    const runtime = agent.runtimes[0] ?? "node";
    const acpRuntimeCmd = ACP_RUNTIME_COMMANDS[runtime];
    const acpCommand = acpRuntimeCmd
      ? [...acpRuntimeCmd.split(" ").slice(1), "--port", String(acpAgentPort)]
      : undefined;

    // Collect all declared credential keys for the agent
    const declaredCredentialKeys = new Set<string>(agent.credentials);
    for (const role of agent.roles) {
      for (const app of role.apps) {
        for (const key of app.credentials) {
          declaredCredentialKeys.add(key);
        }
      }
    }

    session = createSession({
      projectDir: effectiveRootDir,
      agent: agent.slug,
      role: options.role,
      acpPort: acpAgentPort,
      proxyPort,
      acpCommand,
      credentialKeys: [...declaredCredentialKeys],
    }, { logger });

    logger.log("[clawmasons acp] Starting infrastructure (proxy)...");
    const infraInfo = await session.startInfrastructure();
    logger.log(`[clawmasons acp] Infrastructure started (${infraInfo.sessionId})`);

    // ── Step 5b: Start credential service in-process ──────────────────
    logger.log("[clawmasons acp] Starting credential service (in-process)...");
    const startCredService = deps?.startCredentialServiceFn ?? (async (opts: {
      proxyPort: number;
      credentialProxyToken: string;
      envCredentials: Record<string, string>;
    }) => {
      const svc = new CredentialService({
        dbPath: ":memory:",
        keychainService: "clawmasons",
      });
      const credCount = Object.keys(opts.envCredentials).length;
      if (credCount > 0) {
        svc.setSessionOverrides(opts.envCredentials);
      }
      const client = new CredentialWSClient(svc, {
        maxRetries: 10,
        retryDelayMs: 2000,
      });
      await client.connect(
        `ws://localhost:${opts.proxyPort}/ws/credentials`,
        opts.credentialProxyToken,
      );
      return { disconnect: () => client.disconnect(), close: () => svc.close() };
    });

    const credServiceHandle = await startCredService({
      proxyPort,
      credentialProxyToken: infraInfo.credentialProxyToken,
      envCredentials,
    });
    // Store references for shutdown handler
    credentialWsClient = { disconnect: credServiceHandle.disconnect } as CredentialWSClient;
    credentialService = { close: credServiceHandle.close } as CredentialService;
    logger.log("[clawmasons acp] Credential service connected to proxy.");

    // ── Step 6: Start ACP bridge endpoint ──────────────────────────────
    // In stdio mode, the HTTP bridge runs on a random internal port.
    // In http mode, it runs on the user-specified --port.
    const bridgePort = transport === "stdio" ? 0 : port;
    bridge = createBridge({
      hostPort: bridgePort,
      containerHost: "localhost",
      containerPort: acpAgentPort,
      connectRetries: 30,
      connectRetryDelayMs: 2000,
      logger,
    });

    // ── Step 7: Wire bridge lifecycle events ───────────────────────────
    // Capture references for use in closures (avoids non-null assertions)
    const logRef = logger;
    const sessionRef = session;
    const bridgeRef = bridge;

    bridge.onClientConnect = () => {
      logRef.log("[clawmasons acp] ACP client connected");
    };

    bridge.onClientDisconnect = () => {
      logRef.log("[clawmasons acp] ACP client disconnected — stopping agent container...");
      void (async () => {
        try {
          if (session) await session.stopAgent();
        } catch { /* best-effort */ }
        if (bridge) bridge.resetForNewSession();
        logRef.log("[clawmasons acp] Agent stopped. Waiting for next session/new...");
      })();
    };

    bridge.onAgentError = (error: Error) => {
      logRef.error(`[clawmasons acp] Agent error: ${error.message}`);
    };

    // Wire session/new handler for deferred agent start
    bridge.onSessionNew = async (cwd: string) => {
      logRef.log(`[clawmasons acp] session/new received — cwd: "${cwd}"`);

      // Create .clawmasons/ in the CWD for session state
      const clawmasonsDir = path.join(cwd, ".clawmasons");
      mkdirSync(clawmasonsDir, { recursive: true });

      // Ensure .gitignore in the CWD directory
      ensureGitignore(cwd, ".clawmasons");

      // Start agent container with CWD mounted as /workspace
      logRef.log("[clawmasons acp] Starting agent container...");
      const agentInfo = await sessionRef.startAgent(cwd);
      logRef.log(`[clawmasons acp] Agent started (${agentInfo.sessionId})`);

      // Connect bridge to the agent
      logRef.log("[clawmasons acp] Connecting bridge to agent...");
      await bridgeRef.connectToAgent();
      logRef.log("[clawmasons acp] Bridge connected to agent.");
    };

    await bridge.start();

    // ── Step 8: Start transport layer ──────────────────────────────────
    if (transport === "stdio") {
      // Resolve the actual port the OS assigned to the HTTP bridge
      const actualPort = bridge.getPort();
      stdioBridge = new StdioBridge({ httpPort: actualPort, logger });
      stdioBridge.start();
      logger.log(`[clawmasons acp] Stdio transport active (internal HTTP on port ${actualPort})`);
    }

    const chapterInfo = options.chapter ? `\n  Chapter:    ${options.chapter}` : "";
    const transportInfo = transport === "stdio"
      ? "  Transport: stdio\n"
      : `  ACP port:   ${port}\n`;
    logger.log(
      `\n[clawmasons acp] Ready -- ${transport === "stdio" ? "stdio transport active" : `waiting for ACP client on port ${port}`}\n` +
      `  Agent:      ${agent.name}\n` +
      `  Role:       ${options.role}\n` +
      transportInfo +
      `  Proxy port: ${proxyPort}${chapterInfo}\n` +
      `  Mode:       deferred (agent starts on session/new)\n`,
    );

    // The process stays alive via the bridge HTTP server.
    // Shutdown happens via SIGINT/SIGTERM.

  } catch (error) {
    // Restore console so error messages reach the terminal
    console.log = origLog;
    console.error = origError;
    const message = error instanceof Error ? error.message : String(error);
    const log = logger ?? { log: origError, error: origError, close: () => {} };
    log.error(`\n[clawmasons acp] Failed: ${message}\n`);

    // Clean up on startup failure
    try { if (stdioBridge) stdioBridge.stop(); } catch { /* best-effort */ }
    try { if (bridge) await bridge.stop(); } catch { /* best-effort */ }
    try { if (session) await session.stop(); } catch { /* best-effort */ }
    try { log.close(); } catch { /* best-effort */ }
    process.exit(1);
  }
}
