## Context

The role resolution pipeline (from CHANGE 2) currently runs: parse -> wildcard expansion -> materialization. CHANGE 3 adds a role inclusion step between wildcard expansion and materialization. The inclusion step resolves referenced roles, recursively processes them (wildcards + their own includes), and merges them into the current role.

**Key files:**
- `packages/shared/src/schemas/role-types.ts` — `roleSchema` defines the Zod schema for Role; types auto-derived
- `packages/shared/src/types/role.ts` — `Role` type and related types, all derived from Zod `z.infer`
- `packages/shared/src/role/parser.ts` — `readMaterializedRole()` parses ROLE.md into Role object
- `packages/shared/src/role/resolve-role-fields.ts` — `resolveRoleFields()` expands wildcards
- `packages/shared/src/role/discovery.ts` — `resolveRole()` resolves a role by name from local or package sources
- `packages/shared/src/role/wildcard.ts` — wildcard expansion functions

**Key types:**
- `Role` — the full role object with metadata, tasks, skills, mcp, sources, container, governance, instructions
- `TaskRef`: `{ name: string, ref?: string }` — identity key is `name`
- `SkillRef`: `{ name: string, ref?: string }` — identity key is `name`
- `McpServerConfig`: `{ name: string, ... }` — identity key is `name`
- `MountConfig`: `{ source: string, target: string, readonly?: boolean }` — identity key is `target`
- `RoleDiscoveryError` — existing error type for role not found

## Goals / Non-Goals

**Goals:**
- Add `role.includes` field to role schema (optional, defaults to empty array)
- Merge included roles additively per PRD Appendix B merge semantics
- Detect circular includes with clear error chain (e.g., `project -> base-role -> project`)
- Enforce depth limit of 10 with clear error
- Missing included roles produce `RoleDiscoveryError` with install instructions
- Included roles are fully resolved (wildcards + their own includes) before merging
- Current role always wins — its items appear first, its scalars take precedence
- Sources are NOT merged from included roles

**Non-Goals:**
- Modifying `resolveRole()` itself — it already supports local + package resolution
- Adding role composition to the CLI layer — that's CHANGE 4
- Wildcard expansion for MCP fields

## Decisions

### 1. Schema addition is minimal and backward-compatible

Adding `role: z.object({ includes: z.array(z.string()).optional().default([]) }).optional().default({})` means existing ROLE.md files without a `role` section parse identically — `role.includes` defaults to `[]`.

### 2. `resolveIncludes` is separate from `resolveRoleFields`

The include resolution function is in its own module (`includes.ts`) rather than inlined in `resolve-role-fields.ts`. This keeps each module focused and testable. `resolveRoleFields` calls `resolveIncludes` after wildcard expansion.

### 3. Merge is a pure function operating on two Role objects

`mergeRoles(current, included)` is a pure function with no side effects. It does not call `resolveRole()` or expand wildcards. All resolution happens before merge. This makes merge trivially testable.

### 4. `resolveIncludes` uses the user's project directory for all lookups

Even when an included role is from a package, `resolveRole()` is called with the user's `projectDir`. This ensures `node_modules/` lookups work consistently regardless of where the included role lives.

### 5. Packaged roles without sources skip wildcard expansion

When a resolved included role has empty `sources`, `resolveRoleFields` already handles this — it returns the role unchanged with wildcards left as-is. For packaged roles, this is the expected case since they declare concrete task/skill lists rather than wildcards.

### 6. The parser extracts `frontmatter.role` and passes it through

The parser extracts `frontmatter.role` as a raw object and includes it in `roleData`. Zod validates and applies defaults. No special normalization is needed since the `role` section contains only `includes: string[]`.

## Implementation

### Modified: `packages/shared/src/schemas/role-types.ts`

Add the `roleConfigSchema` sub-schema and add `role` field to `roleSchema`:

```typescript
export const roleConfigSchema = z.object({
  includes: z.array(z.string()).optional().default([]),
});

// In roleSchema, add:
role: roleConfigSchema.optional().default({}),
```

### Modified: `packages/shared/src/types/role.ts`

Add the `RoleConfig` type (auto-derived from schema):

```typescript
import type { roleConfigSchema } from "../schemas/role-types.js";
export type RoleConfig = z.infer<typeof roleConfigSchema>;
```

### Modified: `packages/shared/src/role/parser.ts`

In `readMaterializedRole()`, after extracting `sources`, add extraction of the `role` field:

```typescript
// Extract role config (includes)
const role = frontmatter.role ?? {};

// In roleData object, add:
role,
```

### New: `packages/shared/src/role/merge.ts`

```typescript
import type { Role, TaskRef, SkillRef, McpServerConfig, MountConfig } from "../types/role.js";

/**
 * Merge an included role into the current role using additive semantics.
 * Current role always wins. See PRD Appendix B for merge rules.
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
      credentials: unionByValue(current.governance.credentials, included.governance.credentials),
    },
    // Scalars: current wins (metadata.name, metadata.description, type, sources — all kept from current)
    // sources: NOT merged (current only) — already handled by spread
  };
}

function unionByKey<T>(current: T[], included: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set(current.map(keyFn));
  const result = [...current];
  for (const item of included) {
    if (!seen.has(keyFn(item))) {
      seen.add(keyFn(item));
      result.push(item);
    }
  }
  return result;
}

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

function mergeInstructions(current: string, included: string): string {
  if (!current && !included) return "";
  if (!current) return included;
  if (!included) return current;
  return `${current}\n\n${included}`;
}
```

### New: `packages/shared/src/role/includes.ts`

```typescript
import type { Role } from "../types/role.js";
import { resolveRole, RoleDiscoveryError } from "./discovery.js";
import { resolveRoleFields } from "./resolve-role-fields.js";
import { mergeRoles } from "./merge.js";

const MAX_INCLUDE_DEPTH = 10;

export class RoleIncludeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoleIncludeError";
  }
}

/**
 * Resolve role includes recursively.
 *
 * For each entry in role.includes:
 * 1. Resolve the included role via resolveRole()
 * 2. Recursively process it (wildcards + its own includes)
 * 3. Merge it into the current role
 */
export async function resolveIncludes(
  role: Role,
  projectDir: string,
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
    if (currentVisited.has(includeName)) {
      const chain = [...currentVisited, includeName].join(" \u2192 ");
      throw new RoleIncludeError(
        `Circular role inclusion detected: ${chain}.`,
      );
    }

    // Resolve the included role
    const includedRole = await resolveRole(includeName, projectDir);

    // Recursively process: wildcards + its own includes
    const resolvedIncluded = await resolveRoleFields(includedRole, projectDir);
    const fullyResolved = await resolveIncludes(
      resolvedIncluded,
      projectDir,
      new Set(currentVisited),
      currentDepth + 1,
    );

    // Merge into current
    result = mergeRoles(result, fullyResolved);
  }

  return result;
}
```

### Modified: `packages/shared/src/role/resolve-role-fields.ts`

Add `resolveIncludes` call after wildcard expansion:

```typescript
import { resolveIncludes } from "./includes.js";

export async function resolveRoleFields(role, projectDir) {
  // ... existing wildcard expansion ...

  const expanded = { ...role, tasks, skills };

  // Resolve includes after wildcard expansion
  return resolveIncludes(expanded, projectDir);
}
```

**Wait** — this creates a mutual dependency: `resolve-role-fields` imports `includes`, and `includes` imports `resolve-role-fields`. To break this cycle, `resolveIncludes` will accept `resolveRoleFields` as a parameter, or we restructure so that the caller orchestrates both steps. The cleaner approach: `resolveRoleFields` only does wildcard expansion. A new top-level function `resolveRolePipeline` in `resolve-role-fields.ts` orchestrates: wildcards -> includes. `includes.ts` imports only `resolveRolePipeline` (no circular import since `resolveRolePipeline` is the caller).

**Revised approach:** `includes.ts` calls `resolveRoleFields` for wildcard expansion on included roles, and `resolve-role-fields.ts` exports a new `resolveRolePipeline` function that calls `resolveRoleFields` then `resolveIncludes`. The dependency is:
- `resolve-role-fields.ts` imports from `includes.ts` (for `resolveIncludes`)
- `includes.ts` imports from `resolve-role-fields.ts` (for `resolveRoleFields`)

This is a circular dependency. To break it cleanly:
- Keep `resolveRoleFields` doing only wildcard expansion (no includes)
- `includes.ts` imports `resolveRoleFields` from `resolve-role-fields.ts` (one-way)
- Create a new export `resolveRolePipeline` in `resolve-role-fields.ts` that imports `resolveIncludes` from `includes.ts`

This means `resolve-role-fields.ts` imports from `includes.ts` AND `includes.ts` imports from `resolve-role-fields.ts` — still circular. The fix: put `resolveRolePipeline` in a third file, or pass `resolveRoleFields` as a callback to `resolveIncludes`.

**Final decision:** `resolveIncludes` accepts a `expandWildcards` callback parameter to avoid circular imports. `resolve-role-fields.ts` creates the callback from its own `resolveRoleFields` function and passes it.

## Test Coverage

**`packages/shared/tests/role/merge.test.ts`** — 7 test cases (PRD tests 1-7):

1. **List union with dedup (test 1):** Included role adds new tasks; duplicate task names discarded
2. **List ordering (test 2):** Current role items appear first; included appended
3. **Map identity-key dedup (test 4):** Included role's MCP server with same name discarded entirely
4. **Scalar current-wins (test 5):** Included role's `risk: HIGH` does not override current's `risk: LOW`
5. **Instructions append (test 6):** Both have instructions; included appended after `\n\n` separator
6. **Instructions fallback (test 7):** Current has empty instructions; included's instructions used
7. **Container packages merge:** apt/npm/pip lists union with dedup; mounts dedup by target

**`packages/shared/tests/role/includes.test.ts`** — 4 test cases (PRD tests 8-11):

8. **Multiple includes ordering (test 8):** Second include sees first's merged result as "current"
9. **Circular detection (test 9):** A -> B -> A fails with cycle error showing full chain
10. **Transitive includes (test 10):** A includes B, B includes C; C's items appear in A
11. **Depth limit (test 11):** Chain of 11 includes fails with depth error
