/**
 * Mason ROLE.md Proposer — generates draft ROLE.md from scanner results.
 *
 * Takes a ScanResult and produces a valid ROLE.md string with:
 * - YAML frontmatter populated from discovered configuration
 * - Least-privilege MCP server permissions (empty allow lists)
 * - Credentials extracted from MCP server env keys
 * - Default container ignore paths
 * - System prompt as markdown body
 */

import { dump as yamlDump } from "js-yaml";
import { basename } from "node:path";
import type { ScanResult } from "./scanner.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProposeOptions {
  /** Role name override (defaults to project directory name) */
  roleName?: string;
  /** Role description override (defaults to a placeholder) */
  description?: string;
  /** Target dialect for the ROLE.md (defaults to "claude-code-agent") */
  targetDialect?: string;
}

// ---------------------------------------------------------------------------
// Proposer
// ---------------------------------------------------------------------------

/**
 * Generate a draft ROLE.md from scanner results.
 *
 * The generated ROLE.md:
 * - Uses the Claude Code dialect by default
 * - Maps discovered skills, commands, and MCP servers to frontmatter fields
 * - Applies least-privilege permissions (empty tools.allow lists)
 * - Extracts credentials from MCP server env keys with empty values
 * - Includes default container ignore paths
 * - Uses the discovered system prompt as the markdown body
 *
 * @param scanResult - Output from scanProject()
 * @param options - Optional overrides for role name, description, dialect
 * @returns Valid ROLE.md string
 */
export function proposeRoleMd(
  scanResult: ScanResult,
  options?: ProposeOptions,
): string {
  const roleName =
    options?.roleName ?? basename(scanResult.projectDir);
  const description =
    options?.description ?? `Role for ${roleName} project`;

  // Build frontmatter object
  const frontmatter: Record<string, unknown> = {
    name: roleName,
    description,
  };

  // Commands (Claude dialect field name)
  if (scanResult.commands.length > 0) {
    frontmatter.commands = scanResult.commands.map((c) => c.name);
  }

  // Skills
  if (scanResult.skills.length > 0) {
    frontmatter.skills = scanResult.skills.map((s) => s.name);
  }

  // MCP Servers with least-privilege permissions
  if (scanResult.mcpServers.length > 0) {
    frontmatter.mcp = scanResult.mcpServers.map((server) => {
      const entry: Record<string, unknown> = {
        name: server.name,
        tools: {
          allow: [], // Least-privilege: no tools granted by default
        },
      };

      if (server.command) {
        entry.command = server.command;
      }
      if (server.args && server.args.length > 0) {
        entry.args = server.args;
      }
      if (server.url) {
        entry.url = server.url;
      }

      return entry;
    });
  }

  // Container requirements with default ignore paths
  frontmatter.container = {
    ignore: {
      paths: [".mason/", ".claude/", ".env"],
    },
  };

  // Governance — extract credentials from MCP server env
  const credentials = extractCredentials(scanResult);
  if (credentials.length > 0) {
    frontmatter.credentials = credentials;
  }

  // Generate YAML frontmatter
  const yamlStr = yamlDump(frontmatter, {
    lineWidth: -1,
    noRefs: true,
    quotingType: "'",
    forceQuotes: false,
  }).trim();

  // Build markdown body
  const body = scanResult.systemPrompt ?? generatePlaceholderPrompt(roleName);

  return `---\n${yamlStr}\n---\n\n${body}\n`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract credential names from MCP server env configurations.
 * Keys with empty string values are treated as credential references
 * (the actual values are provided at runtime by the credential service).
 */
function extractCredentials(scanResult: ScanResult): string[] {
  const credentialSet = new Set<string>();

  for (const server of scanResult.mcpServers) {
    if (!server.env) continue;

    for (const [key, value] of Object.entries(server.env)) {
      // Empty string values indicate credential placeholders
      if (value === "") {
        credentialSet.add(key);
      }
    }
  }

  return [...credentialSet].sort();
}

/**
 * Generate a minimal placeholder system prompt.
 */
function generatePlaceholderPrompt(roleName: string): string {
  return `You are an AI assistant operating in the ${roleName} role.

Review and customize this system prompt to describe the specific behavior,
constraints, and capabilities for this role.`;
}
