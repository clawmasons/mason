## Why

ROLE.md files are self-contained — there is no mechanism to include a base role and layer project-specific overrides on top. Users who want a shared starting point (e.g., `@clawmasons/role-configure-project`) must copy its content rather than composing with it. The PRD (default-project-role, section 8) requires a `role.includes` field that lets a ROLE.md reference other roles, which are resolved recursively and merged additively with "current role wins" semantics.

## What Changes

- Modify: `packages/shared/src/schemas/role-types.ts` — add `role` section with `includes` array to `roleSchema`
- Modify: `packages/shared/src/types/role.ts` — type auto-derived from schema (add `RoleConfig` type export)
- Modify: `packages/shared/src/role/parser.ts` — extract `frontmatter.role` and pass to schema
- New file: `packages/shared/src/role/merge.ts` — `mergeRoles(current, included)` with additive merge semantics per PRD Appendix B
- New file: `packages/shared/src/role/includes.ts` — `resolveIncludes(role, projectDir, visited?, depth?)` with circular detection and depth limiting
- Modify: `packages/shared/src/role/resolve-role-fields.ts` — integrate include resolution after wildcard expansion
- Modify: `packages/shared/src/role/index.ts` — export new modules
- New tests: `packages/shared/tests/role/merge.test.ts` — merge semantics unit tests (PRD tests 1-7)
- New tests: `packages/shared/tests/role/includes.test.ts` — include resolution unit tests (PRD tests 8-11)

## Capabilities

### New Capabilities
- `role-merge`: Additive role merging with dedup by identity key, scalar current-wins, instructions append
- `role-includes`: Recursive role inclusion with circular detection, depth limiting, and integration with wildcard expansion

## Impact

- **Modified**: `packages/shared/src/schemas/role-types.ts` — add `role` section to `roleSchema`
- **Modified**: `packages/shared/src/types/role.ts` — add `RoleConfig` type
- **Modified**: `packages/shared/src/role/parser.ts` — extract `frontmatter.role` field
- **New**: `packages/shared/src/role/merge.ts` — role merge logic
- **New**: `packages/shared/src/role/includes.ts` — include resolution with circular/depth protection
- **Modified**: `packages/shared/src/role/resolve-role-fields.ts` — call `resolveIncludes` after wildcard expansion
- **Modified**: `packages/shared/src/role/index.ts` — new exports
- **New tests**: `packages/shared/tests/role/merge.test.ts` — 7 test cases (PRD tests 1-7)
- **New tests**: `packages/shared/tests/role/includes.test.ts` — 4 test cases (PRD tests 8-11)
- **Schema change**: `roleSchema` gains optional `role.includes` field with empty default — backward compatible
