import type { Command } from "commander";
import type { DiscoveredPackage, ResolvedAgent } from "@clawmasons/shared";
import { computeToolFilters } from "@clawmasons/shared";
import { discoverPackages } from "../../resolver/discover.js";
import { resolveAgent } from "../../resolver/resolve.js";
import { AcpSession, type AcpSessionConfig, type AcpSessionDeps } from "../../acp/session.js";
import { AcpBridge, type AcpBridgeConfig } from "../../acp/bridge.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface AcpProxyOptions {
  agent?: string;
  role: string;
  port?: number;
  proxyPort?: number;
}

/**
 * Dependencies for acpProxy, injectable for testing.
 */
export interface AcpProxyDeps {
  /** Override package discovery (for testing). */
  discoverPackagesFn?: (rootDir: string) => Map<string, DiscoveredPackage>;
  /** Override agent resolution (for testing). */
  resolveAgentFn?: (name: string, packages: Map<string, DiscoveredPackage>) => ResolvedAgent;
  /** Override AcpSession construction (for testing). */
  createSessionFn?: (config: AcpSessionConfig, sessionDeps?: AcpSessionDeps) => AcpSession;
  /** Override AcpBridge construction (for testing). */
  createBridgeFn?: (config: AcpBridgeConfig) => AcpBridge;
}

// ── Command Registration ──────────────────────────────────────────────

export function registerAcpProxyCommand(program: Command): void {
  program
    .command("acp-proxy")
    .description("Start an ACP-compliant proxy endpoint for editor integration")
    .requiredOption("--role <name>", "Role to use for the session")
    .option("--agent <name>", "Agent package name (auto-detected if only one)")
    .option("--port <number>", "ACP endpoint port (default: 3001)", "3001")
    .option("--proxy-port <number>", "Internal chapter proxy port (default: 3000)", "3000")
    .action(async (options: { agent?: string; role: string; port: string; proxyPort: string }) => {
      await acpProxy(process.cwd(), {
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

export async function acpProxy(
  rootDir: string,
  options: AcpProxyOptions,
  deps?: AcpProxyDeps,
): Promise<void> {
  const discover = deps?.discoverPackagesFn ?? discoverPackages;
  const resolve = deps?.resolveAgentFn ?? resolveAgent;
  const createSession = deps?.createSessionFn ?? ((config: AcpSessionConfig, sessionDeps?: AcpSessionDeps) => new AcpSession(config, sessionDeps));
  const createBridge = deps?.createBridgeFn ?? ((config: AcpBridgeConfig) => new AcpBridge(config));

  const port = options.port ?? 3001;
  const proxyPort = options.proxyPort ?? 3000;
  const acpAgentPort = 3002;

  let session: AcpSession | null = null;
  let bridge: AcpBridge | null = null;

  // Graceful shutdown handler
  const shutdown = async () => {
    console.log("\n[chapter acp-proxy] Shutting down...");
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
    // ── Step 1: Discover packages ──────────────────────────────────────
    console.log("[chapter acp-proxy] Discovering packages...");
    const packages = discover(rootDir);

    // ── Step 2: Resolve agent ──────────────────────────────────────────
    const agentName = resolveAgentName(options.agent, packages);
    console.log(`[chapter acp-proxy] Resolving agent "${agentName}"...`);
    const agent = resolve(agentName, packages);

    // ── Step 3: Compute tool filters ───────────────────────────────────
    const toolFilters = computeToolFilters(agent);
    const toolCount = Object.keys(toolFilters).length;

    console.log(`[chapter acp-proxy] Agent: ${agent.name}`);
    console.log(`[chapter acp-proxy] Role: ${options.role}`);
    console.log(`[chapter acp-proxy] Tool filters: ${toolCount} app(s)`);

    // ── Step 4: Start ACP bridge endpoint ──────────────────────────────
    bridge = createBridge({
      hostPort: port,
      containerHost: "localhost",
      containerPort: acpAgentPort,
    });

    // ── Step 5: Wire bridge lifecycle events ───────────────────────────
    bridge.onClientConnect = () => {
      console.log("[chapter acp-proxy] ACP client connected");
    };

    bridge.onClientDisconnect = () => {
      console.log("[chapter acp-proxy] ACP client disconnected — tearing down session...");
      void (async () => {
        try {
          if (bridge) await bridge.stop();
        } catch { /* best-effort */ }
        try {
          if (session) await session.stop();
        } catch { /* best-effort */ }
        console.log("[chapter acp-proxy] Session torn down. Exiting.");
        process.exit(0);
      })();
    };

    bridge.onAgentError = (error: Error) => {
      console.error(`[chapter acp-proxy] Agent error: ${error.message}`);
    };

    await bridge.start();

    console.log(
      `\n[chapter acp-proxy] Ready -- waiting for ACP client on port ${port}\n` +
      `  Agent:      ${agent.name}\n` +
      `  Role:       ${options.role}\n` +
      `  ACP port:   ${port}\n` +
      `  Proxy port: ${proxyPort}\n`,
    );

    // ── Step 6: Create and start session ───────────────────────────────
    // In the current v1 model, we start the Docker session immediately
    // rather than waiting for client mcpServers (since the bridge is a
    // transparent relay and doesn't parse ACP protocol messages).
    session = createSession({
      projectDir: rootDir,
      agent: agentName,
      role: options.role,
      acpPort: acpAgentPort,
      proxyPort,
    });

    console.log("[chapter acp-proxy] Starting Docker session...");
    const sessionInfo = await session.start();
    console.log(`[chapter acp-proxy] Docker session started (${sessionInfo.sessionId})`);

    // ── Step 7: Connect bridge to container agent ──────────────────────
    console.log("[chapter acp-proxy] Connecting bridge to container agent...");
    await bridge.connectToAgent();
    console.log("[chapter acp-proxy] Bridge connected to agent. ACP proxy is active.");

    // The process stays alive via the bridge HTTP server.
    // Shutdown happens via SIGINT/SIGTERM or client disconnect.

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n[chapter acp-proxy] Failed: ${message}\n`);

    // Clean up on startup failure
    try { if (bridge) await bridge.stop(); } catch { /* best-effort */ }
    try { if (session) await session.stop(); } catch { /* best-effort */ }
    process.exit(1);
  }
}
