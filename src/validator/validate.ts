import type { ResolvedMember, ResolvedApp, ResolvedRole, ResolvedTask } from "../resolver/types.js";
import type { ValidationError, ValidationResult } from "./types.js";

/**
 * Check requirement coverage: every app a task requires must have
 * a corresponding entry in the parent role's permissions.
 */
function checkRequirementCoverage(
  role: ResolvedRole,
  errors: ValidationError[],
): void {
  const permittedApps = new Set(Object.keys(role.permissions));

  for (const task of role.tasks) {
    checkTaskRequirementCoverage(role, task, permittedApps, errors);
  }
}

function checkTaskRequirementCoverage(
  role: ResolvedRole,
  task: ResolvedTask,
  permittedApps: Set<string>,
  errors: ValidationError[],
): void {
  for (const app of task.apps) {
    if (!permittedApps.has(app.name)) {
      errors.push({
        category: "requirement-coverage",
        message: `Task "${task.name}" requires app "${app.name}" but role "${role.name}" has no permissions entry for it`,
        context: { role: role.name, task: task.name, app: app.name },
      });
    }
  }

  // Recurse into sub-tasks
  for (const subTask of task.subTasks) {
    checkTaskRequirementCoverage(role, subTask, permittedApps, errors);
  }
}

/**
 * Check tool existence: every tool in a role's allow-list must
 * exist in the resolved app's tools array.
 */
function checkToolExistence(
  role: ResolvedRole,
  errors: ValidationError[],
): void {
  for (const [appName, perms] of Object.entries(role.permissions)) {
    const resolvedApp = role.apps.find((a) => a.name === appName);
    if (!resolvedApp) {
      // App not resolved — this would have been caught by the resolver.
      // Skip tool checks for unresolved apps.
      continue;
    }

    const appToolSet = new Set(resolvedApp.tools);
    for (const tool of perms.allow) {
      if (!appToolSet.has(tool)) {
        errors.push({
          category: "tool-existence",
          message: `Role "${role.name}" allows tool "${tool}" on app "${appName}" but the app does not expose this tool`,
          context: { role: role.name, app: appName, tool },
        });
      }
    }
  }
}

/**
 * Check skill availability: every skill a task requires must be
 * resolvable from the task's own skills or the parent role's skills.
 */
function checkSkillAvailability(
  role: ResolvedRole,
  errors: ValidationError[],
): void {
  const roleSkillNames = new Set(role.skills.map((s) => s.name));

  for (const task of role.tasks) {
    checkTaskSkillAvailability(role, task, roleSkillNames, errors);
  }
}

function checkTaskSkillAvailability(
  role: ResolvedRole,
  task: ResolvedTask,
  roleSkillNames: Set<string>,
  errors: ValidationError[],
): void {
  // Check each skill the task declared in requires.skills against what's
  // actually available: the task's resolved skills or the parent role's skills.
  const taskSkillNames = new Set(task.skills.map((s) => s.name));
  const requiredSkills = task.requiredSkills ?? [];

  for (const skillName of requiredSkills) {
    if (!taskSkillNames.has(skillName) && !roleSkillNames.has(skillName)) {
      errors.push({
        category: "skill-availability",
        message: `Task "${task.name}" requires skill "${skillName}" but it is not available in the task or parent role "${role.name}"`,
        context: { role: role.name, task: task.name, skill: skillName },
      });
    }
  }

  // Recurse into sub-tasks
  for (const subTask of task.subTasks) {
    checkTaskSkillAvailability(role, subTask, roleSkillNames, errors);
  }
}

/**
 * Check app launch config: stdio apps need command+args,
 * sse/streamable-http apps need url.
 */
function checkAppLaunchConfig(
  app: ResolvedApp,
  errors: ValidationError[],
): void {
  if (app.transport === "stdio") {
    if (!app.command) {
      errors.push({
        category: "app-launch-config",
        message: `App "${app.name}" uses stdio transport but has no "command" defined`,
        context: { app: app.name, field: "command" },
      });
    }
    if (!app.args) {
      errors.push({
        category: "app-launch-config",
        message: `App "${app.name}" uses stdio transport but has no "args" defined`,
        context: { app: app.name, field: "args" },
      });
    }
  } else {
    // sse or streamable-http
    if (!app.url) {
      errors.push({
        category: "app-launch-config",
        message: `App "${app.name}" uses ${app.transport} transport but has no "url" defined`,
        context: { app: app.name, field: "url" },
      });
    }
  }
}

/**
 * Collect all unique apps from a resolved member's roles.
 */
function collectAllApps(member: ResolvedMember): ResolvedApp[] {
  const seen = new Set<string>();
  const apps: ResolvedApp[] = [];

  for (const role of member.roles) {
    for (const app of role.apps) {
      if (!seen.has(app.name)) {
        seen.add(app.name);
        apps.push(app);
      }
    }
    for (const task of role.tasks) {
      collectAppsFromTask(task, seen, apps);
    }
  }

  return apps;
}

function collectAppsFromTask(
  task: ResolvedTask,
  seen: Set<string>,
  apps: ResolvedApp[],
): void {
  for (const app of task.apps) {
    if (!seen.has(app.name)) {
      seen.add(app.name);
      apps.push(app);
    }
  }
  for (const subTask of task.subTasks) {
    collectAppsFromTask(subTask, seen, apps);
  }
}

/**
 * Validate a resolved member graph for semantic correctness.
 * Runs all validation checks and collects errors.
 */
export function validateMember(member: ResolvedMember): ValidationResult {
  const errors: ValidationError[] = [];

  // Check each role
  for (const role of member.roles) {
    checkRequirementCoverage(role, errors);
    checkToolExistence(role, errors);
    checkSkillAvailability(role, errors);
  }

  // Check all unique apps for launch config
  const allApps = collectAllApps(member);
  for (const app of allApps) {
    checkAppLaunchConfig(app, errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
