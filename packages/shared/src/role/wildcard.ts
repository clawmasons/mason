/**
 * Wildcard expansion for tasks and skills arrays in ROLE.md.
 *
 * Supports:
 * - Bare `*` — matches ALL discovered items (crosses `/` boundaries)
 * - Scoped `deploy/*` — matches items in the `deploy/` scope (single segment only)
 *
 * Does NOT support:
 * - `**` (recursive glob)
 * - `?` (single-character wildcard)
 * - `[...]` (character classes)
 */

import type { TaskRef, SkillRef } from "../types/role.js";
import type { DiscoveredCommand, DiscoveredSkill } from "../mason/scanner.js";

/**
 * Error thrown when an invalid wildcard pattern is encountered.
 */
export class WildcardPatternError extends Error {
  constructor(pattern: string) {
    super(
      `Unsupported glob syntax "${pattern}". Only "*" and "scope/*" wildcards are supported.`,
    );
    this.name = "WildcardPatternError";
  }
}

/**
 * Check if a name contains a wildcard character.
 */
export function isWildcardPattern(name: string): boolean {
  return name.includes("*");
}

/**
 * Validate a wildcard pattern. Rejects `**`, `?`, and `[...]` syntax.
 * @throws WildcardPatternError if pattern uses unsupported syntax
 */
export function validatePattern(name: string): void {
  if (name.includes("**")) {
    throw new WildcardPatternError(name);
  }
  if (name.includes("?")) {
    throw new WildcardPatternError(name);
  }
  if (/\[.*\]/.test(name)) {
    throw new WildcardPatternError(name);
  }
}

/**
 * Match a wildcard pattern against a name.
 *
 * - Bare `*` matches everything (crosses `/` boundaries).
 * - Scoped patterns like `deploy/*` use single-segment matching:
 *   `*` matches any non-`/` characters within one path segment.
 */
export function matchWildcard(pattern: string, name: string): boolean {
  // Bare "*" matches everything
  if (pattern === "*") return true;

  // Convert scoped pattern to regex:
  // 1. Escape regex special chars (except *)
  // 2. Replace * with [^/]+ (match one or more non-slash chars)
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexStr = "^" + escaped.replace(/\*/g, "[^/]+") + "$";
  return new RegExp(regexStr).test(name);
}

/**
 * Expand wildcard patterns in a tasks array against discovered commands.
 *
 * Non-wildcard entries pass through unchanged. Wildcard entries are matched
 * against discovered commands and replaced with concrete TaskRef objects.
 * First-wins deduplication ensures each task name appears only once.
 */
export function expandTaskWildcards(
  tasks: TaskRef[],
  discovered: DiscoveredCommand[],
): { expanded: TaskRef[]; warnings: string[] } {
  const expanded: TaskRef[] = [];
  const seen = new Set<string>();
  const warnings: string[] = [];

  for (const task of tasks) {
    // Validate syntax for all entries (rejects **, ?, [...] even without *)
    validatePattern(task.name);

    if (!isWildcardPattern(task.name)) {
      // Non-wildcard: pass through with dedup
      if (!seen.has(task.name)) {
        seen.add(task.name);
        expanded.push(task);
      }
      continue;
    }

    // Match against discovered commands
    const matched = discovered.filter((cmd) =>
      matchWildcard(task.name, cmd.name),
    );

    if (matched.length === 0) {
      warnings.push(
        `Pattern "${task.name}" matched no tasks in source directories.`,
      );
    }

    for (const cmd of matched) {
      if (!seen.has(cmd.name)) {
        seen.add(cmd.name);
        expanded.push({ name: cmd.name });
      }
    }
  }

  return { expanded, warnings };
}

/**
 * Expand wildcard patterns in a skills array against discovered skills.
 *
 * Non-wildcard entries pass through unchanged. Wildcard entries are matched
 * against discovered skills and replaced with concrete SkillRef objects.
 * First-wins deduplication ensures each skill name appears only once.
 */
export function expandSkillWildcards(
  skills: SkillRef[],
  discovered: DiscoveredSkill[],
): { expanded: SkillRef[]; warnings: string[] } {
  const expanded: SkillRef[] = [];
  const seen = new Set<string>();
  const warnings: string[] = [];

  for (const skill of skills) {
    // Validate syntax for all entries (rejects **, ?, [...] even without *)
    validatePattern(skill.name);

    if (!isWildcardPattern(skill.name)) {
      // Non-wildcard: pass through with dedup
      if (!seen.has(skill.name)) {
        seen.add(skill.name);
        expanded.push(skill);
      }
      continue;
    }

    // Match against discovered skills
    const matched = discovered.filter((s) =>
      matchWildcard(skill.name, s.name),
    );

    if (matched.length === 0) {
      warnings.push(
        `Pattern "${skill.name}" matched no skills in source directories.`,
      );
    }

    for (const s of matched) {
      if (!seen.has(s.name)) {
        seen.add(s.name);
        expanded.push({ name: s.name });
      }
    }
  }

  return { expanded, warnings };
}
