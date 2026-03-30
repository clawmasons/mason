# Role Composition via `role.includes`

## Overview

Implements PRD section 8: a `role.includes` field that lets a ROLE.md reference other roles to merge into itself. Included roles are resolved recursively, fully expanded (wildcards + their own includes), and merged additively with "current role wins" semantics.

## Capabilities

### role-merge

**Module:** `packages/shared/src/role/merge.ts`

Pure function for merging two Role objects. No side effects or filesystem access.

**Exports:**
- `mergeRoles(current: Role, included: Role): Role` — merge per PRD Appendix B

**Merge semantics:**
- Lists (tasks, skills, mcp): union, dedup by `name` identity key, current items first
- Container lists (packages.apt/npm/pip, ignore.paths): union, dedup by string value
- Container mounts: union, dedup by `target` identity key
- Governance credentials: union, dedup by string value
- Scalars (risk, metadata.name, metadata.description, type): current wins
- Instructions: current first, included appended after `\n\n` separator
- Sources: NOT merged (current only)

### role-includes

**Module:** `packages/shared/src/role/includes.ts`

Recursive role inclusion with circular detection and depth limiting.

**Exports:**
- `resolveIncludes(role: Role, projectDir: string, expandWildcards: ExpandWildcardsFn, visited?: Set<string>, depth?: number): Promise<Role>`
- `RoleIncludeError` — error class for circular/depth issues
- `ExpandWildcardsFn` — type alias for the wildcard expansion callback

**Behavior:**
- If `role.role.includes` is empty, returns role unchanged
- For each include: resolves via `resolveRole()`, expands wildcards, recursively resolves includes, then merges
- Circular detection via visited set — error with full chain
- Depth limit of 10 — error with clear message
- Missing role produces `RoleDiscoveryError` (from existing discovery module)

## Schema Change

**`packages/shared/src/schemas/role-types.ts`:**
```typescript
export const roleConfigSchema = z.object({
  includes: z.array(z.string()).optional().default([]),
});

// Added to roleSchema:
role: roleConfigSchema.optional().default({}),
```

This is backward-compatible: existing ROLE.md files without `role` section get `role: { includes: [] }`.

## Files Changed

- **Modified:** `packages/shared/src/schemas/role-types.ts` — add `roleConfigSchema` and `role` field
- **Modified:** `packages/shared/src/types/role.ts` — add `RoleConfig` type
- **Modified:** `packages/shared/src/role/parser.ts` — extract `frontmatter.role`
- **New:** `packages/shared/src/role/merge.ts` — role merge logic
- **New:** `packages/shared/src/role/includes.ts` — include resolution
- **Modified:** `packages/shared/src/role/resolve-role-fields.ts` — integrate includes after wildcards
- **Modified:** `packages/shared/src/role/index.ts` — new exports
- **Modified:** `packages/shared/src/index.ts` — new re-exports
- **Modified:** `packages/shared/src/schemas/index.ts` — export `roleConfigSchema`
- **Modified:** `packages/cli/src/cli/commands/run-agent.ts` — add `role` field to `generateProjectRole` output
- **Modified:** `packages/cli/tests/materializer/docker-generator.test.ts` — add `role` field to test fixtures
- **Modified:** `packages/cli/tests/materializer/role-materializer.test.ts` — add `role` field to test fixtures
- **Modified:** `packages/shared/tests/role/resolve-role-fields.test.ts` — add `role` field to test fixture
- **New:** `packages/shared/tests/role/merge.test.ts` — merge unit tests (10 tests)
- **New:** `packages/shared/tests/role/includes.test.ts` — include resolution tests (7 tests)

## Test Coverage

17 total tests covering PRD section 11.4 tests 1-11 plus additional coverage:

**Merge tests (10 tests):**
1. List union with dedup — duplicate task names discarded
2. List ordering — current items first, included appended
3. Map identity-key dedup — same-name MCP server discarded entirely
4. Scalar current-wins — risk, name, description
5. Instructions append — both non-empty
6. Instructions fallback — current empty, included used
7. Container packages and mounts merge with dedup
8. Governance credentials merge with dedup
9. Sources NOT merged — current only
10. MCP server env preserved from current (identity key dedup)

**Include tests (7 tests):**
1. Returns role unchanged when includes is empty
2. Multiple includes ordering — second include sees first's merged result
3. Circular detection — A -> B -> A error with chain
4. Transitive — A includes B includes C; C items in A
5. Depth limit — chain of 11 fails
6. Calls expandWildcards on included roles
7. Uses project directory for resolveRole lookups
