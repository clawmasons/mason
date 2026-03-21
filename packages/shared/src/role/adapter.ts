/**
 * Role-to-ResolvedAgent Adapter
 *
 * Converts a Role (ROLE_TYPES pipeline) into the existing ResolvedAgent
 * shape that materializers already accept. This is the key migration bridge:
 * it lets the new role-based pipeline feed into existing materializers without
 * rewriting them.
 *
 * The adapter is stateless — it performs a pure data transformation with no
 * side effects or I/O.
 */

import type {
  Role,
  AppConfig,
  TaskRef,
  SkillRef,
} from "../types/role.js";
import type {
  ResolvedAgent,
  ResolvedRole,
  ResolvedTask,
  ResolvedApp,
  ResolvedSkill,
} from "../types.js";
import { getDialect } from "./dialect-registry.js";

/**
 * Error thrown when the adapter cannot convert a Role.
 */
export class AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterError";
  }
}

/**
 * Convert a Role into a ResolvedAgent that existing materializers accept.
 *
 * @param role - A validated Role from the ROLE_TYPES pipeline
 * @param agentType - The target agent dialect name (e.g., "claude-code-agent", "codex", "aider")
 * @returns A ResolvedAgent suitable for passing to any RuntimeMaterializer
 * @throws AdapterError if agentType does not match a registered dialect
 */
export function adaptRoleToResolvedAgent(
  role: Role,
  agentType: string,
): ResolvedAgent {
  // Validate agent type against dialect registry
  const dialect = getDialect(agentType);
  if (!dialect) {
    throw new AdapterError(
      `Unknown agent type "${agentType}". Must be a registered dialect (e.g., "claude-code-agent", "codex", "aider", "mcp-agent").`,
    );
  }

  const name = role.metadata.name;
  const version = role.metadata.version ?? "0.0.0";

  // Build the single ResolvedRole from the Role
  const resolvedRole = buildResolvedRole(role, version);

  // Build the top-level ResolvedAgent
  const agent: ResolvedAgent = {
    name,
    version,
    agentName: name,
    slug: name,
    description: role.metadata.description,
    runtimes: [agentType],
    credentials: [...(role.governance.credentials ?? [])],
    roles: [resolvedRole],
    proxy: {
      port: 9090,
      type: "streamable-http",
    },
  };

  return agent;
}

// ---------------------------------------------------------------------------
// Internal mapping functions
// ---------------------------------------------------------------------------

function buildResolvedRole(role: Role, version: string): ResolvedRole {
  const permissions = aggregatePermissions(role.apps);
  const tasks = role.tasks.map((t) => adaptTask(t));
  const apps = role.apps.map(adaptApp);
  const skills = role.skills.map(adaptSkill);

  const resolvedRole: ResolvedRole = {
    name: role.metadata.name,
    version,
    description: role.metadata.description,
    instructions: role.instructions,
    risk: role.governance.risk ?? "LOW",
    permissions,
    tasks,
    apps,
    skills,
  };

  // Container requirements → ResolvedRole fields
  if (role.container) {
    const aptPackages = role.container.packages?.apt;
    if (aptPackages && aptPackages.length > 0) {
      resolvedRole.aptPackages = aptPackages;
    }

    const npmPackages = role.container.packages?.npm;
    if (npmPackages && npmPackages.length > 0) {
      resolvedRole.npmPackages = npmPackages;
    }

    if (role.container.baseImage) {
      resolvedRole.baseImage = role.container.baseImage;
    }

    const mounts = role.container.mounts;
    if (mounts && mounts.length > 0) {
      resolvedRole.mounts = mounts.map((m) => ({
        source: m.source,
        target: m.target,
        readonly: m.readonly ?? false,
      }));
    }
  }

  // Governance constraints
  if (role.governance.constraints) {
    resolvedRole.constraints = {
      ...role.governance.constraints,
    };
  }

  return resolvedRole;
}

/**
 * Aggregate tool permissions from all apps into the permissions map
 * that ResolvedRole expects: { [appName]: { allow: string[], deny: string[] } }
 */
function aggregatePermissions(
  apps: AppConfig[],
): Record<string, { allow: string[]; deny: string[] }> {
  const permissions: Record<string, { allow: string[]; deny: string[] }> = {};

  for (const app of apps) {
    permissions[app.name] = {
      allow: [...(app.tools?.allow ?? [])],
      deny: [...(app.tools?.deny ?? [])],
    };
  }

  return permissions;
}

function adaptTask(task: TaskRef): ResolvedTask {
  const normalized = task.name.replace(/\//g, ":");
  const colonIdx = normalized.lastIndexOf(":");
  if (colonIdx === -1) {
    return { name: normalized, version: "0.0.0" };
  }
  return {
    name: normalized.slice(colonIdx + 1),
    scope: normalized.slice(0, colonIdx),
    version: "0.0.0",
  };
}

function adaptApp(app: AppConfig): ResolvedApp {
  return {
    name: app.name,
    version: "0.0.0",
    transport: app.transport ?? "stdio",
    command: app.command,
    args: app.args,
    url: app.url,
    env: app.env ? { ...app.env } : undefined,
    tools: [...(app.tools?.allow ?? [])],
    capabilities: [],
    credentials: [...(app.credentials ?? [])],
  };
}

function adaptSkill(skill: SkillRef): ResolvedSkill {
  return {
    name: skill.name,
    version: "0.0.0",
    artifacts: [],
    description: skill.name,
  };
}
