/**
 * Role merge — additive merge of two Role objects.
 *
 * Merge semantics per PRD Appendix B:
 * - Lists: union with dedup by identity key, current items first
 * - Scalars: current wins
 * - Instructions: current first, included appended after separator
 * - Sources: NOT merged (current only)
 */

import type { Role } from "../types/role.js";

/**
 * Merge an included role into the current role using additive semantics.
 * The current role always wins — its items appear first, its scalars
 * take precedence.
 *
 * @param current - The base role (takes precedence)
 * @param included - The included role to merge in
 * @returns A new Role with merged content
 */
export function mergeRoles(current: Role, included: Role): Role {
  return {
    ...current,
    // Lists: union with dedup by identity key, current first
    tasks: unionByKey(current.tasks, included.tasks, (t) => t.name),
    skills: unionByKey(current.skills, included.skills, (s) => s.name),
    mcp: unionByKey(current.mcp, included.mcp, (m) => m.name),
    // Instructions: append included after separator
    instructions: mergeInstructions(current.instructions, included.instructions),
    // Container: merge nested lists
    container: {
      ...current.container,
      packages: {
        apt: unionByValue(current.container.packages.apt, included.container.packages.apt),
        npm: unionByValue(current.container.packages.npm, included.container.packages.npm),
        pip: unionByValue(current.container.packages.pip, included.container.packages.pip),
      },
      ignore: {
        paths: unionByValue(current.container.ignore.paths, included.container.ignore.paths),
      },
      mounts: unionByKey(current.container.mounts, included.container.mounts, (m) => m.target),
    },
    // Governance: merge credentials list, scalars current wins
    governance: {
      ...current.governance,
      risk: current.governance.risk || included.governance.risk,
      credentials: unionByValue(
        current.governance.credentials,
        included.governance.credentials,
      ),
    },
    // Scalars: current wins (metadata, type, sources — all kept from current via spread)
    // Sources: NOT merged — current only (already handled by spread)
  };
}

/**
 * Union two arrays by identity key, with current items first.
 * Duplicate keys from the included array are discarded.
 */
function unionByKey<T>(
  current: T[],
  included: T[],
  keyFn: (item: T) => string,
): T[] {
  const seen = new Set(current.map(keyFn));
  const result = [...current];
  for (const item of included) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

/**
 * Union two string arrays by value, with current items first.
 */
function unionByValue(current: string[], included: string[]): string[] {
  const seen = new Set(current);
  const result = [...current];
  for (const item of included) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

/**
 * Merge instructions: current first, included appended after blank line.
 * If one is empty, use the other.
 */
function mergeInstructions(current: string, included: string): string {
  if (!current && !included) return "";
  if (!current) return included;
  if (!included) return current;
  return `${current}\n\n${included}`;
}
