import type { UnmatchedServer } from "./matcher.js";

/**
 * Format a single warning message for a dropped MCP server.
 *
 * Produces a multi-line string matching the PRD REQ-004 format:
 * ```
 * [mason run-acp-agent] WARNING: Dropping unmatched MCP server "<name>"
 *   -> No chapter App matches server name, command, or URL
 *   -> Agent will not have access to tools from this server
 *   -> To govern this server, create a chapter App package for it
 * ```
 *
 * @param server - The unmatched server to format a warning for
 * @returns A formatted multi-line warning string
 */
export function formatWarning(server: UnmatchedServer): string {
  return [
    `[mason run-acp-agent] WARNING: Dropping unmatched MCP server "${server.name}"`,
    `  \u2192 ${server.reason}`,
    `  \u2192 Agent will not have access to tools from this server`,
    `  \u2192 To govern this server, create a chapter App package for it`,
  ].join("\n");
}

/**
 * Generate warning messages for all unmatched/dropped MCP servers.
 *
 * @param unmatched - The unmatched servers from the matcher
 * @returns An array of formatted warning strings (empty if no unmatched servers)
 */
export function generateWarnings(unmatched: UnmatchedServer[]): string[] {
  return unmatched.map(formatWarning);
}
