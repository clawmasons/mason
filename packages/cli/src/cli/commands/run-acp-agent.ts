import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import type { DiscoveredPackage, ResolvedAgent } from "@clawmasons/shared";
import { computeToolFilters } from "@clawmasons/shared";
import { discoverPackages } from "../../resolver/discover.js";
import { resolveAgent } from "../../resolver/resolve.js";
import { AcpSession, type AcpSessionConfig, type AcpSessionDeps } from "../../acp/session.js";
import { AcpBridge, type AcpBridgeConfig } from "../../acp/bridge.js";
import {
  getClawmasonsHome,
  findRoleEntryByRole,
  type ChapterEntry,
} from "../../runtime/home.js";
import { ensureGitignoreEntry } from "../../runtime/gitignore.js";
import { initRole, type InitRoleOptions, type InitRoleDeps } from "./init-role.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface RunAcpAgentOptions {
  agent?: string;
  role: string;
  port?: number;
  proxyPort?: number;
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
}

// ── Help Text ─────────────────────────────────────────────────────────

export const RUN_ACP_AGENT_HELP_EPILOG = `
Session Behavior:
  When an ACP client sends session/new with a "cwd" field, the agent
  container mounts that directory as /workspace. Each session/new starts
  a fresh agent container; the proxy and credential-service stay running.

  If no "cwd" is provided in session/new, the current working directory
  of this process is used as the default.

Side Effects:
  - Creates .clawmasons/ in the session's CWD for session logs
  - Appends ".clawmasons" to the project's .gitignore if present

Environment:
  CLAWMASONS_HOME    Base directory for chapter runtime state.
                     Default: ~/.clawmasons

ACP Client Configuration Example (Zed / JetBrains):
  {
    "mcpServers": {
      "clawmasons": {
        "command": "clawmasons",
        "args": ["acp", "--role", "<role-name>"],
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
    .option("--port <number>", "ACP endpoint port (default: 3001)", "3001")
    .option("--proxy-port <number>", "Internal chapter proxy port (default: 3000)", "3000")
    .addHelpText("after", RUN_ACP_AGENT_HELP_EPILOG)
    .action(async (options: { agent?: string; role: string; port: string; proxyPort: string }) => {
      await runAcpAgent(process.cwd(), {
        agent: options.agent,
        role: options.role,
        port: parseInt(options.port, 10),
        proxyPort: parseInt(options.proxyPort, 10),
      });
    });
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

  const port = options.port ?? 3001;
  const proxyPort = options.proxyPort ?? 3000;
  const acpAgentPort = 3002;

  let session: AcpSession | null = null;
  let bridge: AcpBridge | null = null;

  // Graceful shutdown handler
  const shutdown = async () => {
    console.log("\n[clawmasons acp] Shutting down...");
    try {
      if (bridge) await bridge.stop();
    } catch { /* best-effort */ }
    try {
      if (session) await session.stop();
    } catch { /* best-effort */ }
    process.exit(0);
  };

  const onSignal = () => void shutdown();
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    // ── Step 1: Resolve role from CLAWMASONS_HOME ───────────────────────
    const home = getHome();
    let entry = findRole(home, options.role);

    // Auto-init if role not found
    if (!entry) {
      console.log(`\n[clawmasons acp] Role "${options.role}" not found in chapters.json. Auto-initializing...`);
      await autoInitRole(rootDir, { role: options.role });

      // Re-read after init
      entry = findRole(home, options.role);

      if (!entry) {
        throw new Error(
          `Role "${options.role}" not initialized and auto-init failed. Run "clawmasons chapter init-role --role ${options.role}" from your chapter workspace.`,
        );
      }
    }

    // Ensure .clawmasons is in chapter workspace's .gitignore
    ensureGitignore(rootDir, ".clawmasons");

    // ── Step 2: Discover packages ──────────────────────────────────────
    console.log("[clawmasons acp] Discovering packages...");
    const packages = discover(rootDir);

    // ── Step 3: Resolve agent ──────────────────────────────────────────
    const agentName = resolveAgentName(options.agent, packages);
    console.log(`[clawmasons acp] Resolving agent "${agentName}"...`);
    const agent = resolve(agentName, packages);

    // ── Step 4: Compute tool filters ───────────────────────────────────
    const toolFilters = computeToolFilters(agent);
    const toolCount = Object.keys(toolFilters).length;

    console.log(`[clawmasons acp] Agent: ${agent.name}`);
    console.log(`[clawmasons acp] Role: ${options.role}`);
    console.log(`[clawmasons acp] Tool filters: ${toolCount} app(s)`);

    // ── Step 5: Create session and start infrastructure ────────────────
    session = createSession({
      projectDir: rootDir,
      agent: agentName,
      role: options.role,
      acpPort: acpAgentPort,
      proxyPort,
    });

    console.log("[clawmasons acp] Starting infrastructure (proxy + credential-service)...");
    const infraInfo = await session.startInfrastructure();
    console.log(`[clawmasons acp] Infrastructure started (${infraInfo.sessionId})`);

    // ── Step 6: Start ACP bridge endpoint ──────────────────────────────
    bridge = createBridge({
      hostPort: port,
      containerHost: "localhost",
      containerPort: acpAgentPort,
    });

    // ── Step 7: Wire bridge lifecycle events ───────────────────────────
    bridge.onClientConnect = () => {
      console.log("[clawmasons acp] ACP client connected");
    };

    bridge.onClientDisconnect = () => {
      console.log("[clawmasons acp] ACP client disconnected — stopping agent container...");
      void (async () => {
        try {
          if (session) await session.stopAgent();
        } catch { /* best-effort */ }
        if (bridge) bridge.resetForNewSession();
        console.log("[clawmasons acp] Agent stopped. Waiting for next session/new...");
      })();
    };

    bridge.onAgentError = (error: Error) => {
      console.error(`[clawmasons acp] Agent error: ${error.message}`);
    };

    // Wire session/new handler for deferred agent start
    // Capture references for use in the closure (avoids non-null assertions)
    const sessionRef = session;
    const bridgeRef = bridge;
    bridge.onSessionNew = async (cwd: string) => {
      console.log(`[clawmasons acp] session/new received — cwd: "${cwd}"`);

      // Create .clawmasons/ in the CWD for session state
      const clawmasonsDir = path.join(cwd, ".clawmasons");
      mkdirSync(clawmasonsDir, { recursive: true });

      // Ensure .gitignore in the CWD directory
      ensureGitignore(cwd, ".clawmasons");

      // Start agent container with CWD mounted as /workspace
      console.log("[clawmasons acp] Starting agent container...");
      const agentInfo = await sessionRef.startAgent(cwd);
      console.log(`[clawmasons acp] Agent started (${agentInfo.sessionId})`);

      // Connect bridge to the agent
      console.log("[clawmasons acp] Connecting bridge to agent...");
      await bridgeRef.connectToAgent();
      console.log("[clawmasons acp] Bridge connected to agent.");
    };

    await bridge.start();

    console.log(
      `\n[clawmasons acp] Ready -- waiting for ACP client on port ${port}\n` +
      `  Agent:      ${agent.name}\n` +
      `  Role:       ${options.role}\n` +
      `  ACP port:   ${port}\n` +
      `  Proxy port: ${proxyPort}\n` +
      `  Mode:       deferred (agent starts on session/new)\n`,
    );

    // The process stays alive via the bridge HTTP server.
    // Shutdown happens via SIGINT/SIGTERM.

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n[clawmasons acp] Failed: ${message}\n`);

    // Clean up on startup failure
    try { if (bridge) await bridge.stop(); } catch { /* best-effort */ }
    try { if (session) await session.stop(); } catch { /* best-effort */ }
    process.exit(1);
  }
}
