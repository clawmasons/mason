import { CLI_NAME_LOWERCASE } from "@clawmasons/shared";
import type { MatchResult, MatchedServer, McpServerConfig } from "./matcher.js";

/**
 * The result of rewriting ACP client mcpServers for the agent container.
 */
export interface RewriteResult {
  /** The rewritten mcpServers config with a single proxy entry */
  mcpServers: Record<string, McpServerConfig>;
  /** Credentials extracted from matched servers' env fields (for credential-service session overrides) */
  extractedCredentials: Record<string, string>;
}

/**
 * Extract all credential key-value pairs from matched servers' env fields.
 *
 * Merges all env records into a single flat record. If two servers provide
 * the same key, the later one wins (iteration order of matched array).
 *
 * @param matched - The matched servers from the matcher
 * @returns A flat record of all credential key-value pairs
 */
export function extractCredentials(
  matched: MatchedServer[],
): Record<string, string> {
  const credentials: Record<string, string> = {};
  for (const server of matched) {
    if (server.config.env) {
      for (const [key, value] of Object.entries(server.config.env)) {
        credentials[key] = value;
      }
    }
  }
  return credentials;
}

/**
 * Rewrite the ACP client's mcpServers config for the agent container.
 *
 * Replaces all matched MCP server entries with a single entry
 * pointing to the proxy's streamable-http endpoint. Extracts
 * credentials from matched servers' env fields for injection into the
 * credential-service as session overrides.
 *
 * @param matchResult - The result from matchServers()
 * @param proxyUrl - The proxy URL inside the Docker network (e.g., "http://proxy:3000/mcp")
 * @param sessionToken - The session authentication token
 * @returns The rewritten mcpServers config and extracted credentials
 */
export function rewriteMcpConfig(
  matchResult: MatchResult,
  proxyUrl: string,
  sessionToken: string,
): RewriteResult {
  const extractedCredentials = extractCredentials(matchResult.matched);

  const mcpServers: Record<string, McpServerConfig> = {
    [CLI_NAME_LOWERCASE]: {
      url: proxyUrl,
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    },
  };

  return { mcpServers, extractedCredentials };
}
