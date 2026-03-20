import { getAppShortName } from "@clawmasons/shared";
import type { ResolvedApp } from "@clawmasons/shared";

/**
 * An MCP server configuration from an ACP client's mcpServers map.
 */
export interface McpServerConfig {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

/**
 * A matched MCP server linked to its App.
 */
export interface MatchedServer {
  /** The mcpServers key (e.g., "github") */
  name: string;
  /** The original MCP server config from the ACP client */
  config: McpServerConfig;
  /** The App that matched */
  app: ResolvedApp;
  /** The app's short name (e.g., "github") */
  appShortName: string;
}

/**
 * An unmatched MCP server with a reason for not matching.
 */
export interface UnmatchedServer {
  /** The mcpServers key */
  name: string;
  /** The original MCP server config from the ACP client */
  config: McpServerConfig;
  /** Human-readable explanation of why no match was found */
  reason: string;
}

/**
 * The result of matching ACP client mcpServers against Apps.
 */
export interface MatchResult {
  matched: MatchedServer[];
  unmatched: UnmatchedServer[];
}

/**
 * Build a case-insensitive index from app short names to their ResolvedApp objects.
 * Multiple apps can share the same short name (handled by disambiguation).
 */
export function buildAppShortNameIndex(
  apps: ResolvedApp[],
): Map<string, ResolvedApp[]> {
  const index = new Map<string, ResolvedApp[]>();
  for (const app of apps) {
    const shortName = getAppShortName(app.name).toLowerCase();
    let list = index.get(shortName);
    if (!list) {
      list = [];
      index.set(shortName, list);
    }
    list.push(app);
  }
  return index;
}

/**
 * Check if command+args match between an mcpServers entry and an app.
 */
function commandMatches(config: McpServerConfig, app: ResolvedApp): boolean {
  if (!config.command || !app.command) return false;
  if (config.command !== app.command) return false;

  const configArgs = config.args ?? [];
  const appArgs = app.args ?? [];
  if (configArgs.length !== appArgs.length) return false;
  return configArgs.every((arg, i) => arg === appArgs[i]);
}

/**
 * Check if URL matches between an mcpServers entry and an app.
 */
function urlMatches(config: McpServerConfig, app: ResolvedApp): boolean {
  if (!config.url || !app.url) return false;
  return config.url === app.url;
}

/**
 * Disambiguate among multiple apps that share the same short name,
 * using command+args or URL as secondary signals.
 */
function disambiguate(
  config: McpServerConfig,
  candidates: ResolvedApp[],
): ResolvedApp {
  // Try command+args match
  for (const app of candidates) {
    if (commandMatches(config, app)) return app;
  }

  // Try URL match
  for (const app of candidates) {
    if (urlMatches(config, app)) return app;
  }

  // No disambiguation possible — return first candidate
  // candidates is guaranteed non-empty by the caller
  const fallback = candidates[0];
  if (!fallback) throw new Error("Unexpected empty candidates array");
  return fallback;
}

/**
 * Match ACP client mcpServers entries against resolved Apps.
 *
 * Matching uses `getAppShortName()` as the primary key (case-insensitive).
 * When multiple apps share the same short name, command+args or URL
 * are used as secondary disambiguation signals.
 *
 * @param mcpServers - The ACP client's mcpServers configuration map
 * @param apps - The resolved Apps from the agent dependency graph
 * @returns A MatchResult with matched and unmatched server lists
 */
export function matchServers(
  mcpServers: Record<string, McpServerConfig>,
  apps: ResolvedApp[],
): MatchResult {
  const index = buildAppShortNameIndex(apps);
  const matched: MatchedServer[] = [];
  const unmatched: UnmatchedServer[] = [];

  for (const [name, config] of Object.entries(mcpServers)) {
    const key = name.toLowerCase();
    const candidates = index.get(key);

    if (!candidates || candidates.length === 0) {
      unmatched.push({
        name,
        config,
        reason: `No matching App found for server "${name}"`,
      });
      continue;
    }

    const app =
      candidates.length === 1
        ? (candidates[0] ?? disambiguate(config, candidates))
        : disambiguate(config, candidates);

    matched.push({
      name,
      config,
      app,
      appShortName: getAppShortName(app.name),
    });
  }

  return { matched, unmatched };
}
