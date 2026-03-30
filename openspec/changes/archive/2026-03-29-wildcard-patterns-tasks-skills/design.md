## Context

The ROLE.md parser in `packages/shared/src/role/parser.ts` produces a `Role` object with `tasks: TaskRef[]` and `skills: SkillRef[]` arrays. Currently, these arrays contain literal name references that are passed directly to the materializer. The PRD (sections 6-7) introduces wildcard patterns (`*` and scoped patterns like `deploy/*`) that must be expanded against discovered items from source directories before materialization.

**Key files:**
- `packages/shared/src/role/parser.ts` — produces `Role` with `TaskRef[]` / `SkillRef[]`
- `packages/shared/src/schemas/role-types.ts` — `taskRefSchema` has `{ name: string, ref?: string }`, `skillRefSchema` same
- `packages/shared/src/mason/scanner.ts` — `scanProject()` returns `ScanResult` with `commands: DiscoveredCommand[]` and `skills: DiscoveredSkill[]`
- `packages/shared/src/types/role.ts` — `TaskRef = { name: string, ref?: string }`, `SkillRef = { name: string, ref?: string }`

**Key types:**
- `TaskRef`: `{ name: string, ref?: string }` — a task reference in the role
- `SkillRef`: `{ name: string, ref?: string }` — a skill reference in the role
- `DiscoveredCommand`: `{ name: string, path: string, dialect: string }` — a scanned command/task
- `DiscoveredSkill`: `{ name: string, path: string, dialect: string }` — a scanned skill
- `ScanResult`: `{ projectDir, skills, commands, mcpServers, systemPrompt }`

## Goals / Non-Goals

**Goals:**
- Bare `*` matches ALL discovered items regardless of scope depth (crosses `/` boundaries)
- Scoped `deploy/*` matches items in the `deploy/` scope but NOT deeper (`deploy/sub/deep`)
- Mixed lists work with deduplication: `["review", "*"]` — `review` appears once
- Zero matches produce a warning, not an error
- Non-wildcard names pass through unchanged (validated later during materialization)
- Invalid syntax (`**`, `?`, `[...]`) produces a descriptive error
- The expansion module is stateless and testable in isolation (no filesystem access)
- `resolveRoleFields()` is the integration point that calls `scanProject()` and feeds results to expansion

**Non-Goals:**
- Recursive `**` glob patterns (PRD NG-3)
- MCP wildcard discovery (PRD NG-5)
- Runtime wildcard resolution (PRD NG-1) — resolution happens at build time
- Modifying the Zod schema — wildcards are resolved post-parse

## Decisions

### 1. Bare `*` is a special case, not a glob

When the pattern is exactly `"*"`, it matches ALL discovered items regardless of path depth. This is NOT standard glob semantics (where `*` doesn't cross `/`). It's a deliberate UX choice: `tasks: ["*"]` means "include everything from sources." Scoped patterns like `deploy/*` use standard single-segment glob rules.

### 2. Wildcard expansion is pure — no filesystem access

`expandTaskWildcards()` and `expandSkillWildcards()` take pre-scanned discovery results as input. They do not access the filesystem. `resolveRoleFields()` is the only function that calls `scanProject()`. This makes the expansion logic trivially unit-testable.

### 3. Expansion produces TaskRef/SkillRef objects from discovered names

When a wildcard `*` expands to a discovered command named `deploy/staging`, it produces `{ name: "deploy/staging" }` as a `TaskRef`. The `ref` field is left undefined — the materializer resolves it later. This matches how the parser produces `TaskRef` for explicit names.

### 4. First-wins deduplication across all entries

After expansion, duplicate names are removed with first-wins semantics. If the user writes `["review", "*"]`, the explicit `review` TaskRef appears first. When `*` expands and includes `review` again, the duplicate is discarded. This preserves user intent — explicit entries take precedence.

### 5. Empty sources means wildcards cannot expand

If `role.sources` is empty, `scanProject()` has no dialects to scan. Wildcard entries are left as-is with a warning. They will fail during materialization with a clear error (no task named `*` exists).

## Implementation

### New: `packages/shared/src/role/wildcard.ts`

```typescript
import type { TaskRef, SkillRef } from "../types/role.js";
import type { DiscoveredCommand, DiscoveredSkill } from "../mason/scanner.js";

/**
 * Error thrown when an invalid wildcard pattern is encountered.
 */
export class WildcardPatternError extends Error {
  constructor(pattern: string, reason: string) {
    super(`Unsupported glob syntax "${pattern}". ${reason}`);
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
 * Validate a wildcard pattern. Rejects **, ?, and [...] syntax.
 */
export function validatePattern(name: string): void {
  if (name.includes("**")) {
    throw new WildcardPatternError(name, 'Only "*" and "scope/*" wildcards are supported.');
  }
  if (name.includes("?")) {
    throw new WildcardPatternError(name, 'Only "*" and "scope/*" wildcards are supported.');
  }
  if (/\[.*\]/.test(name)) {
    throw new WildcardPatternError(name, 'Only "*" and "scope/*" wildcards are supported.');
  }
}

/**
 * Match a wildcard pattern against a name.
 * - Bare "*" matches everything (crosses / boundaries)
 * - Scoped "deploy/*" matches "deploy/staging" but NOT "deploy/sub/deep"
 */
export function matchWildcard(pattern: string, name: string): boolean {
  if (pattern === "*") return true;

  // Convert scoped pattern to regex: "deploy/*" → /^deploy\/[^/]+$/
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexStr = "^" + escaped.replace(/\*/g, "[^/]+") + "$";
  return new RegExp(regexStr).test(name);
}

/**
 * Expand wildcard patterns in a tasks array.
 */
export function expandTaskWildcards(
  tasks: TaskRef[],
  discovered: DiscoveredCommand[],
): { expanded: TaskRef[]; warnings: string[] } {
  const expanded: TaskRef[] = [];
  const seen = new Set<string>();
  const warnings: string[] = [];

  for (const task of tasks) {
    if (!isWildcardPattern(task.name)) {
      if (!seen.has(task.name)) {
        seen.add(task.name);
        expanded.push(task);
      }
      continue;
    }

    validatePattern(task.name);

    const matched = discovered.filter((cmd) => matchWildcard(task.name, cmd.name));
    if (matched.length === 0) {
      warnings.push(`Pattern "${task.name}" matched no tasks in source directories.`);
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
 * Expand wildcard patterns in a skills array.
 */
export function expandSkillWildcards(
  skills: SkillRef[],
  discovered: DiscoveredSkill[],
): { expanded: SkillRef[]; warnings: string[] } {
  const expanded: SkillRef[] = [];
  const seen = new Set<string>();
  const warnings: string[] = [];

  for (const skill of skills) {
    if (!isWildcardPattern(skill.name)) {
      if (!seen.has(skill.name)) {
        seen.add(skill.name);
        expanded.push(skill);
      }
      continue;
    }

    validatePattern(skill.name);

    const matched = discovered.filter((s) => matchWildcard(skill.name, s.name));
    if (matched.length === 0) {
      warnings.push(`Pattern "${skill.name}" matched no skills in source directories.`);
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
```

### New: `packages/shared/src/role/resolve-role-fields.ts`

```typescript
import type { Role } from "../types/role.js";
import { scanProject } from "../mason/scanner.js";
import { resolveDialectName } from "./dialect-registry.js";
import { expandTaskWildcards, expandSkillWildcards, isWildcardPattern } from "./wildcard.js";

/**
 * Resolve wildcard patterns in a role's tasks and skills arrays.
 *
 * Calls scanProject() with the role's sources, then expands any wildcard
 * entries against the discovered items. Returns a new Role with expanded arrays.
 *
 * This is a pipeline step called after role loading and before materialization.
 */
export async function resolveRoleFields(
  role: Role,
  projectDir: string,
): Promise<Role> {
  const hasTaskWildcards = role.tasks.some((t) => isWildcardPattern(t.name));
  const hasSkillWildcards = role.skills.some((s) => isWildcardPattern(s.name));

  if (!hasTaskWildcards && !hasSkillWildcards) {
    return role; // Nothing to expand
  }

  if (role.sources.length === 0) {
    console.warn(
      "Warning: Role has wildcard patterns in tasks/skills but no sources defined. Wildcards cannot be expanded.",
    );
    return role;
  }

  // Resolve source names to dialect names for scanning
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
```

### Modified: `packages/shared/src/role/index.ts`

Add exports for the new modules:

```typescript
// Wildcard expansion
export {
  isWildcardPattern,
  validatePattern,
  matchWildcard,
  expandTaskWildcards,
  expandSkillWildcards,
  WildcardPatternError,
} from "./wildcard.js";

// Role field resolution
export { resolveRoleFields } from "./resolve-role-fields.js";
```

### Test Coverage

**`packages/shared/tests/role/wildcard.test.ts`** — 10 test cases covering PRD tests 12-20, 23:

1. **Bare wildcard matches all (test 12):** `["*"]` against `[review, deploy/staging, deploy/production]` returns all three
2. **Scoped wildcard matches scope (test 13):** `["deploy/*"]` matches `deploy/staging`, `deploy/production` but not `review`
3. **Scoped wildcard doesn't cross boundaries (test 14):** `["deploy/*"]` does NOT match `deploy/sub/deep`
4. **Mixed list (test 15):** `["review", "deploy/*"]` produces `review` + expanded deploy tasks
5. **Deduplication (test 16):** `["review", "*"]` — `review` appears once, wildcard adds the rest
6. **Zero matches warning (test 17):** `["deploy/*"]` with no deploy tasks returns warning
7. **No wildcard pass-through (test 18):** `["review"]` passed through unchanged
8. **Invalid syntax error (test 19):** `["**"]`, `["deploy/?"]`, `["[a-z]"]` throw `WildcardPatternError`
9. **Skills wildcard (test 20):** `["*"]` in skills discovers all skills
10. **Wildcard with explicit entries (test 23):** `["*"]` with explicit entries results in all discovered

**`packages/shared/tests/role/resolve-role-fields.test.ts`** — 3 test cases:

1. **No wildcards — pass through:** Role with only explicit names returns unchanged
2. **Empty sources — warning:** Role with wildcards but no sources returns unchanged with warning
3. **Wildcards expanded via scan:** Role with `["*"]` tasks and skills, mocked `scanProject()`, returns expanded arrays
