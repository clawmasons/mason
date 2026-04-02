#!/usr/bin/env node
/**
 * Direct entry point for the proxy server — reads `proxy-config.json` from
 * the working directory and starts the proxy without package discovery.
 *
 * Used inside Docker containers for fast boot. Bypasses Commander.js and
 * all CLI command registrations so the esbuild bundle stays small.
 */

import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { format } from "node:util";
import type { ProxyConfigFile } from "@clawmasons/shared";
import { CLI_NAME_UPPERCASE } from "@clawmasons/shared";
import {
  resolveEnvVars,
  UpstreamManager,
  ToolRouter,
  ResourceRouter,
  PromptRouter,
  ProxyServer,
  setLocalAuditPath,
} from "@clawmasons/proxy";
import type { UpstreamMcpConfig } from "@clawmasons/proxy";

// ── File logging (Docker containers only) ────────────────────────────

const MASON_LOGS_DIR = "/mason-logs";
if (existsSync(MASON_LOGS_DIR)) {
  const logStream = createWriteStream(`${MASON_LOGS_DIR}/proxy.log`, { flags: "a" });
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args: unknown[]) => {
    origLog(...args);
    logStream.write(`${new Date().toISOString()} [INFO] ${format(...args)}\n`);
  };
  console.error = (...args: unknown[]) => {
    origError(...args);
    logStream.write(`${new Date().toISOString()} [ERROR] ${format(...args)}\n`);
  };
  setLocalAuditPath(`${MASON_LOGS_DIR}/audit.log`);
}

// ── Minimal arg parsing (no Commander overhead) ──────────────────────

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx !== -1 && idx + 1 < process.argv.length
    ? process.argv[idx + 1]
    : undefined;
}

// ── Config-based startup ─────────────────────────────────────────────

async function main(): Promise<void> {
  let upstream: UpstreamManager | undefined;
  let server: ProxyServer | undefined;

  // Graceful shutdown handler
  const shutdown = async () => {
    console.log("\nShutting down mason proxy...");
    const forceExit = setTimeout(() => {
      console.error("Shutdown timed out after 5s, forcing exit");
      process.exit(1);
    }, 5000);
    forceExit.unref();

    try { if (server) await server.stop(); } catch { /* best-effort */ }
    try { if (upstream) await upstream.shutdown(); } catch { /* best-effort */ }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  try {
    const t0 = performance.now();
    const elapsed = () => `[+${Math.round(performance.now() - t0)}ms]`;
    let stepStart = t0;
    const stepMs = () => { const d = Math.round(performance.now() - stepStart); stepStart = performance.now(); return d; };

    // ── Step 1: Read proxy config ───────────────────────────────────
    const configPath = join(process.cwd(), "proxy-config.json");
    if (!existsSync(configPath)) {
      console.error(`\n  proxy-config.json not found at ${configPath}\n`);
      process.exit(1);
    }

    console.log(`${elapsed()} Reading proxy-config.json...`);
    const config: ProxyConfigFile = JSON.parse(readFileSync(configPath, "utf-8"));
    console.log(`${elapsed()} Config loaded: role="${config.role}", ${config.upstreams.length} upstream(s) (${stepMs()}ms)`);

    // ── Step 2: Resolve env var placeholders ────────────────────────
    const mcpConfigs: UpstreamMcpConfig[] = config.upstreams.map((u) => {
      const resolvedEnv = u.server.env
        ? resolveEnvVars(u.server.env, {})
        : undefined;
      return {
        name: u.name,
        server: { ...u.server, env: resolvedEnv },
        env: resolvedEnv,
        cwd: process.env.PROJECT_DIR,
      };
    });

    // ── Step 3: Build tool filters map ──────────────────────────────
    const toolFilters = new Map(Object.entries(config.toolFilters));

    // ── Step 4: Create upstream manager ─────────────────────────────
    upstream = new UpstreamManager(mcpConfigs);

    const startupTimeoutArg = getArg("--startup-timeout");
    const timeoutMs = startupTimeoutArg
      ? parseInt(startupTimeoutArg, 10) * 1000
      : 60_000;

    // ── Step 5: Start HTTP server EARLY ─────────────────────────────
    const portArg = getArg("--port");
    const port = portArg ? parseInt(portArg, 10) : 9090;
    const transport = (getArg("--transport") as "sse" | "streamable-http" | undefined) ?? "sse";
    const authToken = process.env[`${CLI_NAME_UPPERCASE}_PROXY_TOKEN`] || undefined;
    const relayToken = process.env.RELAY_TOKEN || process.env.CREDENTIAL_PROXY_TOKEN || undefined;
    const sessionType = process.env[`${CLI_NAME_UPPERCASE}_SESSION_TYPE`] || undefined;
    const acpClient = process.env[`${CLI_NAME_UPPERCASE}_ACP_CLIENT`] || undefined;

    let declaredCredentials: string[] | undefined;
    const declaredCredentialsEnv = process.env[`${CLI_NAME_UPPERCASE}_DECLARED_CREDENTIALS`];
    if (declaredCredentialsEnv) {
      try { declaredCredentials = JSON.parse(declaredCredentialsEnv) as string[]; } catch { /* ignore */ }
    }

    let resolveReady!: () => void;
    const readyGate = new Promise<void>((r) => { resolveReady = r; });
    const emptyRouter = new ToolRouter(new Map(), new Map());

    console.log(`${elapsed()} Starting HTTP server on port ${port}...`);
    stepStart = performance.now();
    server = new ProxyServer({
      port,
      transport,
      router: emptyRouter,
      upstream,
      agentName: config.role,
      authToken,
      relayToken,
      approvalPatterns: config.approvalPatterns.length > 0 ? config.approvalPatterns : undefined,
      declaredCredentials,
      sessionType,
      acpClient,
      readyGate,
    });

    await server.start();
    console.log(`${elapsed()} Server listening (${stepMs()}ms)`);

    // ── Step 6: Connect upstream MCP servers ────────────────────────
    console.log(`${elapsed()} Connecting to ${mcpConfigs.length} upstream server(s)...`);
    stepStart = performance.now();
    await upstream.initialize(timeoutMs);
    console.log(`${elapsed()} Upstream connected (${stepMs()}ms)`);

    // ── Step 7: Build routing tables and open the ready gate ────────
    console.log(`${elapsed()} Fetching tools/resources/prompts...`);
    stepStart = performance.now();
    const upstreamTools = new Map<string, import("@modelcontextprotocol/sdk/types.js").Tool[]>();
    const upstreamResources = new Map<string, import("@modelcontextprotocol/sdk/types.js").Resource[]>();
    const upstreamPrompts = new Map<string, import("@modelcontextprotocol/sdk/types.js").Prompt[]>();

    for (const cfg of mcpConfigs) {
      const [tools, resources, prompts] = await Promise.all([
        upstream.getTools(cfg.name),
        upstream.getResources(cfg.name).catch(() => []),
        upstream.getPrompts(cfg.name).catch(() => []),
      ]);
      upstreamTools.set(cfg.name, tools);
      upstreamResources.set(cfg.name, resources);
      upstreamPrompts.set(cfg.name, prompts);
    }

    const router = new ToolRouter(upstreamTools, toolFilters);
    const resourceRouter = new ResourceRouter(upstreamResources);
    const promptRouter = new PromptRouter(upstreamPrompts);
    server.setRouting({ router, resourceRouter, promptRouter });
    resolveReady();
    console.log(`${elapsed()} Routing tables built (${stepMs()}ms)`);

    // ── Step 8: Ready ───────────────────────────────────────────────
    const totalMs = Math.round(performance.now() - t0);
    const toolCount = router.listTools().length;
    const resourceCount = resourceRouter.listResources().length;
    const promptCount = promptRouter.listPrompts().length;

    console.log(
      `\nmason proxy ready (${totalMs}ms total)\n` +
      `  Role:      ${config.role}\n` +
      `  Port:      ${port}\n` +
      `  Transport: ${transport}\n` +
      `  Tools:     ${toolCount}\n` +
      `  Resources: ${resourceCount}\n` +
      `  Prompts:   ${promptCount}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  Proxy startup failed: ${message}\n`);
    try { if (upstream) await upstream.shutdown(); } catch { /* best-effort */ }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
