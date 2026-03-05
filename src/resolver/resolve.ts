import type { AppForgeField, RoleForgeField, SkillForgeField, TaskForgeField } from "../schemas/index.js";
import {
  CircularDependencyError,
  PackageNotFoundError,
  TypeMismatchError,
} from "./errors.js";
import type {
  DiscoveredPackage,
  ResolvedAgent,
  ResolvedApp,
  ResolvedRole,
  ResolvedSkill,
  ResolvedTask,
} from "./types.js";

/**
 * Look up a package in the discovery map, throwing if not found.
 */
function getPackage(
  name: string,
  packages: Map<string, DiscoveredPackage>,
  context?: string,
): DiscoveredPackage {
  const pkg = packages.get(name);
  if (!pkg) {
    throw new PackageNotFoundError(name, context);
  }
  return pkg;
}

/**
 * Assert that a discovered package has the expected forge type.
 */
function assertType(
  pkg: DiscoveredPackage,
  expectedType: string,
  context?: string,
): void {
  if (pkg.forgeField.type !== expectedType) {
    throw new TypeMismatchError(
      pkg.name,
      expectedType,
      pkg.forgeField.type,
      context,
    );
  }
}

/**
 * Resolve an app package to a ResolvedApp.
 */
function resolveApp(
  name: string,
  packages: Map<string, DiscoveredPackage>,
  context?: string,
): ResolvedApp {
  const pkg = getPackage(name, packages, context);
  assertType(pkg, "app", context);
  const forge = pkg.forgeField as AppForgeField;

  return {
    name: pkg.name,
    version: pkg.version,
    transport: forge.transport,
    command: forge.command,
    args: forge.args,
    url: forge.url,
    env: forge.env,
    tools: forge.tools,
    capabilities: forge.capabilities,
    description: forge.description,
  };
}

/**
 * Resolve a skill package to a ResolvedSkill.
 */
function resolveSkill(
  name: string,
  packages: Map<string, DiscoveredPackage>,
  context?: string,
): ResolvedSkill {
  const pkg = getPackage(name, packages, context);
  assertType(pkg, "skill", context);
  const forge = pkg.forgeField as SkillForgeField;

  return {
    name: pkg.name,
    version: pkg.version,
    artifacts: forge.artifacts,
    description: forge.description,
  };
}

/**
 * Resolve a task package to a ResolvedTask.
 * Tracks the traversal path for circular dependency detection.
 */
function resolveTask(
  name: string,
  packages: Map<string, DiscoveredPackage>,
  traversalPath: string[],
  context?: string,
): ResolvedTask {
  // Circular dependency detection
  if (traversalPath.includes(name)) {
    throw new CircularDependencyError([...traversalPath, name]);
  }

  const pkg = getPackage(name, packages, context);
  assertType(pkg, "task", context);
  const forge = pkg.forgeField as TaskForgeField;
  const taskContext = `task "${name}"`;

  // Resolve required apps
  const apps: ResolvedApp[] = [];
  if (forge.requires?.apps) {
    for (const appName of forge.requires.apps) {
      apps.push(resolveApp(appName, packages, taskContext));
    }
  }

  // Resolve required skills
  const skills: ResolvedSkill[] = [];
  if (forge.requires?.skills) {
    for (const skillName of forge.requires.skills) {
      skills.push(resolveSkill(skillName, packages, taskContext));
    }
  }

  // Resolve sub-tasks for composite tasks
  const subTasks: ResolvedTask[] = [];
  if (forge.tasks) {
    const newPath = [...traversalPath, name];
    for (const subTaskName of forge.tasks) {
      subTasks.push(resolveTask(subTaskName, packages, newPath, taskContext));
    }
  }

  return {
    name: pkg.name,
    version: pkg.version,
    taskType: forge.taskType,
    prompt: forge.prompt,
    timeout: forge.timeout,
    approval: forge.approval,
    requiredApps: forge.requires?.apps,
    requiredSkills: forge.requires?.skills,
    apps,
    skills,
    subTasks,
  };
}

/**
 * Resolve a role package to a ResolvedRole.
 */
function resolveRole(
  name: string,
  packages: Map<string, DiscoveredPackage>,
  context?: string,
): ResolvedRole {
  const pkg = getPackage(name, packages, context);
  assertType(pkg, "role", context);
  const forge = pkg.forgeField as RoleForgeField;
  const roleContext = `role "${name}"`;

  // Resolve tasks
  const tasks: ResolvedTask[] = [];
  if (forge.tasks) {
    for (const taskName of forge.tasks) {
      tasks.push(resolveTask(taskName, packages, [], roleContext));
    }
  }

  // Resolve role-level skills
  const skills: ResolvedSkill[] = [];
  if (forge.skills) {
    for (const skillName of forge.skills) {
      skills.push(resolveSkill(skillName, packages, roleContext));
    }
  }

  // Collect all apps referenced by permissions (these are the apps this role touches)
  const apps: ResolvedApp[] = [];
  for (const appName of Object.keys(forge.permissions)) {
    try {
      apps.push(resolveApp(appName, packages, roleContext));
    } catch (e) {
      if (e instanceof PackageNotFoundError) {
        throw new PackageNotFoundError(
          appName,
          `${roleContext} permissions`,
        );
      }
      throw e;
    }
  }

  return {
    name: pkg.name,
    version: pkg.version,
    description: forge.description,
    permissions: forge.permissions,
    constraints: forge.constraints,
    tasks,
    apps,
    skills,
  };
}

/**
 * Resolve an agent package into a fully-resolved dependency graph.
 */
export function resolveAgent(
  agentName: string,
  packages: Map<string, DiscoveredPackage>,
): ResolvedAgent {
  const pkg = getPackage(agentName, packages);
  assertType(pkg, "agent", undefined);
  const forge = pkg.forgeField as { type: "agent"; runtimes: string[]; roles: string[]; description?: string; resources?: Array<{ type: string; ref: string; access: string }>; proxy?: { image?: string; port?: number; type?: "sse" | "streamable-http" } };
  const agentContext = `agent "${agentName}"`;

  // Resolve all roles
  const roles: ResolvedRole[] = [];
  for (const roleName of forge.roles) {
    roles.push(resolveRole(roleName, packages, agentContext));
  }

  return {
    name: pkg.name,
    version: pkg.version,
    description: forge.description,
    runtimes: forge.runtimes,
    roles,
    resources: forge.resources,
    proxy: forge.proxy,
  };
}
