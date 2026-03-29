# Wildcard Expansion for Tasks and Skills

## Overview

Implements PRD sections 6-7: wildcard pattern support in ROLE.md `tasks` and `skills` arrays. Patterns are expanded against items discovered by `scanProject()` at build time.

## Capabilities

### wildcard-expansion

**Module:** `packages/shared/src/role/wildcard.ts`

Pure functions for wildcard matching and expansion. No filesystem access.

**Exports:**
- `isWildcardPattern(name: string): boolean` — returns true if name contains `*`
- `validatePattern(name: string): void` — rejects `**`, `?`, `[...]` with `WildcardPatternError`
- `matchWildcard(pattern: string, name: string): boolean` — bare `*` matches all (crosses `/`); scoped patterns use single-segment matching
- `expandTaskWildcards(tasks: TaskRef[], discovered: DiscoveredCommand[]): { expanded: TaskRef[], warnings: string[] }`
- `expandSkillWildcards(skills: SkillRef[], discovered: DiscoveredSkill[]): { expanded: SkillRef[], warnings: string[] }`
- `WildcardPatternError` — error class for invalid patterns

**Behavior:**
- Bare `*` matches ALL discovered items regardless of scope depth
- Scoped `deploy/*` matches `deploy/staging`, `deploy/production` but NOT `deploy/sub/deep`
- Non-wildcard entries pass through with first-wins deduplication
- Validation rejects `**`, `?`, `[...]` for ALL entries (not just wildcards)
- Zero-match patterns produce warnings, not errors

### resolve-role-fields

**Module:** `packages/shared/src/role/resolve-role-fields.ts`

Integration point that connects wildcard expansion with project scanning.

**Exports:**
- `resolveRoleFields(role: Role, projectDir: string): Promise<Role>` — scans project, expands wildcards, returns new Role

**Behavior:**
- If no wildcards present, returns role unchanged (no scan)
- If sources are empty, warns and returns unchanged
- Resolves source names to dialect keys via `resolveDialectName()`
- Calls `scanProject()` once, feeds results to expand functions

## Files Changed

- **New:** `packages/shared/src/role/wildcard.ts`
- **New:** `packages/shared/src/role/resolve-role-fields.ts`
- **Modified:** `packages/shared/src/role/index.ts` — added exports
- **Modified:** `packages/shared/src/index.ts` — added re-exports
- **New:** `packages/shared/tests/role/wildcard.test.ts` — 31 test cases
- **New:** `packages/shared/tests/role/resolve-role-fields.test.ts` — 5 test cases

## Test Coverage

36 total tests covering PRD section 11.4 tests 12-23:
- Bare wildcard, scoped wildcard, boundary crossing, mixed lists, deduplication
- Zero matches, pass-through, invalid syntax, skills wildcard
- Integration: no-wildcard pass-through, empty sources warning, scan-based expansion
