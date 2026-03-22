/**
 * Mason Project Scanner — discovers existing project configuration.
 *
 * Scans a project directory for:
 * - Skills in agent skill directories (determined by AgentSkillConfig or fallback)
 * - Tasks/commands in agent task directories (determined by AgentTaskConfig or fallback)
 * - MCP server configurations from agent settings files
 * - System prompts from CLAUDE.md, AGENTS.md
 *
 * Uses the dialect registry to automatically scan all registered agent directories.
 * Supports filtering by specific dialect names via ScanOptions.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { getAllDialects, type DialectEntry } from "../role/dialect-registry.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoveredSkill {
  /** Skill name (derived from directory name) */
  name: string;
  /** Absolute path to the skill directory */
  path: string;
  /** Dialect that owns this skill (e.g., "claude-code-agent") */
  dialect: string;
}

export interface DiscoveredCommand {
  /** Command name (derived from file name without extension, may include subdirectory) */
  name: string;
  /** Absolute path to the command file */
  path: string;
  /** Dialect that owns this command */
  dialect: string;
}

export interface DiscoveredMcpServer {
  /** Server name (key from settings) */
  name: string;
  /** Command to run the server */
  command?: string;
  /** Arguments for the command */
  args?: string[];
  /** URL for remote servers */
  url?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Dialect that owns this configuration */
  dialect: string;
}

export interface ScanResult {
  /** Absolute path to the scanned project directory */
  projectDir: string;
  /** Discovered skills across all dialect directories */
  skills: DiscoveredSkill[];
  /** Discovered commands/slash-commands */
  commands: DiscoveredCommand[];
  /** Discovered MCP server configurations */
  mcpServers: DiscoveredMcpServer[];
  /** System prompt content from CLAUDE.md or AGENTS.md */
  systemPrompt: string | undefined;
}

export interface ScanOptions {
  /** When provided, only scan these dialect names. Otherwise scan all registered dialects. */
  dialects?: string[];
}

// ---------------------------------------------------------------------------
// Main Scanner
// ---------------------------------------------------------------------------

/**
 * Scan a project directory for existing agent configuration.
 *
 * Iterates over registered dialects (or a filtered subset), scanning each
 * agent directory for skills, commands/tasks, and MCP server configurations.
 *
 * Uses each dialect's AgentTaskConfig and AgentSkillConfig (when available)
 * to determine directory names and scoping rules. Falls back to convention-based
 * defaults when no config is registered.
 *
 * @param projectDir - Absolute path to the project root
 * @param options - Optional scan options (e.g., dialect filter)
 * @returns Scan results with all discovered configuration
 */
export async function scanProject(
  projectDir: string,
  options?: ScanOptions,
): Promise<ScanResult> {
  let dialects = getAllDialects();

  if (options?.dialects) {
    const filterSet = new Set(options.dialects);
    dialects = dialects.filter((d) => filterSet.has(d.name));
  }

  const skills: DiscoveredSkill[] = [];
  const commands: DiscoveredCommand[] = [];
  const mcpServers: DiscoveredMcpServer[] = [];

  for (const dialect of dialects) {
    const agentDir = join(projectDir, `.${dialect.directory}`);

    if (!(await dirExists(agentDir))) {
      continue;
    }

    // Scan skills
    const discoveredSkills = await scanSkills(agentDir, dialect);
    skills.push(...discoveredSkills);

    // Scan commands/tasks
    const discoveredCommands = await scanTasks(agentDir, dialect);
    commands.push(...discoveredCommands);

    // Scan MCP server configs
    const discoveredServers = await scanMcpServers(agentDir, dialect);
    mcpServers.push(...discoveredServers);
  }

  // Read system prompt
  const systemPrompt = await readSystemPrompt(projectDir);

  return {
    projectDir,
    skills,
    commands,
    mcpServers,
    systemPrompt,
  };
}

// ---------------------------------------------------------------------------
// Skills Scanner
// ---------------------------------------------------------------------------

/**
 * Determine the skills subdirectory for a dialect.
 *
 * Uses AgentSkillConfig.projectFolder when available, extracting the
 * subdirectory portion after the agent directory prefix (e.g., ".claude/skills" → "skills").
 * Falls back to "skills" when no config is registered.
 */
function getSkillSubdir(dialect: DialectEntry): string {
  if (dialect.skillConfig) {
    const prefix = `.${dialect.directory}/`;
    if (dialect.skillConfig.projectFolder.startsWith(prefix)) {
      return dialect.skillConfig.projectFolder.slice(prefix.length);
    }
    return dialect.skillConfig.projectFolder;
  }
  return "skills";
}

async function scanSkills(
  agentDir: string,
  dialect: DialectEntry,
): Promise<DiscoveredSkill[]> {
  const skillSubdir = getSkillSubdir(dialect);
  const skillsDir = join(agentDir, skillSubdir);
  if (!(await dirExists(skillsDir))) {
    return [];
  }

  const results: DiscoveredSkill[] = [];
  const entries = await readdir(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillDir = join(skillsDir, entry.name);
    const skillMdPath = join(skillDir, "SKILL.md");

    if (await fileExists(skillMdPath)) {
      results.push({
        name: entry.name,
        path: skillDir,
        dialect: dialect.name,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Tasks/Commands Scanner
// ---------------------------------------------------------------------------

/**
 * Determine the tasks subdirectory for a dialect.
 *
 * Uses AgentTaskConfig.projectFolder when available, extracting the
 * subdirectory portion after the agent directory prefix (e.g., ".claude/commands" → "commands").
 * Falls back to the dialect's fieldMapping.tasks value (e.g., "commands", "instructions").
 */
function getTaskSubdir(dialect: DialectEntry): string {
  if (dialect.taskConfig) {
    const prefix = `.${dialect.directory}/`;
    if (dialect.taskConfig.projectFolder.startsWith(prefix)) {
      return dialect.taskConfig.projectFolder.slice(prefix.length);
    }
    return dialect.taskConfig.projectFolder;
  }
  // Fallback: use field mapping name
  return dialect.fieldMapping.tasks;
}

/**
 * Scan tasks/commands from an agent directory, using the dialect's task config
 * to determine directory structure and scoping rules.
 *
 * When scopeFormat is "path": recursively walk subdirectories, joining paths
 * into scoped command names (e.g., "opsx/deploy").
 *
 * When scopeFormat is "kebab-case-prefix": scan flat files only (no recursion).
 * Per PRD §4.3, it is impossible to distinguish scope boundaries from task name
 * parts in kebab-case, so tasks are assumed to have no scope.
 */
async function scanTasks(
  agentDir: string,
  dialect: DialectEntry,
): Promise<DiscoveredCommand[]> {
  const taskSubdir = getTaskSubdir(dialect);
  const tasksDir = join(agentDir, taskSubdir);
  if (!(await dirExists(tasksDir))) {
    return [];
  }

  // Determine scoping behavior from task config
  const usePathScoping = dialect.taskConfig
    ? dialect.taskConfig.scopeFormat === "path"
    : true; // default: assume path-based scoping (preserves current behavior)

  if (usePathScoping) {
    const results: DiscoveredCommand[] = [];
    await walkTasks(tasksDir, tasksDir, dialect, results);
    return results;
  } else {
    // Flat scan — no recursion into subdirectories, no scope
    return flatScanTasks(tasksDir, dialect);
  }
}

async function walkTasks(
  baseDir: string,
  currentDir: string,
  dialect: DialectEntry,
  results: DiscoveredCommand[],
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await walkTasks(baseDir, fullPath, dialect, results);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      const relPath = relative(baseDir, fullPath);
      // Remove .md extension for command name
      const name = relPath.replace(/\.md$/, "");
      results.push({
        name,
        path: fullPath,
        dialect: dialect.name,
      });
    }
  }
}

/**
 * Flat scan for tasks — reads only .md files in the top-level directory,
 * without recursing into subdirectories. Used for agents with
 * kebab-case-prefix scope format where scope cannot be reliably determined.
 */
async function flatScanTasks(
  tasksDir: string,
  dialect: DialectEntry,
): Promise<DiscoveredCommand[]> {
  const results: DiscoveredCommand[] = [];
  const entries = await readdir(tasksDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const fullPath = join(tasksDir, entry.name);
      const name = entry.name.replace(/\.md$/, "");
      results.push({
        name,
        path: fullPath,
        dialect: dialect.name,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// MCP Server Scanner
// ---------------------------------------------------------------------------

async function scanMcpServers(
  agentDir: string,
  dialect: DialectEntry,
): Promise<DiscoveredMcpServer[]> {
  // Read settings files (base + local)
  const baseSettings = await readJsonFile(join(agentDir, "settings.json"));
  const localSettings = await readJsonFile(join(agentDir, "settings.local.json"));

  // Merge: local overrides base
  const mergedServers: Record<string, Record<string, unknown>> = {};

  if (baseSettings?.mcpServers && typeof baseSettings.mcpServers === "object") {
    Object.assign(mergedServers, baseSettings.mcpServers as Record<string, unknown>);
  }
  if (localSettings?.mcpServers && typeof localSettings.mcpServers === "object") {
    Object.assign(mergedServers, localSettings.mcpServers as Record<string, unknown>);
  }

  const results: DiscoveredMcpServer[] = [];

  for (const [name, config] of Object.entries(mergedServers)) {
    if (typeof config !== "object" || config === null) continue;

    const serverConfig = config as Record<string, unknown>;
    const server: DiscoveredMcpServer = {
      name,
      dialect: dialect.name,
    };

    if (typeof serverConfig.command === "string") {
      server.command = serverConfig.command;
    }
    if (Array.isArray(serverConfig.args)) {
      server.args = serverConfig.args.map(String);
    }
    if (typeof serverConfig.url === "string") {
      server.url = serverConfig.url;
    }
    if (
      typeof serverConfig.env === "object" &&
      serverConfig.env !== null &&
      !Array.isArray(serverConfig.env)
    ) {
      server.env = serverConfig.env as Record<string, string>;
    }

    results.push(server);
  }

  return results;
}

// ---------------------------------------------------------------------------
// System Prompt Reader
// ---------------------------------------------------------------------------

async function readSystemPrompt(projectDir: string): Promise<string | undefined> {
  // Check in priority order
  const candidates = [
    join(projectDir, "CLAUDE.md"),
    join(projectDir, "AGENTS.md"),
    join(projectDir, ".claude", "AGENTS.md"),
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      try {
        const content = await readFile(candidate, "utf-8");
        return content.trim();
      } catch {
        // Continue to next candidate
      }
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

async function readJsonFile(
  path: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const content = await readFile(path, "utf-8");
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
