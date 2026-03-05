import type { ResolvedAgent, ResolvedApp } from "../resolver/types.js";
import { computeToolFilters, getAppShortName } from "./toolfilter.js";
import type { McpServerEntry, ProxyConfig } from "./types.js";

/**
 * Collect all unique apps from a resolved agent's roles.
 */
function collectAllApps(agent: ResolvedAgent): Map<string, ResolvedApp> {
  const apps = new Map<string, ResolvedApp>();

  for (const role of agent.roles) {
    for (const app of role.apps) {
      if (!apps.has(app.name)) {
        apps.set(app.name, app);
      }
    }
  }

  return apps;
}

/**
 * Build an mcpServer entry for a resolved app with its computed toolFilter.
 */
function buildServerEntry(
  app: ResolvedApp,
  toolFilter: { mode: "allow"; list: string[] },
): McpServerEntry {
  const entry: McpServerEntry = {
    options: {
      logEnabled: true,
      toolFilter,
    },
  };

  if (app.transport === "stdio") {
    entry.command = app.command;
    entry.args = app.args;
  } else {
    entry.url = app.url;
  }

  if (app.env && Object.keys(app.env).length > 0) {
    entry.env = { ...app.env };
  }

  return entry;
}

/**
 * Generate a complete tbxark/mcp-proxy config.json from a resolved agent.
 *
 * Computes per-app toolFilters from role permission unions, assembles
 * mcpServers entries for all apps (stdio and remote), and generates
 * proxy-level settings including authentication.
 *
 * The auth token in the config uses `${FORGE_PROXY_TOKEN}` placeholder.
 * Callers (e.g., `forge install`) generate the actual token and write it
 * to `.env` for Docker runtime interpolation.
 */
export function generateProxyConfig(
  agent: ResolvedAgent,
): ProxyConfig {
  const port = agent.proxy?.port ?? 9090;
  const proxyType = agent.proxy?.type ?? "sse";
  const agentShortName = getAppShortName(agent.name);

  // Compute toolFilters
  const toolFilters = computeToolFilters(agent);

  // Collect all apps and build server entries
  const allApps = collectAllApps(agent);
  const mcpServers: Record<string, McpServerEntry> = {};

  for (const [appName, app] of allApps) {
    const shortName = getAppShortName(appName);
    const toolFilter = toolFilters.get(appName) ?? { mode: "allow" as const, list: [] };
    mcpServers[shortName] = buildServerEntry(app, toolFilter);
  }

  return {
    mcpProxy: {
      baseURL: `http://mcp-proxy:${port}`,
      addr: `:${port}`,
      name: `forge-proxy-${agentShortName}`,
      version: agent.version,
      type: proxyType,
      options: {
        panicIfInvalid: false,
        logEnabled: true,
        authTokens: ["${FORGE_PROXY_TOKEN}"],
      },
    },
    mcpServers,
  };
}
