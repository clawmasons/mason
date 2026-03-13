/**
 * ROLE.md Parser — reads a local ROLE.md file and produces a RoleType object.
 *
 * Steps:
 * 1. Detect the agent dialect from the parent directory structure
 * 2. Parse YAML frontmatter and extract markdown body as instructions
 * 3. Normalize agent-specific field names to generic ROLE_TYPES names
 * 4. Resolve bundled resource paths
 * 5. Resolve dependency references
 * 6. Validate through roleTypeSchema
 */

import { readFile } from "node:fs/promises";
import { dirname, basename, resolve } from "node:path";
import { load as yamlLoad } from "js-yaml";
import { roleTypeSchema } from "../schemas/role-types.js";
import type { RoleType } from "../types/role-types.js";
import {
  getDialectByDirectory,
  getKnownDirectories,
  type DialectEntry,
} from "./dialect-registry.js";
import { scanBundledResources } from "./resource-scanner.js";

/**
 * Parse error thrown when ROLE.md is malformed.
 */
export class RoleParseError extends Error {
  constructor(message: string, public readonly rolePath: string) {
    super(`${message} (at ${rolePath})`);
    this.name = "RoleParseError";
  }
}

/**
 * Read a local ROLE.md file and produce a validated RoleType object.
 *
 * @param rolePath - Absolute path to the ROLE.md file
 * @returns Validated RoleType
 * @throws RoleParseError if the file is malformed or dialect cannot be detected
 */
export async function readMaterializedRole(rolePath: string): Promise<RoleType> {
  // Read the file
  const content = await readFile(rolePath, "utf-8");

  // Parse frontmatter and body
  const { frontmatter, body } = parseFrontmatter(content, rolePath);

  // Detect dialect from directory structure
  const roleDir = dirname(rolePath);
  const dialect = detectDialect(roleDir, rolePath);

  // Extract metadata
  const roleName = frontmatter.name ?? basename(roleDir);
  const metadata = {
    name: roleName,
    description: frontmatter.description as string | undefined,
    version: frontmatter.version as string | undefined,
    scope: frontmatter.scope as string | undefined,
  };

  if (!metadata.description) {
    throw new RoleParseError("Missing required field: description", rolePath);
  }

  // Normalize fields using dialect mapping
  const tasks = normalizeTasks(frontmatter, dialect);
  const apps = normalizeApps(frontmatter, dialect);
  const skills = normalizeSkills(frontmatter, dialect, roleDir);

  // Container requirements (pass-through, no normalization needed)
  const container = frontmatter.container ?? {};

  // Governance (assembled from top-level fields)
  const governance: Record<string, unknown> = {};
  if (frontmatter.risk !== undefined) governance.risk = frontmatter.risk;
  if (frontmatter.credentials !== undefined) governance.credentials = frontmatter.credentials;
  if (frontmatter.constraints !== undefined) governance.constraints = frontmatter.constraints;

  // Scan bundled resources
  const resources = await scanBundledResources(roleDir);

  // Build the role object and validate through Zod
  const roleData = {
    metadata,
    instructions: body,
    tasks,
    apps,
    skills,
    container,
    governance,
    resources,
    source: {
      type: "local" as const,
      agentDialect: dialect.name,
      path: roleDir,
    },
  };

  return roleTypeSchema.parse(roleData);
}

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

interface ParsedFrontmatter {
  frontmatter: Record<string, unknown>;
  body: string;
}

/**
 * Parse YAML frontmatter delimited by `---` markers.
 */
export function parseFrontmatter(content: string, rolePath: string): ParsedFrontmatter {
  const trimmed = content.trimStart();

  if (!trimmed.startsWith("---")) {
    throw new RoleParseError(
      "ROLE.md must start with YAML frontmatter (---)",
      rolePath,
    );
  }

  // Find the closing ---
  const endIndex = trimmed.indexOf("\n---", 3);
  if (endIndex === -1) {
    throw new RoleParseError(
      "ROLE.md frontmatter is not closed (missing closing ---)",
      rolePath,
    );
  }

  const yamlStr = trimmed.substring(3, endIndex).trim();
  const body = trimmed.substring(endIndex + 4).trim(); // skip \n---

  let frontmatter: unknown;
  try {
    frontmatter = yamlLoad(yamlStr);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new RoleParseError(`Invalid YAML in frontmatter: ${msg}`, rolePath);
  }

  if (typeof frontmatter !== "object" || frontmatter === null || Array.isArray(frontmatter)) {
    throw new RoleParseError(
      "Frontmatter must be a YAML mapping (key-value pairs)",
      rolePath,
    );
  }

  return {
    frontmatter: frontmatter as Record<string, unknown>,
    body,
  };
}

// ---------------------------------------------------------------------------
// Dialect detection
// ---------------------------------------------------------------------------

/**
 * Detect the agent dialect from the role's directory structure.
 *
 * Expected pattern: `<project>/.<agent>/roles/<role-name>/`
 * We walk up from the role directory looking for a known agent directory.
 */
export function detectDialect(roleDir: string, rolePath: string): DialectEntry {
  // roleDir = /path/to/project/.claude/roles/my-role
  // We expect the parent of "roles" to be the agent directory
  const rolesParent = dirname(roleDir);  // .../roles
  const agentDir = dirname(rolesParent); // .../.claude

  // Check that we're inside a "roles" directory
  if (basename(rolesParent) !== "roles") {
    throw new RoleParseError(
      `ROLE.md must be inside a roles/ directory (expected <project>/.<agent>/roles/<role-name>/ROLE.md)`,
      rolePath,
    );
  }

  // Get the agent directory name (e.g., ".claude" → "claude")
  const agentDirName = basename(agentDir);
  if (!agentDirName.startsWith(".")) {
    throw new RoleParseError(
      `Agent directory must start with a dot (got "${agentDirName}")`,
      rolePath,
    );
  }

  const directoryKey = agentDirName.substring(1); // strip the dot
  const dialect = getDialectByDirectory(directoryKey);
  if (!dialect) {
    throw new RoleParseError(
      `Unknown agent dialect for directory "${agentDirName}". Known directories: ${getKnownDirsForError()}`,
      rolePath,
    );
  }

  return dialect;
}

function getKnownDirsForError(): string {
  return getKnownDirectories()
    .map((d) => `.${d}/`)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Field normalization
// ---------------------------------------------------------------------------

/**
 * Normalize the dialect-specific tasks field.
 * Claude: commands, Codex: instructions, Aider: conventions
 * Returns raw objects — Zod validates and applies defaults.
 */
function normalizeTasks(
  frontmatter: Record<string, unknown>,
  dialect: DialectEntry,
): Array<Record<string, unknown>> {
  const fieldName = dialect.fieldMapping.tasks;
  const raw = frontmatter[fieldName];
  if (!raw) return [];

  if (!Array.isArray(raw)) {
    return [{ name: String(raw) }];
  }

  return raw.map((item: unknown) => {
    if (typeof item === "string") {
      return { name: item };
    }
    if (typeof item === "object" && item !== null && "name" in item) {
      return item as Record<string, unknown>;
    }
    return { name: String(item) };
  });
}

/**
 * Normalize the dialect-specific apps field.
 * All dialects currently use mcp_servers.
 * Returns raw objects — Zod validates and applies defaults.
 */
function normalizeApps(
  frontmatter: Record<string, unknown>,
  dialect: DialectEntry,
): Array<Record<string, unknown>> {
  const fieldName = dialect.fieldMapping.apps;
  const raw = frontmatter[fieldName];
  if (!raw) return [];

  if (!Array.isArray(raw)) return [];

  return raw.map((item: unknown) => {
    if (typeof item === "object" && item !== null) {
      return item as Record<string, unknown>;
    }
    // String shorthand — just a server name
    return { name: String(item) };
  });
}

/**
 * Normalize the dialect-specific skills field.
 * All dialects currently use "skills".
 * Returns raw objects — Zod validates and applies defaults.
 */
function normalizeSkills(
  frontmatter: Record<string, unknown>,
  dialect: DialectEntry,
  roleDir: string,
): Array<Record<string, unknown>> {
  const fieldName = dialect.fieldMapping.skills;
  const raw = frontmatter[fieldName];
  if (!raw) return [];

  if (!Array.isArray(raw)) return [];

  // Find the project root (parent of the agent directory)
  const projectRoot = resolve(roleDir, "..", "..", "..");

  return raw.map((item: unknown) => {
    if (typeof item === "string") {
      // Local path reference — resolve relative to project root
      if (item.startsWith("./") || item.startsWith("../")) {
        const resolvedPath = resolve(projectRoot, item);
        const name = basename(resolvedPath);
        return { name, ref: resolvedPath };
      }
      // Package reference — extract short name
      const name = item.startsWith("@")
        ? item.split("/").pop() ?? item
        : item;
      return { name, ref: item };
    }
    if (typeof item === "object" && item !== null && "name" in item) {
      return item as Record<string, unknown>;
    }
    return { name: String(item) };
  });
}
