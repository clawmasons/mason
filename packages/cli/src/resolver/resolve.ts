import type {
  AppField,
  RoleField,
  SkillField,
  TaskField,
  DiscoveredPackage,
  ResolvedApp,
  ResolvedRole,
  ResolvedSkill,
  ResolvedTask,
} from "@clawmasons/shared";
import {
  CircularDependencyError,
  PackageNotFoundError,
  TypeMismatchError,
} from "./errors.js";

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
 * Assert that a discovered package has the expected type.
 */
function assertType(
  pkg: DiscoveredPackage,
  expectedType: string,
  context?: string,
): void {
  if (pkg.field.type !== expectedType) {
    throw new TypeMismatchError(
      pkg.name,
      expectedType,
      pkg.field.type,
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
  const field = pkg.field as AppField;

  return {
    name: pkg.name,
    version: pkg.version,
    transport: field.transport,
    command: field.command,
    args: field.args,
    url: field.url,
    env: field.env,
    tools: field.tools,
    capabilities: field.capabilities,
    credentials: field.credentials,
    description: field.description,
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
  const field = pkg.field as SkillField;

  return {
    name: pkg.name,
    version: pkg.version,
    artifacts: field.artifacts,
    description: field.description,
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
  const field = pkg.field as TaskField;
  const taskContext = `task "${name}"`;

  // Resolve required apps
  const apps: ResolvedApp[] = [];
  if (field.requires?.apps) {
    for (const appName of field.requires.apps) {
      apps.push(resolveApp(appName, packages, taskContext));
    }
  }

  // Resolve required skills
  const skills: ResolvedSkill[] = [];
  if (field.requires?.skills) {
    for (const skillName of field.requires.skills) {
      skills.push(resolveSkill(skillName, packages, taskContext));
    }
  }

  // Resolve sub-tasks for composite tasks
  const subTasks: ResolvedTask[] = [];
  if (field.tasks) {
    const newPath = [...traversalPath, name];
    for (const subTaskName of field.tasks) {
      subTasks.push(resolveTask(subTaskName, packages, newPath, taskContext));
    }
  }

  return {
    name: pkg.name,
    version: pkg.version,
    taskType: field.taskType,
    prompt: field.prompt,
    timeout: field.timeout,
    approval: field.approval,
    requiredApps: field.requires?.apps,
    requiredSkills: field.requires?.skills,
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
  const field = pkg.field as RoleField;
  const roleContext = `role "${name}"`;

  // Resolve tasks
  const tasks: ResolvedTask[] = [];
  if (field.tasks) {
    for (const taskName of field.tasks) {
      tasks.push(resolveTask(taskName, packages, [], roleContext));
    }
  }

  // Resolve role-level skills
  const skills: ResolvedSkill[] = [];
  if (field.skills) {
    for (const skillName of field.skills) {
      skills.push(resolveSkill(skillName, packages, roleContext));
    }
  }

  // Collect all apps referenced by permissions (these are the apps this role touches)
  const apps: ResolvedApp[] = [];
  const permissionKeys = Object.keys(field.permissions);
  const hasWildcard = permissionKeys.includes("*");

  if (hasWildcard) {
    // Wildcard "*" means all apps in the workspace
    for (const [, pkg] of packages) {
      if (pkg.field.type === "app") {
        apps.push(resolveApp(pkg.name, packages, roleContext));
      }
    }
  }

  // Also resolve any explicitly named apps
  for (const appName of permissionKeys) {
    if (appName === "*") continue;
    if (apps.some((a) => a.name === appName)) continue; // already added by wildcard
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
    description: field.description,
    risk: field.risk,
    permissions: field.permissions,
    constraints: field.constraints,
    mounts: field.mounts,
    baseImage: field.baseImage,
    aptPackages: field.aptPackages,
    tasks,
    apps,
    skills,
  };
}

/**
 * Resolve a role package to a ResolvedRole (public entry point).
 * Unlike the private resolveRole above, this accepts a package name
 * without a context parameter.
 */
export function resolveRolePackage(
  roleName: string,
  packages: Map<string, DiscoveredPackage>,
): ResolvedRole {
  return resolveRole(roleName, packages);
}
