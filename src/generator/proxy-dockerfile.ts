import type { ResolvedAgent, ResolvedApp } from "../resolver/types.js";

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
 * Check whether any app in the agent uses stdio transport.
 */
function hasStdioApps(agent: ResolvedAgent): boolean {
  const apps = collectAllApps(agent);
  for (const [, app] of apps) {
    if (app.transport === "stdio") {
      return true;
    }
  }
  return false;
}

/**
 * Generate a multi-stage Dockerfile for the mcp-proxy container.
 *
 * When any app uses stdio transport (e.g. `npx @modelcontextprotocol/server-*`),
 * the proxy container needs Node.js installed. This generates a Dockerfile that
 * copies the mcp-proxy binary into a Node.js base image.
 *
 * Returns `null` when all apps are remote (SSE/streamable-http) — no custom
 * image needed, the stock proxy image works as-is.
 */
export function generateProxyDockerfile(
  agent: ResolvedAgent,
): string | null {
  if (!hasStdioApps(agent)) {
    return null;
  }

  const proxyImage = agent.proxy?.image ?? "ghcr.io/tbxark/mcp-proxy:latest";

  return `FROM ${proxyImage} AS proxy

FROM node:22-slim
COPY --from=proxy /main /usr/local/bin/mcp-proxy
ENTRYPOINT ["mcp-proxy"]
CMD ["--config", "/config/config.json"]
`;
}
