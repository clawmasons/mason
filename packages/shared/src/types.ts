import type { Field } from "./schemas/index.js";

/**
 * A package discovered on the filesystem.
 */
export interface DiscoveredPackage {
  name: string;
  version: string;
  packagePath: string;
  field: Field;
}

/**
 * A fully-resolved MCP server in the dependency graph.
 */
export interface ResolvedMcpServer {
  name: string;
  version: string;
  transport: "stdio" | "sse" | "streamable-http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  tools: string[];
  capabilities: string[];
  credentials: string[];
  location: "proxy" | "host";
  description?: string;
}

/**
 * A fully-resolved skill (knowledge artifact) in the dependency graph.
 */
export interface ResolvedSkill {
  name: string;
  version: string;
  artifacts: string[];
  description: string;
  contentMap?: Map<string, string>;
}

/**
 * Declarative configuration for how an agent stores task files.
 * Drives both readTasks() and materializeTasks() in the SDK,
 * and directory/scoping resolution in the project scanner.
 */
export interface AgentTaskConfig {
  /** Folder where task files live, relative to workspace root (e.g., ".claude/commands"). */
  projectFolder: string;
  /** File name template. Tokens: {scopePath}, {scopeKebab}, {taskName} */
  nameFormat: string;
  /** How scope is encoded in the file system. */
  scopeFormat: "path" | "kebab-case-prefix";
  /** Which ResolvedTask fields map to YAML frontmatter. "all" or array of field names/mappings (e.g., "name->displayName"). */
  supportedFields: "all" | Array<string>;
  /** Where the prompt content is stored in the file. */
  prompt: "markdown-body";
}

/**
 * Declarative configuration for how an agent stores skill files.
 * Drives both readSkills() and materializeSkills() in the SDK.
 */
export interface AgentSkillConfig {
  /** Folder where skill directories live, relative to workspace root (e.g., ".claude/skills"). */
  projectFolder: string;
}

/**
 * A fully-resolved task — a named prompt with metadata.
 */
export interface ResolvedTask {
  name: string;
  version: string;
  displayName?: string;
  description?: string;
  category?: string;
  tags?: string[];
  scope?: string;
  prompt?: string;
}

/**
 * A fully-resolved role (permission boundary) in the dependency graph.
 */
export interface ResolvedRole {
  name: string;
  version: string;
  description?: string;
  instructions?: string;
  risk: "HIGH" | "MEDIUM" | "LOW";
  permissions: Record<string, { allow: string[]; deny: string[] }>;
  constraints?: {
    maxConcurrentTasks?: number;
    requireApprovalFor?: string[];
  };
  mounts?: Array<{ source: string; target: string; readonly: boolean }>;
  baseImage?: string;
  aptPackages?: string[];
  npmPackages?: string[];
  channel?: { type: string; args: string[] };
  tasks: ResolvedTask[];
  mcp: ResolvedMcpServer[];
  skills: ResolvedSkill[];
}

/**
 * A fully-resolved agent — the top-level deployable unit.
 */
export interface ResolvedAgent {
  name: string;
  version: string;
  agentName: string;
  slug: string;
  description?: string;
  runtimes: string[];
  credentials: string[];
  roles: ResolvedRole[];
  resources?: Array<{ type: string; ref: string; access: string }>;
  proxy?: {
    port?: number;
    type?: "sse" | "streamable-http";
  };
  llm?: {
    provider: string;
    model: string;
  };
}
