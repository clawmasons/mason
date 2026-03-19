/**
 * Mason Project Scanner — discovers existing project configuration.
 *
 * Scans a project directory for:
 * - Skills in `.<agent>/skills/` directories
 * - Commands in `.<agent>/commands/` directories
 * - MCP server configurations from agent settings files
 * - System prompts from CLAUDE.md, AGENTS.md
 *
 * Uses the dialect registry to automatically scan all registered agent directories.
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

// ---------------------------------------------------------------------------
// Main Scanner
// ---------------------------------------------------------------------------

/**
 * Scan a project directory for existing agent configuration.
 *
 * Iterates over all registered dialects, scanning each agent directory for
 * skills, commands, and MCP server configurations.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Scan results with all discovered configuration
 */
export async function scanProject(projectDir: string): Promise<ScanResult> {
  const dialects = getAllDialects();

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

    // Scan commands
    const discoveredCommands = await scanCommands(agentDir, dialect);
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

async function scanSkills(
  agentDir: string,
  dialect: DialectEntry,
): Promise<DiscoveredSkill[]> {
  const skillsDir = join(agentDir, "skills");
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
// Commands Scanner
// ---------------------------------------------------------------------------

async function scanCommands(
  agentDir: string,
  dialect: DialectEntry,
): Promise<DiscoveredCommand[]> {
  const commandsDir = join(agentDir, "commands");
  if (!(await dirExists(commandsDir))) {
    return [];
  }

  const results: DiscoveredCommand[] = [];
  await walkCommands(commandsDir, commandsDir, dialect, results);
  return results;
}

async function walkCommands(
  baseDir: string,
  currentDir: string,
  dialect: DialectEntry,
  results: DiscoveredCommand[],
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await walkCommands(baseDir, fullPath, dialect, results);
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
