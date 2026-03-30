## Why

ROLE.md files support `tasks` and `skills` arrays for declaring which items to include in a role. Currently, users must enumerate every task and skill by name. There is no mechanism for "include everything" or "include all items under a scope." The PRD (default-project-role, sections 6-7) requires wildcard pattern support (`*` and scoped `deploy/*`) so that the auto-created default project role can use `tasks: ["*"]` and `skills: ["*"]` to include all discovered items, and users can narrow down with scoped patterns.

## What Changes

- New file: `packages/shared/src/role/wildcard.ts` — wildcard expansion module
  - `isWildcardPattern(name)` — returns true if name contains `*`
  - `validatePattern(name)` — rejects `**`, `?`, `[...]` with descriptive error
  - `matchWildcard(pattern, name)` — bare `*` matches all; scoped wildcards use single-segment matching
  - `expandTaskWildcards(tasks, discovered)` — expands wildcard TaskRef entries against discovered commands
  - `expandSkillWildcards(skills, discovered)` — expands wildcard SkillRef entries against discovered skills
- New file: `packages/shared/src/role/resolve-role-fields.ts` — integration point
  - `resolveRoleFields(role, projectDir)` — calls `scanProject()` then expands wildcards in tasks and skills
- New tests: `packages/shared/tests/role/wildcard.test.ts` — unit tests for wildcard matching and expansion
- New tests: `packages/shared/tests/role/resolve-role-fields.test.ts` — integration tests for the resolution pipeline step

## Capabilities

### New Capabilities
- `wildcard-expansion`: Wildcard pattern matching and expansion for tasks and skills arrays in ROLE.md
- `resolve-role-fields`: Integration step that connects wildcard expansion with project scanning

## Impact

- **New**: `packages/shared/src/role/wildcard.ts` — core wildcard logic
- **New**: `packages/shared/src/role/resolve-role-fields.ts` — resolution pipeline step
- **Modified**: `packages/shared/src/role/index.ts` — export new modules
- **New tests**: `packages/shared/tests/role/wildcard.test.ts` — 10 test cases (PRD tests 12-20, 23)
- **New tests**: `packages/shared/tests/role/resolve-role-fields.test.ts` — 3 test cases (PRD tests 21-23)
- **No schema changes**: The Zod `roleSchema` is unchanged
- **No parser changes**: Wildcards are resolved after parsing, before materialization
