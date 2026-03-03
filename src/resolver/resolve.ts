import type { AppPamField, RolePamField, SkillPamField, TaskPamField } from "../schemas/index.js";
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
 * Assert that a discovered package has the expected pam type.
 */
function assertType(
  pkg: DiscoveredPackage,
  expectedType: string,
  context?: string,
): void {
  if (pkg.pamField.type !== expectedType) {
    throw new TypeMismatchError(
      pkg.name,
      expectedType,
      pkg.pamField.type,
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
  const pam = pkg.pamField as AppPamField;

  return {
    name: pkg.name,
    version: pkg.version,
    transport: pam.transport,
    command: pam.command,
    args: pam.args,
    url: pam.url,
    env: pam.env,
    tools: pam.tools,
    capabilities: pam.capabilities,
    description: pam.description,
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
  const pam = pkg.pamField as SkillPamField;

  return {
    name: pkg.name,
    version: pkg.version,
    artifacts: pam.artifacts,
    description: pam.description,
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
  const pam = pkg.pamField as TaskPamField;
  const taskContext = `task "${name}"`;

  // Resolve required apps
  const apps: ResolvedApp[] = [];
  if (pam.requires?.apps) {
    for (const appName of pam.requires.apps) {
      apps.push(resolveApp(appName, packages, taskContext));
    }
  }

  // Resolve required skills
  const skills: ResolvedSkill[] = [];
  if (pam.requires?.skills) {
    for (const skillName of pam.requires.skills) {
      skills.push(resolveSkill(skillName, packages, taskContext));
    }
  }

  // Resolve sub-tasks for composite tasks
  const subTasks: ResolvedTask[] = [];
  if (pam.tasks) {
    const newPath = [...traversalPath, name];
    for (const subTaskName of pam.tasks) {
      subTasks.push(resolveTask(subTaskName, packages, newPath, taskContext));
    }
  }

  return {
    name: pkg.name,
    version: pkg.version,
    taskType: pam.taskType,
    prompt: pam.prompt,
    timeout: pam.timeout,
    approval: pam.approval,
    requiredApps: pam.requires?.apps,
    requiredSkills: pam.requires?.skills,
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
  const pam = pkg.pamField as RolePamField;
  const roleContext = `role "${name}"`;

  // Resolve tasks
  const tasks: ResolvedTask[] = [];
  if (pam.tasks) {
    for (const taskName of pam.tasks) {
      tasks.push(resolveTask(taskName, packages, [], roleContext));
    }
  }

  // Resolve role-level skills
  const skills: ResolvedSkill[] = [];
  if (pam.skills) {
    for (const skillName of pam.skills) {
      skills.push(resolveSkill(skillName, packages, roleContext));
    }
  }

  // Collect all apps referenced by permissions (these are the apps this role touches)
  const apps: ResolvedApp[] = [];
  for (const appName of Object.keys(pam.permissions)) {
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
    description: pam.description,
    permissions: pam.permissions,
    constraints: pam.constraints,
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
  const pam = pkg.pamField as { type: "agent"; runtimes: string[]; roles: string[]; description?: string; resources?: Array<{ type: string; ref: string; access: string }>; proxy?: { image?: string; port?: number; type?: "sse" | "streamable-http" } };
  const agentContext = `agent "${agentName}"`;

  // Resolve all roles
  const roles: ResolvedRole[] = [];
  for (const roleName of pam.roles) {
    roles.push(resolveRole(roleName, packages, agentContext));
  }

  return {
    name: pkg.name,
    version: pkg.version,
    description: pam.description,
    runtimes: pam.runtimes,
    roles,
    resources: pam.resources,
    proxy: pam.proxy,
  };
}
