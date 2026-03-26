import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import type { ResolvedRole, ResolvedTask, ResolvedSkill, AgentSkillConfig } from "@clawmasons/shared";
import { getAppShortName, convertMcpFormat } from "@clawmasons/shared";
import type { AgentPackage, AgentTaskConfig, MaterializationResult } from "./types.js";

/**
 * Mapping from LLM provider identifiers to their environment variable names.
 *
 * Used by Dockerfile generators to inject the correct API key into
 * Docker Compose services, and by env template generation to include
 * the key in .env.example.
 */
export const PROVIDER_ENV_VARS: Record<string, string> = {
  "openrouter": "OPENROUTER_API_KEY",
  "anthropic": "ANTHROPIC_API_KEY",
  "openai": "OPENAI_API_KEY",
  "google": "GEMINI_API_KEY",
  "mistral": "MISTRAL_API_KEY",
  "groq": "GROQ_API_KEY",
  "xai": "XAI_API_KEY",
  "azure-openai": "AZURE_OPENAI_API_KEY",
};

/**
 * Format a role's permitted tools as a readable list.
 * Each line: "  - {appShortName}: tool1, tool2, tool3"
 */
export function formatPermittedTools(
  permissions: Record<string, { allow: string[]; deny: string[] }>,
): string {
  const lines: string[] = [];
  for (const [appName, perms] of Object.entries(permissions)) {
    const shortName = getAppShortName(appName);
    lines.push(`  - ${shortName}: ${perms.allow.join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * Find which roles contain a given task (by name).
 */
export function findRolesForTask(
  taskName: string,
  roles: ResolvedRole[],
): ResolvedRole[] {
  return roles.filter((role) =>
    role.tasks.some((t) => t.name === taskName),
  );
}

/**
 * Collect all unique skills across all roles.
 */
export function collectAllSkills(roles: ResolvedRole[]): Map<string, ResolvedSkill> {
  const skills = new Map<string, ResolvedSkill>();

  for (const role of roles) {
    for (const skill of role.skills) {
      if (!skills.has(skill.name)) {
        skills.set(skill.name, skill);
      }
    }
  }

  return skills;
}

/**
 * Collect all unique tasks across all roles.
 * Returns tuples of [task, owningRoles].
 */
export function collectAllTasks(
  roles: ResolvedRole[],
): Array<[ResolvedTask, ResolvedRole[]]> {
  const seen = new Set<string>();
  const result: Array<[ResolvedTask, ResolvedRole[]]> = [];

  for (const role of roles) {
    for (const task of role.tasks) {
      if (!seen.has(task.name)) {
        seen.add(task.name);
        const owningRoles = findRolesForTask(task.name, roles);
        result.push([task, owningRoles]);
      }
    }
  }

  return result;
}

// ── agent-launch.json Generation ──────────────────────────────────────

/** Credential configuration for agent-launch.json. */
export interface LaunchCredentialConfig {
  key: string;
  type: "env" | "file";
  path?: string;
}

/**
 * Generate agent-launch.json content for the agent-entry entrypoint.
 *
 * Uses the AgentPackage's runtime config to determine command, args,
 * and runtime-specific credentials. Merges with role-declared credentials.
 *
 * @param agentPkg - The agent package providing runtime config
 * @param roleCredentials - Credential keys declared by the role
 * @param acpMode - Whether to generate ACP mode config
 * @returns JSON string of agent-launch.json
 */
export function generateAgentLaunchJson(
  agentPkg: AgentPackage,
  roleCredentials: string[],
  acpMode?: boolean,
  instructions?: string,
  agentArgs?: string[],
  initialPrompt?: string,
  printMode?: boolean,
  jsonMode?: boolean,
): string {
  // Start with runtime-specific credentials from the agent package
  const credentials: LaunchCredentialConfig[] = [
    ...(agentPkg.runtime?.credentials ?? []),
  ];

  // Add role-declared credentials as env vars (skip any already added as runtime credentials)
  const runtimeKeys = new Set(credentials.map((c) => c.key));
  for (const key of roleCredentials) {
    if (!runtimeKeys.has(key)) {
      credentials.push({ key, type: "env" });
    }
  }

  // Determine command
  let command: string;
  let args: string[] | undefined;

  if (acpMode && agentPkg.acp) {
    const parts = agentPkg.acp.command.split(/\s+/);
    command = parts[0];
    args = parts.length > 1 ? parts.slice(1) : undefined;
  } else {
    command = agentPkg.runtime?.command ?? agentPkg.name;
    args = agentPkg.runtime?.args;
  }

  if (instructions && !acpMode && agentPkg.runtime?.supportsAppendSystemPrompt) {
    args = [...(args ?? []), "--append-system-prompt", instructions];
  }

  // Append alias-level agent-args after all other resolved args
  if (agentArgs && agentArgs.length > 0) {
    args = [...(args ?? []), ...agentArgs];
  }

  // Append initial prompt (print mode uses json stream args + buildPromptArgs; otherwise bare positional)
  if (initialPrompt && !acpMode) {
    if (printMode && agentPkg.printMode) {
      const promptArgs = agentPkg.printMode.buildPromptArgs
        ? agentPkg.printMode.buildPromptArgs(initialPrompt)
        : ["-p", initialPrompt];
      args = [...(args ?? []), ...agentPkg.printMode.jsonStreamArgs, ...promptArgs];
    } else if (jsonMode && agentPkg.jsonMode) {
      const promptArgs = agentPkg.jsonMode.buildPromptArgs
        ? agentPkg.jsonMode.buildPromptArgs(initialPrompt)
        : ["-p", initialPrompt];
      args = [...(args ?? []), ...agentPkg.jsonMode.jsonStreamArgs, ...promptArgs];
    } else {
      args = [...(args ?? []), initialPrompt];
    }
  }

  const config: Record<string, unknown> = { credentials, command };
  if (args && args.length > 0) {
    config.args = args;
  }

  return JSON.stringify(config, null, 2);
}

// ── Skill Read/Write ─────────────────────────────────────────────────

/**
 * Recursively discover all files in a directory, returning paths relative to baseDir.
 */
function walkAllFiles(dir: string, baseDir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkAllFiles(full, baseDir));
    } else if (entry.isFile()) {
      results.push(path.relative(baseDir, full));
    }
  }
  return results;
}

/**
 * Read skill directories from an agent's folder based on its AgentSkillConfig.
 *
 * Walks {projectDir}/{config.projectFolder}/, treating each subdirectory as a skill.
 * Reads SKILL.md frontmatter for name/description, enumerates all files into contentMap.
 * Directories without a SKILL.md are skipped.
 */
export function readSkills(
  config: AgentSkillConfig,
  projectDir: string,
): ResolvedSkill[] {
  const skillsDir = path.join(projectDir, config.projectFolder);
  if (!fs.existsSync(skillsDir)) return [];

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const skills: ResolvedSkill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillDir = path.join(skillsDir, entry.name);
    const skillMdPath = path.join(skillDir, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) continue;

    // Parse SKILL.md frontmatter for name and description
    const skillMdContent = fs.readFileSync(skillMdPath, "utf-8");
    const { frontmatter } = parseFrontmatter(skillMdContent);
    const name = (frontmatter.name as string) ?? entry.name;
    const description = (frontmatter.description as string) ?? "";

    // Enumerate all files and read content
    const relativePaths = walkAllFiles(skillDir, skillDir);
    const contentMap = new Map<string, string>();
    const artifacts: string[] = [];

    for (const relPath of relativePaths) {
      const fullPath = path.join(skillDir, relPath);
      contentMap.set(relPath, fs.readFileSync(fullPath, "utf-8"));
      artifacts.push(relPath);
    }

    skills.push({
      name,
      version: "0.0.0",
      artifacts,
      description,
      contentMap,
    });
  }

  return skills;
}

/**
 * Write ResolvedSkill[] to an agent's file layout based on its AgentSkillConfig.
 *
 * For each skill with a contentMap, writes every entry to
 * {config.projectFolder}/{skill-short-name}/{relative-path}.
 * Skills without a contentMap are skipped.
 */
export function materializeSkills(
  skills: ResolvedSkill[],
  config: AgentSkillConfig,
  mcpNameTemplate?: string,
): MaterializationResult {
  const result: MaterializationResult = new Map();

  for (const skill of skills) {
    if (!skill.contentMap || skill.contentMap.size === 0) continue;

    const shortName = getAppShortName(skill.name);
    for (const [relPath, fileContent] of skill.contentMap) {
      const fullPath = path.posix.join(config.projectFolder, shortName, relPath);
      const content = mcpNameTemplate ? convertMcpFormat(fileContent, mcpNameTemplate) : fileContent;
      result.set(fullPath, content);
    }
  }

  return result;
}

// ── Task Read/Write ──────────────────────────────────────────────────

/**
 * Parse a supportedFields entry into its ResolvedTask property name and frontmatter key.
 * "name->displayName" means frontmatter key "name" maps to property "displayName".
 * "description" means both are "description".
 */
function parseFieldMapping(entry: string): { property: string; frontmatterKey: string } {
  const arrowIdx = entry.indexOf("->");
  if (arrowIdx !== -1) {
    return {
      frontmatterKey: entry.slice(0, arrowIdx),
      property: entry.slice(arrowIdx + 2),
    };
  }
  return { property: entry, frontmatterKey: entry };
}

/**
 * Get the list of field mappings from an AgentTaskConfig.
 * When "all", returns all ResolvedTask metadata fields (excluding name, prompt, scope).
 */
function getFieldMappings(config: AgentTaskConfig): Array<{ property: string; frontmatterKey: string }> {
  if (config.supportedFields === "all") {
    return [
      { property: "displayName", frontmatterKey: "displayName" },
      { property: "description", frontmatterKey: "description" },
      { property: "category", frontmatterKey: "category" },
      { property: "tags", frontmatterKey: "tags" },
      { property: "version", frontmatterKey: "version" },
    ];
  }
  return config.supportedFields.map(parseFieldMapping);
}

/** Convert scope "ops:triage" to path "ops/triage". */
function scopeToPath(scope: string): string {
  if (!scope) return "";
  return scope.replace(/:/g, "/");
}

/** Convert scope "ops:triage" to kebab prefix "ops-triage". */
function scopeToKebab(scope: string): string {
  if (!scope) return "";
  return scope.replace(/:/g, "-");
}

/**
 * Resolve a nameFormat template to a file path relative to projectFolder.
 */
function resolveNameFormat(
  nameFormat: string,
  taskName: string,
  scope: string,
): string {
  let result = nameFormat
    .replace("{taskName}", taskName)
    .replace("{scopePath}", scopeToPath(scope))
    .replace("{scopeKebab}", scopeToKebab(scope));

  // Clean up: remove leading slash or dash when scope is empty
  result = result.replace(/^\//, "").replace(/^-/, "");
  // Clean up double slashes from empty scope
  result = result.replace(/\/\//g, "/");

  return result;
}

/**
 * Parse YAML frontmatter and markdown body from file content.
 * Returns { frontmatter, body }.
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return { frontmatter: {}, body: content };
  }

  const endIdx = trimmed.indexOf("---", 3);
  if (endIdx === -1) {
    return { frontmatter: {}, body: content };
  }

  const yamlStr = trimmed.slice(3, endIdx).trim();
  const body = trimmed.slice(endIdx + 3).replace(/^\r?\n/, "");
  const parsed = yaml.load(yamlStr);
  const frontmatter = (parsed && typeof parsed === "object" && !Array.isArray(parsed))
    ? parsed as Record<string, unknown>
    : {};

  return { frontmatter, body };
}

/**
 * Build YAML frontmatter string from a ResolvedTask and field mappings.
 */
function buildFrontmatter(
  task: ResolvedTask,
  mappings: Array<{ property: string; frontmatterKey: string }>,
): string {
  const obj: Record<string, unknown> = {};

  for (const { property, frontmatterKey } of mappings) {
    const value = (task as unknown as Record<string, unknown>)[property];
    if (value !== undefined && value !== null && value !== "") {
      obj[frontmatterKey] = value;
    }
  }

  if (Object.keys(obj).length === 0) return "";

  return `---\n${yaml.dump(obj, { lineWidth: -1 }).trimEnd()}\n---\n`;
}

/**
 * Recursively discover .md files in a directory.
 */
function walkMdFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMdFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * List .md files in a flat directory (no recursion).
 */
function listMdFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => path.join(dir, e.name));
}

/**
 * Read task files from an agent's folder based on its AgentTaskConfig.
 *
 * Discovers .md files, parses frontmatter and body, derives name from filename
 * and scope from path/prefix. Returns ResolvedTask[].
 */
export function readTasks(
  config: AgentTaskConfig,
  projectDir: string,
): ResolvedTask[] {
  const tasksDir = path.join(projectDir, config.projectFolder);
  const files = config.scopeFormat === "path"
    ? walkMdFiles(tasksDir)
    : listMdFiles(tasksDir);

  const mappings = getFieldMappings(config);
  const tasks: ResolvedTask[] = [];

  for (const filePath of files) {
    const relativePath = path.relative(tasksDir, filePath);
    const content = fs.readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);

    // Derive name from filename (always authoritative)
    const basename = path.basename(relativePath, ".md");

    let taskName: string;
    let scope: string;

    if (config.scopeFormat === "path") {
      // Name is the filename, scope is the directory path
      taskName = basename;
      const dirPart = path.dirname(relativePath);
      scope = dirPart === "." ? "" : dirPart.replace(/\//g, ":").replace(/\\/g, ":");
    } else {
      // kebab-case-prefix: entire filename is {scopeKebab}-{taskName}
      // Without a known task name to search for, treat the full basename as the name
      // and scope as empty. When a known name is provided via the task list,
      // callers can match and extract scope.
      taskName = basename;
      scope = "";
    }

    // Build the ResolvedTask
    const task: ResolvedTask = {
      name: taskName,
      version: "0.0.0",
      scope,
      prompt: body || undefined,
    };

    // Map frontmatter fields to task properties
    for (const { property, frontmatterKey } of mappings) {
      const value = frontmatter[frontmatterKey];
      if (value !== undefined) {
        (task as unknown as Record<string, unknown>)[property] = value;
      }
    }

    tasks.push(task);
  }

  return tasks;
}

/**
 * Read a single task file by constructing the expected path from scope and name.
 *
 * Instead of scanning directories, this builds the file path deterministically
 * using the AgentTaskConfig.nameFormat template and reads that file directly.
 * Returns undefined if the file does not exist.
 */
export function readTask(
  config: AgentTaskConfig,
  projectDir: string,
  name: string,
  scope: string,
): ResolvedTask | undefined {
  const relativePath = resolveNameFormat(config.nameFormat, name, scope);
  const fullPath = path.join(projectDir, config.projectFolder, relativePath);

  if (!fs.existsSync(fullPath)) return undefined;

  const content = fs.readFileSync(fullPath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);
  const mappings = getFieldMappings(config);

  const task: ResolvedTask = {
    name,
    version: "0.0.0",
    scope: scope || undefined,
    prompt: body || undefined,
  };

  for (const { property, frontmatterKey } of mappings) {
    const value = frontmatter[frontmatterKey];
    if (value !== undefined) {
      (task as unknown as Record<string, unknown>)[property] = value;
    }
  }

  return task;
}

/**
 * Write ResolvedTask[] to an agent's file layout based on its AgentTaskConfig.
 *
 * Generates file paths from nameFormat + scopeFormat, builds YAML frontmatter
 * from supportedFields, places prompt as markdown body.
 * Returns MaterializationResult (Map<string, string>).
 */
export function materializeTasks(
  tasks: ResolvedTask[],
  config: AgentTaskConfig,
  mcpNameTemplate?: string,
): MaterializationResult {
  const result: MaterializationResult = new Map();
  const mappings = getFieldMappings(config);

  for (const task of tasks) {
    const relativePath = resolveNameFormat(config.nameFormat, task.name, task.scope ?? "");
    const fullPath = path.posix.join(config.projectFolder, relativePath);

    const frontmatter = buildFrontmatter(task, mappings);
    const body = task.prompt ?? "";
    let content = frontmatter ? `${frontmatter}${body}` : body;

    if (mcpNameTemplate) {
      content = convertMcpFormat(content, mcpNameTemplate);
    }

    result.set(fullPath, content);
  }

  return result;
}
