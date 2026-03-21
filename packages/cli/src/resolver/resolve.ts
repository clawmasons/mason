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
    location: "proxy",
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
 */
function resolveTask(
  name: string,
  packages: Map<string, DiscoveredPackage>,
  context?: string,
): ResolvedTask {
  const pkg = getPackage(name, packages, context);
  assertType(pkg, "task", context);
  const field = pkg.field as TaskField;

  return {
    name: pkg.name,
    version: pkg.version,
    prompt: field.prompt,
    description: field.description,
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
      tasks.push(resolveTask(taskName, packages, roleContext));
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
