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

import type { AgentTaskConfig, AgentSkillConfig } from "../types.js";

export interface DialectFieldMapping {
  /** Agent-specific field name for tasks (e.g., "commands") */
  tasks: string;
  /** Agent-specific field name for apps (e.g., "mcp_servers") */
  apps: string;
  /** Agent-specific field name for skills (e.g., "skills") */
  skills: string;
}

export interface DialectEntry {
  /** Dialect identifier (e.g., "claude-code-agent") */
  name: string;
  /** Agent directory name without dot (e.g., "claude") */
  directory: string;
  /** Mapping from generic field names to agent-specific field names */
  fieldMapping: DialectFieldMapping;
  /** Optional task file layout config for this dialect's agent. */
  taskConfig?: AgentTaskConfig;
  /** Optional skill file layout config for this dialect's agent. */
  skillConfig?: AgentSkillConfig;
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
 * Look up a dialect by its name (e.g., "claude-code-agent").
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

/**
 * Resolve a user-provided source name to the dialect registry key.
 *
 * Accepts any of:
 *   - Full registry key: "claude-code-agent"
 *   - Dot-prefixed directory: ".claude"
 *   - Short directory name: "claude"
 *
 * Returns the dialect registry key (e.g., "claude-code-agent") or undefined
 * if the input does not match any registered dialect.
 */
export function resolveDialectName(input: string): string | undefined {
  // 1. Exact registry key match (e.g., "claude-code-agent")
  if (getDialect(input)) return input;
  // 2. Strip leading dot and try directory lookup (e.g., ".claude" → "claude")
  const stripped = input.startsWith(".") ? input.slice(1) : input;
  const entry = getDialectByDirectory(stripped);
  return entry?.name;
}

// ---------------------------------------------------------------------------
// Built-in dialects (per PRD Appendix B)
// ---------------------------------------------------------------------------

registerDialect({
  name: "claude-code-agent",
  directory: "claude",
  fieldMapping: {
    tasks: "commands",
    apps: "mcp_servers",
    skills: "skills",
  },
  taskConfig: {
    projectFolder: ".claude/commands",
    nameFormat: "{scopePath}/{taskName}.md",
    scopeFormat: "path",
    supportedFields: ["name->displayName", "description", "category", "tags"],
    prompt: "markdown-body",
  },
  skillConfig: {
    projectFolder: ".claude/skills",
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
  name: "pi-coding-agent",
  directory: "pi",
  fieldMapping: {
    tasks: "prompts",
    apps: "mcp_servers",
    skills: "skills",
  },
  taskConfig: {
    projectFolder: ".pi/prompts",
    nameFormat: "{scopeKebab}-{taskName}.md",
    scopeFormat: "kebab-case-prefix",
    supportedFields: ["description"],
    prompt: "markdown-body",
  },
  skillConfig: {
    projectFolder: "skills",
  },
});

registerDialect({
  name: "pi-coding-agent",
  directory: "pi",
  fieldMapping: {
    tasks: "prompts",
    apps: "mcp_servers",
    skills: "skills",
  },
  taskConfig: {
    projectFolder: ".pi/prompts",
    nameFormat: "{scopeKebab}-{taskName}.md",
    scopeFormat: "kebab-case-prefix",
    supportedFields: ["description"],
    prompt: "markdown-body",
  },
  skillConfig: {
    projectFolder: "skills",
  },
});

// The canonical mason location (.mason/roles/) uses generic field names
registerDialect({
  name: "mason",
  directory: "mason",
  fieldMapping: {
    tasks: "tasks",
    apps: "mcp_servers",
    skills: "skills",
  },
  taskConfig: {
    projectFolder: ".mason/tasks",
    nameFormat: "{scopePath}/{taskName}.md",
    scopeFormat: "path",
    supportedFields: "all",
    prompt: "markdown-body",
  },
  skillConfig: {
    projectFolder: ".mason/skills",
  },
});

