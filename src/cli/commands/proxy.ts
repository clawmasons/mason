import type { Command } from "commander";
import { join } from "node:path";
import { discoverPackages } from "../../resolver/discover.js";
import { resolveAgent } from "../../resolver/resolve.js";
import type { ResolvedAgent } from "../../resolver/types.js";
import { computeToolFilters } from "../../generator/toolfilter.js";
import { loadEnvFile, resolveEnvVars } from "../../proxy/credentials.js";
import { openDatabase } from "../../proxy/db.js";
import { UpstreamManager } from "../../proxy/upstream.js";
import type { UpstreamAppConfig } from "../../proxy/upstream.js";
import { ToolRouter, ResourceRouter, PromptRouter } from "../../proxy/router.js";
import { ChapterProxyServer } from "../../proxy/server.js";
import type Database from "better-sqlite3";

// ── Types ──────────────────────────────────────────────────────────────

interface ProxyOptions {
  port?: string;
  startupTimeout?: string;
  agent?: string;
}

// ── Command Registration ──────────────────────────────────────────────

export function registerProxyCommand(program: Command): void {
  program
    .command("proxy")
    .description("Start the chapter MCP proxy server for an agent")
    .option("--port <number>", "Port to listen on (default: from agent config or 9090)")
    .option("--startup-timeout <seconds>", "Upstream server startup timeout in seconds (default: 60)")
    .option("--agent <name>", "Agent package name (auto-detected if only one agent)")
    .action(async (options: ProxyOptions) => {
      await startProxy(process.cwd(), options);
    });
}

// ── Startup Orchestrator ──────────────────────────────────────────────

export async function startProxy(
  rootDir: string,
  options: ProxyOptions,
): Promise<void> {
  let db: Database.Database | undefined;
  let upstream: UpstreamManager | undefined;
  let server: ChapterProxyServer | undefined;

  // Graceful shutdown handler
  const shutdown = async () => {
    console.log("\nShutting down chapter proxy...");
    try {
      if (server) await server.stop();
    } catch { /* best-effort */ }
    try {
      if (upstream) await upstream.shutdown();
    } catch { /* best-effort */ }
    try {
      if (db) db.close();
    } catch { /* best-effort */ }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  try {
    // ── Step 1: Discover packages ──────────────────────────────────────
    console.log("Discovering packages...");
    const packages = discoverPackages(rootDir);

    // ── Step 2: Resolve agent ──────────────────────────────────────────
    const agentName = resolveAgentName(options.agent, packages);
    console.log(`Resolving agent "${agentName}"...`);
    const agent = resolveAgent(agentName, packages);

    // ── Step 3: Compute tool filters ───────────────────────────────────
    const toolFilters = computeToolFilters(agent);

    // ── Step 4: Load credentials from .env ─────────────────────────────
    const envPath = join(rootDir, ".env");
    const loadedEnv = loadEnvFile(envPath);

    // ── Step 5: Open SQLite ────────────────────────────────────────────
    db = openDatabase();

    // ── Step 6: Start upstream MCP clients ─────────────────────────────
    const appConfigs = collectApps(agent, loadedEnv);
    upstream = new UpstreamManager(appConfigs);

    const timeoutMs = options.startupTimeout
      ? parseInt(options.startupTimeout, 10) * 1000
      : 60_000;

    console.log(`Connecting to ${appConfigs.length} upstream server(s)...`);
    await upstream.initialize(timeoutMs);

    // ── Step 7: Build routing tables ───────────────────────────────────
    const upstreamTools = new Map<string, import("@modelcontextprotocol/sdk/types.js").Tool[]>();
    const upstreamResources = new Map<string, import("@modelcontextprotocol/sdk/types.js").Resource[]>();
    const upstreamPrompts = new Map<string, import("@modelcontextprotocol/sdk/types.js").Prompt[]>();

    for (const config of appConfigs) {
      const [tools, resources, prompts] = await Promise.all([
        upstream.getTools(config.name),
        upstream.getResources(config.name).catch(() => []),
        upstream.getPrompts(config.name).catch(() => []),
      ]);
      upstreamTools.set(config.name, tools);
      upstreamResources.set(config.name, resources);
      upstreamPrompts.set(config.name, prompts);
    }

    const router = new ToolRouter(upstreamTools, toolFilters);
    const resourceRouter = new ResourceRouter(upstreamResources);
    const promptRouter = new PromptRouter(upstreamPrompts);

    // ── Step 8: Collect approval patterns ──────────────────────────────
    const approvalPatterns = collectApprovalPatterns(agent);

    // ── Step 9: Start MCP server ───────────────────────────────────────
    const port = options.port
      ? parseInt(options.port, 10)
      : agent.proxy?.port ?? 9090;
    const transport = agent.proxy?.type ?? "sse";

    server = new ChapterProxyServer({
      port,
      transport,
      router,
      upstream,
      db,
      agentName: agent.name,
      approvalPatterns: approvalPatterns.length > 0 ? approvalPatterns : undefined,
      resourceRouter,
      promptRouter,
    });

    await server.start();

    // ── Step 10: Ready ─────────────────────────────────────────────────
    const toolCount = router.listTools().length;
    const resourceCount = resourceRouter.listResources().length;
    const promptCount = promptRouter.listPrompts().length;

    console.log(
      `\nchapter proxy ready\n` +
      `  Agent:     ${agent.name}\n` +
      `  Port:      ${port}\n` +
      `  Transport: ${transport}\n` +
      `  Tools:     ${toolCount}\n` +
      `  Resources: ${resourceCount}\n` +
      `  Prompts:   ${promptCount}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✘ Proxy startup failed: ${message}\n`);
    // Clean up on startup failure
    try { if (upstream) await upstream.shutdown(); } catch { /* best-effort */ }
    try { if (db) db.close(); } catch { /* best-effort */ }
    process.exit(1);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Resolve the agent name from --agent flag or auto-detect from packages.
 */
function resolveAgentName(
  agentFlag: string | undefined,
  packages: Map<string, import("../../resolver/types.js").DiscoveredPackage>,
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

  return agents[0];
}

/**
 * Collect unique apps from all roles, resolving env vars with loaded credentials.
 */
function collectApps(
  agent: ResolvedAgent,
  loadedEnv: Record<string, string>,
): UpstreamAppConfig[] {
  const seen = new Map<string, UpstreamAppConfig>();

  for (const role of agent.roles) {
    for (const app of role.apps) {
      if (seen.has(app.name)) continue;

      const resolvedEnv = app.env
        ? resolveEnvVars(app.env, loadedEnv)
        : undefined;

      seen.set(app.name, {
        name: app.name,
        app,
        env: resolvedEnv,
      });
    }
  }

  return Array.from(seen.values());
}

/**
 * Collect all requireApprovalFor patterns from all roles (deduplicated).
 */
function collectApprovalPatterns(agent: ResolvedAgent): string[] {
  const patterns = new Set<string>();

  for (const role of agent.roles) {
    if (role.constraints?.requireApprovalFor) {
      for (const pattern of role.constraints.requireApprovalFor) {
        patterns.add(pattern);
      }
    }
  }

  return [...patterns];
}
