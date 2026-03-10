import type {
  AppChapterField,
  RoleChapterField,
  SkillChapterField,
  TaskChapterField,
  AgentChapterField,
  DiscoveredPackage,
  ResolvedAgent,
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
 * Assert that a discovered package has the expected chapter type.
 */
function assertType(
  pkg: DiscoveredPackage,
  expectedType: string,
  context?: string,
): void {
  if (pkg.chapterField.type !== expectedType) {
    throw new TypeMismatchError(
      pkg.name,
      expectedType,
      pkg.chapterField.type,
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
  const chapter = pkg.chapterField as AppChapterField;

  return {
    name: pkg.name,
    version: pkg.version,
    transport: chapter.transport,
    command: chapter.command,
    args: chapter.args,
    url: chapter.url,
    env: chapter.env,
    tools: chapter.tools,
    capabilities: chapter.capabilities,
    credentials: chapter.credentials,
    description: chapter.description,
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
  const chapter = pkg.chapterField as SkillChapterField;

  return {
    name: pkg.name,
    version: pkg.version,
    artifacts: chapter.artifacts,
    description: chapter.description,
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
  const chapter = pkg.chapterField as TaskChapterField;
  const taskContext = `task "${name}"`;

  // Resolve required apps
  const apps: ResolvedApp[] = [];
  if (chapter.requires?.apps) {
    for (const appName of chapter.requires.apps) {
      apps.push(resolveApp(appName, packages, taskContext));
    }
  }

  // Resolve required skills
  const skills: ResolvedSkill[] = [];
  if (chapter.requires?.skills) {
    for (const skillName of chapter.requires.skills) {
      skills.push(resolveSkill(skillName, packages, taskContext));
    }
  }

  // Resolve sub-tasks for composite tasks
  const subTasks: ResolvedTask[] = [];
  if (chapter.tasks) {
    const newPath = [...traversalPath, name];
    for (const subTaskName of chapter.tasks) {
      subTasks.push(resolveTask(subTaskName, packages, newPath, taskContext));
    }
  }

  return {
    name: pkg.name,
    version: pkg.version,
    taskType: chapter.taskType,
    prompt: chapter.prompt,
    timeout: chapter.timeout,
    approval: chapter.approval,
    requiredApps: chapter.requires?.apps,
    requiredSkills: chapter.requires?.skills,
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
  const chapter = pkg.chapterField as RoleChapterField;
  const roleContext = `role "${name}"`;

  // Resolve tasks
  const tasks: ResolvedTask[] = [];
  if (chapter.tasks) {
    for (const taskName of chapter.tasks) {
      tasks.push(resolveTask(taskName, packages, [], roleContext));
    }
  }

  // Resolve role-level skills
  const skills: ResolvedSkill[] = [];
  if (chapter.skills) {
    for (const skillName of chapter.skills) {
      skills.push(resolveSkill(skillName, packages, roleContext));
    }
  }

  // Collect all apps referenced by permissions (these are the apps this role touches)
  const apps: ResolvedApp[] = [];
  for (const appName of Object.keys(chapter.permissions)) {
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
    description: chapter.description,
    risk: chapter.risk,
    permissions: chapter.permissions,
    constraints: chapter.constraints,
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
  const chapter = pkg.chapterField as AgentChapterField;
  const agentContext = `agent "${agentName}"`;

  // Resolve all roles
  const roles: ResolvedRole[] = [];
  for (const roleName of chapter.roles) {
    roles.push(resolveRole(roleName, packages, agentContext));
  }

  return {
    name: pkg.name,
    version: pkg.version,
    agentName: chapter.name,
    slug: chapter.slug,
    description: chapter.description,
    runtimes: chapter.runtimes,
    credentials: chapter.credentials,
    roles,
    resources: chapter.resources.length > 0 ? chapter.resources : undefined,
    proxy: chapter.proxy,
    llm: chapter.llm,
    acp: chapter.acp,
  };
}
