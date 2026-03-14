/**
 * Dialect Registry — maps agent directories to field name translations.
 *
 * Each supported agent runtime uses its own vocabulary in ROLE.md frontmatter.
 * The registry normalizes these to generic ROLE_TYPES field names:
 *   - tasks (Claude: commands, Codex: instructions, Aider: conventions)
 *   - apps (all: mcp_servers)
 *   - skills (all: skills)
 *
 * New runtimes are registered by calling `registerDialect()`.
 */

export interface DialectFieldMapping {
  /** Agent-specific field name for tasks (e.g., "commands") */
  tasks: string;
  /** Agent-specific field name for apps (e.g., "mcp_servers") */
  apps: string;
  /** Agent-specific field name for skills (e.g., "skills") */
  skills: string;
}

export interface DialectEntry {
  /** Dialect identifier (e.g., "claude-code") */
  name: string;
  /** Agent directory name without dot (e.g., "claude") */
  directory: string;
  /** Mapping from generic field names to agent-specific field names */
  fieldMapping: DialectFieldMapping;
}

// Internal mutable registry
const dialects: Map<string, DialectEntry> = new Map();
// directory → dialect name lookup
const directoryToDialect: Map<string, string> = new Map();

/**
 * Register a new dialect entry. Overwrites if the same name already exists.
 */
export function registerDialect(entry: DialectEntry): void {
  dialects.set(entry.name, entry);
  directoryToDialect.set(entry.directory, entry.name);
}

/**
 * Look up a dialect by its name (e.g., "claude-code").
 */
export function getDialect(name: string): DialectEntry | undefined {
  return dialects.get(name);
}

/**
 * Look up a dialect by its directory name (e.g., "claude").
 * The directory should not include the leading dot.
 */
export function getDialectByDirectory(directory: string): DialectEntry | undefined {
  const dialectName = directoryToDialect.get(directory);
  if (!dialectName) return undefined;
  return dialects.get(dialectName);
}

/**
 * Get all registered dialect entries.
 */
export function getAllDialects(): DialectEntry[] {
  return [...dialects.values()];
}

/**
 * Get all known agent directory names (without dot prefix).
 */
export function getKnownDirectories(): string[] {
  return [...directoryToDialect.keys()];
}

// ---------------------------------------------------------------------------
// Built-in dialects (per PRD Appendix B)
// ---------------------------------------------------------------------------

registerDialect({
  name: "claude-code",
  directory: "claude",
  fieldMapping: {
    tasks: "commands",
    apps: "mcp_servers",
    skills: "skills",
  },
});

registerDialect({
  name: "codex",
  directory: "codex",
  fieldMapping: {
    tasks: "instructions",
    apps: "mcp_servers",
    skills: "skills",
  },
});

registerDialect({
  name: "aider",
  directory: "aider",
  fieldMapping: {
    tasks: "conventions",
    apps: "mcp_servers",
    skills: "skills",
  },
});

registerDialect({
  name: "mcp-agent",
  directory: "mcp",
  fieldMapping: {
    tasks: "commands",
    apps: "mcp_servers",
    skills: "skills",
  },
});

registerDialect({
  name: "bash-agent",
  directory: "bash",
  fieldMapping: {
    tasks: "commands",
    apps: "mcp_servers",
    skills: "skills",
  },
});
