/**
 * Role inclusion — recursive resolution of role.includes references.
 *
 * Resolves each included role via resolveRole(), expands wildcards,
 * recursively processes its own includes, and merges into the current role.
 *
 * Includes circular detection (via visited set) and depth limiting (max 10).
 */

import type { Role } from "../types/role.js";
import { resolveRole } from "./discovery.js";
import { mergeRoles } from "./merge.js";

const MAX_INCLUDE_DEPTH = 10;

/**
 * Error thrown when role inclusion fails due to circular references or depth limits.
 */
export class RoleIncludeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoleIncludeError";
  }
}

/**
 * Function type for wildcard expansion on a role.
 * Accepts a role and project directory, returns a role with expanded wildcards.
 * This is passed as a callback to avoid circular imports with resolve-role-fields.ts.
 */
export type ExpandWildcardsFn = (
  role: Role,
  projectDir: string,
) => Promise<Role>;

/**
 * Resolve role includes recursively.
 *
 * For each entry in role.role.includes:
 * 1. Resolve the included role via resolveRole()
 * 2. Expand wildcards in the included role
 * 3. Recursively resolve its own includes
 * 4. Merge into the current role
 *
 * @param role - The role whose includes should be resolved
 * @param projectDir - Absolute path to the project root (used for all resolveRole calls)
 * @param expandWildcards - Function to expand wildcards in a role (injected to avoid circular imports)
 * @param visited - Set of role names already in the resolution chain (for circular detection)
 * @param depth - Current recursion depth (for depth limiting)
 * @returns A new Role with all includes merged in
 * @throws RoleIncludeError if circular include detected or depth exceeded
 * @throws RoleDiscoveryError if an included role is not found
 */
export async function resolveIncludes(
  role: Role,
  projectDir: string,
  expandWildcards: ExpandWildcardsFn,
  visited?: Set<string>,
  depth?: number,
): Promise<Role> {
  const includes = role.role?.includes ?? [];
  if (includes.length === 0) return role;

  const currentDepth = depth ?? 0;
  if (currentDepth >= MAX_INCLUDE_DEPTH) {
    throw new RoleIncludeError(
      `Role inclusion depth exceeds maximum (${MAX_INCLUDE_DEPTH}). Check for deep or unintended inclusion chains.`,
    );
  }

  const currentVisited = visited ?? new Set<string>();
  const currentName = role.metadata.name;
  currentVisited.add(currentName);

  let result = role;

  for (const includeName of includes) {
    // Circular detection: check if this role is already in the chain
    if (currentVisited.has(includeName)) {
      const chain = [...currentVisited, includeName].join(" \u2192 ");
      throw new RoleIncludeError(
        `Circular role inclusion detected: ${chain}.`,
      );
    }

    // Resolve the included role
    const includedRole = await resolveRole(includeName, projectDir);

    // Expand wildcards in the included role
    const expandedIncluded = await expandWildcards(includedRole, projectDir);

    // Recursively resolve the included role's own includes
    const fullyResolved = await resolveIncludes(
      expandedIncluded,
      projectDir,
      expandWildcards,
      new Set(currentVisited),
      currentDepth + 1,
    );

    // Merge into current result
    result = mergeRoles(result, fullyResolved);
  }

  return result;
}
