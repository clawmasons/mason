import type { ChapterField } from "../schemas/index.js";

/**
 * A chapter package discovered on the filesystem.
 */
export interface DiscoveredPackage {
  name: string;
  version: string;
  packagePath: string;
  chapterField: ChapterField;
}

/**
 * A fully-resolved app (MCP server) in the dependency graph.
 */
export interface ResolvedApp {
  name: string;
  version: string;
  transport: "stdio" | "sse" | "streamable-http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  tools: string[];
  capabilities: string[];
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
}

/**
 * A fully-resolved task in the dependency graph.
 */
export interface ResolvedTask {
  name: string;
  version: string;
  taskType: "subagent" | "script" | "composite" | "human";
  prompt?: string;
  timeout?: string;
  approval?: "auto" | "confirm" | "review";
  requiredApps?: string[];
  requiredSkills?: string[];
  apps: ResolvedApp[];
  skills: ResolvedSkill[];
  subTasks: ResolvedTask[];
}

/**
 * A fully-resolved role (permission boundary) in the dependency graph.
 */
export interface ResolvedRole {
  name: string;
  version: string;
  description?: string;
  permissions: Record<string, { allow: string[]; deny: string[] }>;
  constraints?: {
    maxConcurrentTasks?: number;
    requireApprovalFor?: string[];
  };
  tasks: ResolvedTask[];
  apps: ResolvedApp[];
  skills: ResolvedSkill[];
}

/**
 * A fully-resolved member — the top-level deployable unit.
 * Replaces the former ResolvedAgent. Members can be human or agent type.
 */
export interface ResolvedMember {
  name: string;
  version: string;
  memberType: "human" | "agent";
  memberName: string;
  slug: string;
  email: string;
  authProviders: string[];
  description?: string;
  runtimes: string[];
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
