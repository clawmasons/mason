import type { Command } from "commander";
import { join } from "node:path";
import { discoverPackages } from "../../resolver/discover.js";
import { resolveRolePackage } from "../../resolver/resolve.js";
import type { ResolvedAgent } from "@clawmasons/shared";
import { computeToolFilters } from "@clawmasons/shared";
import {
  loadEnvFile,
  resolveEnvVars,
  openDatabase,
  UpstreamManager,
  ToolRouter,
  ResourceRouter,
  PromptRouter,
  ChapterProxyServer,
} from "@clawmasons/proxy";
import type { UpstreamAppConfig } from "@clawmasons/proxy";
import type Database from "better-sqlite3";

// ── Types ──────────────────────────────────────────────────────────────

interface ProxyOptions {
  port?: string;
  startupTimeout?: string;
  agent?: string;
  role?: string;
  transport?: string;
}

// ── Command Registration ──────────────────────────────────────────────

export function registerProxyCommand(program: Command): void {
  program
    .command("proxy")
    .description("Start the chapter MCP proxy server for a role")
    .option("--port <number>", "Port to listen on (default: 9090)")
    .option("--startup-timeout <seconds>", "Upstream server startup timeout in seconds (default: 60)")
    .option("--agent <name>", "Agent package name (for backward compatibility)")
    .option("--role <name>", "Role package name to proxy for")
    .option("--transport <type>", "Transport type: sse or streamable-http (default: sse)")
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
    console.log("\nShutting down mason proxy...");
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
    const t0 = performance.now();
    const elapsed = () => `[+${Math.round(performance.now() - t0)}ms]`;
    let stepStart = t0;
    const stepMs = () => { const d = Math.round(performance.now() - stepStart); stepStart = performance.now(); return d; };

    // ── Step 1: Discover packages ──────────────────────────────────────
    console.log(`${elapsed()} Discovering packages...`);
    const packages = discoverPackages(rootDir);
    console.log(`${elapsed()} Discovered ${packages.size} packages (${stepMs()}ms)`);

    // ── Step 2: Resolve role ───────────────────────────────────────────
    const roleName = resolveRoleName(options.agent ?? options.role, packages);
    console.log(`${elapsed()} Resolving role "${roleName}"...`);
    const resolvedRole = resolveRolePackage(roleName, packages);
    console.log(`${elapsed()} Role resolved (${stepMs()}ms)`);

    // Build a ResolvedAgent wrapper for compatibility with existing proxy infrastructure
    const agent: ResolvedAgent = {
      name: roleName,
      version: resolvedRole.version,
      agentName: roleName,
      slug: roleName.replace(/^@[^/]+\//, "").replace(/[^a-z0-9-]/g, "-"),
      runtimes: ["claude-code"],
      credentials: [],
      roles: [resolvedRole],
    };

    // ── Step 3: Compute tool filters ───────────────────────────────────
    const toolFilters = computeToolFilters(agent);

    // ── Step 4: Load credentials from .env ─────────────────────────────
    const envPath = join(rootDir, ".env");
    const loadedEnv = loadEnvFile(envPath);

    // ── Step 5: Open SQLite ────────────────────────────────────────────
    console.log(`${elapsed()} Opening database...`);
    stepStart = performance.now();
    db = openDatabase();
    console.log(`${elapsed()} Database opened (${stepMs()}ms)`);

    // ── Step 6: Create upstream manager ──────────────────────────────────
    const projectDir = process.env.PROJECT_DIR;
    const appConfigs = collectApps(agent, loadedEnv, projectDir);
    upstream = new UpstreamManager(appConfigs);

    const timeoutMs = options.startupTimeout
      ? parseInt(options.startupTimeout, 10) * 1000
      : 60_000;

    // ── Step 7: Collect approval patterns ──────────────────────────────
    const approvalPatterns = collectApprovalPatterns(agent);

    // ── Step 8: Start HTTP server EARLY ────────────────────────────────
    // Health, connect-agent, and credential_request work immediately.
    // Tool/resource/prompt calls block on readyGate until upstreams connect.
    const port = options.port
      ? parseInt(options.port, 10)
      : 9090;
    const transport = (options.transport as "sse" | "streamable-http" | undefined)
      ?? "sse";
    const authToken = process.env.CHAPTER_PROXY_TOKEN || undefined;
    const credentialProxyToken = process.env.CREDENTIAL_PROXY_TOKEN || undefined;
    const sessionType = process.env.CHAPTER_SESSION_TYPE || undefined;
    const acpClient = process.env.CHAPTER_ACP_CLIENT || undefined;

    // Parse declared credentials from env (set by ACP session compose)
    let declaredCredentials: string[] | undefined;
    const declaredCredentialsEnv = process.env.CHAPTER_DECLARED_CREDENTIALS;
    if (declaredCredentialsEnv) {
      try {
        declaredCredentials = JSON.parse(declaredCredentialsEnv) as string[];
      } catch { /* ignore parse errors */ }
    }

    // Deferred ready gate — resolves once upstreams + routing are ready
    let resolveReady!: () => void;
    const readyGate = new Promise<void>((r) => { resolveReady = r; });

    // Start with an empty router; setRouting() will update once upstreams connect
    const emptyRouter = new ToolRouter(new Map(), new Map());

    console.log(`${elapsed()} Starting HTTP server on port ${port}...`);
    stepStart = performance.now();
    server = new ChapterProxyServer({
      port,
      transport,
      router: emptyRouter,
      upstream,
      db,
      agentName: agent.name,
      authToken,
      credentialProxyToken,
      approvalPatterns: approvalPatterns.length > 0 ? approvalPatterns : undefined,
      declaredCredentials,
      sessionType,
      acpClient,
      readyGate,
    });

    await server.start();
    console.log(`${elapsed()} Server listening (${stepMs()}ms)`);

    // ── Step 9: Connect upstream MCP servers ─────────────────────────────
    console.log(`${elapsed()} Connecting to ${appConfigs.length} upstream server(s)...`);
    stepStart = performance.now();
    await upstream.initialize(timeoutMs);
    console.log(`${elapsed()} Upstream connected (${stepMs()}ms)`);

    // ── Step 10: Build routing tables and open the ready gate ───────────
    console.log(`${elapsed()} Fetching tools/resources/prompts...`);
    stepStart = performance.now();
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
    server.setRouting({ router, resourceRouter, promptRouter });
    resolveReady();
    console.log(`${elapsed()} Routing tables built (${stepMs()}ms)`);

    // ── Step 11: Ready ─────────────────────────────────────────────────
    const totalMs = Math.round(performance.now() - t0);
    const toolCount = router.listTools().length;
    const resourceCount = resourceRouter.listResources().length;
    const promptCount = promptRouter.listPrompts().length;

    console.log(
      `\nmason proxy ready (${totalMs}ms total)\n` +
      `  Role:      ${roleName}\n` +
      `  Port:      ${port}\n` +
      `  Transport: ${transport}\n` +
      `  Tools:     ${toolCount}\n` +
      `  Resources: ${resourceCount}\n` +
      `  Prompts:   ${promptCount}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  Proxy startup failed: ${message}\n`);
    // Clean up on startup failure
    try { if (upstream) await upstream.shutdown(); } catch { /* best-effort */ }
    try { if (db) db.close(); } catch { /* best-effort */ }
    process.exit(1);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Resolve the role name from --role/--agent flag or auto-detect from packages.
 */
function resolveRoleName(
  roleFlag: string | undefined,
  packages: Map<string, import("@clawmasons/shared").DiscoveredPackage>,
): string {
  if (roleFlag) return roleFlag;

  const roles: string[] = [];
  for (const [name, pkg] of packages) {
    if (pkg.chapterField.type === "role") {
      roles.push(name);
    }
  }

  if (roles.length === 0) {
    throw new Error(
      "No role packages found in this workspace. " +
      "Use --role <name> to specify a role, or create a ROLE.md in your project.",
    );
  }

  if (roles.length > 1) {
    throw new Error(
      `Multiple role packages found: ${roles.join(", ")}. ` +
      "Use --role <name> to specify which role to proxy for.",
    );
  }

  // Safe: we checked roles.length === 1 above
  const [role] = roles;
  return role as string;
}

/**
 * Collect unique apps from all roles, resolving env vars with loaded credentials.
 */
function collectApps(
  agent: ResolvedAgent,
  loadedEnv: Record<string, string>,
  cwd?: string,
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
        cwd,
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
