/**
 * Role field resolution — expands wildcard patterns in tasks and skills,
 * then resolves role includes.
 *
 * This is a pipeline step called after role loading and before materialization.
 * It calls scanProject() to discover available items, then expands any wildcard
 * entries in the role's tasks and skills arrays, then resolves any role.includes.
 */

import type { Role } from "../types/role.js";
import { scanProject } from "../mason/scanner.js";
import { resolveDialectName } from "./dialect-registry.js";
import {
  expandTaskWildcards,
  expandSkillWildcards,
  isWildcardPattern,
} from "./wildcard.js";
import { resolveIncludes } from "./includes.js";

/**
 * Expand wildcard patterns in a role's tasks and skills arrays.
 *
 * This is the pure wildcard expansion step — no include resolution.
 * Used both for the top-level role and for included roles during
 * recursive resolution.
 *
 * @param role - The role to expand wildcards in
 * @param projectDir - Absolute path to the project root
 * @returns A new Role with wildcard patterns expanded
 */
export async function expandRoleWildcards(
  role: Role,
  projectDir: string,
): Promise<Role> {
  const hasTaskWildcards = role.tasks.some((t) => isWildcardPattern(t.name));
  const hasSkillWildcards = role.skills.some((s) => isWildcardPattern(s.name));

  // Nothing to expand — return unchanged
  if (!hasTaskWildcards && !hasSkillWildcards) {
    return role;
  }

  // No sources — can't scan, leave wildcards as-is
  if (role.sources.length === 0) {
    console.warn(
      "Warning: Role has wildcard patterns in tasks/skills but no sources defined. Wildcards cannot be expanded.",
    );
    return role;
  }

  // Resolve source names to dialect registry keys for scanning
  const dialects = role.sources
    .map((s) => resolveDialectName(s))
    .filter((d): d is string => d !== undefined);

  const scanResult = await scanProject(projectDir, { dialects });

  let tasks = role.tasks;
  let skills = role.skills;

  if (hasTaskWildcards) {
    const result = expandTaskWildcards(role.tasks, scanResult.commands);
    tasks = result.expanded;
    for (const warning of result.warnings) {
      console.warn(`Warning: ${warning}`);
    }
  }

  if (hasSkillWildcards) {
    const result = expandSkillWildcards(role.skills, scanResult.skills);
    skills = result.expanded;
    for (const warning of result.warnings) {
      console.warn(`Warning: ${warning}`);
    }
  }

  return { ...role, tasks, skills };
}

/**
 * Resolve wildcard patterns in a role's tasks and skills arrays,
 * then resolve role includes.
 *
 * This is the full resolution pipeline step called from the CLI
 * after role loading and before materialization.
 *
 * @param role - The role to resolve
 * @param projectDir - Absolute path to the project root
 * @returns A new Role with wildcard patterns expanded and includes merged
 */
export async function resolveRoleFields(
  role: Role,
  projectDir: string,
): Promise<Role> {
  // Step 1: Expand wildcards in the current role
  const expanded = await expandRoleWildcards(role, projectDir);

  // Step 2: Resolve includes (each included role gets its own wildcards expanded)
  return resolveIncludes(expanded, projectDir, expandRoleWildcards);
}
