## Tasks

- [x] Add `roleConfigSchema` to `packages/shared/src/schemas/role-types.ts` and add `role` field to `roleSchema`
- [x] Add `RoleConfig` type to `packages/shared/src/types/role.ts`
- [x] Modify `packages/shared/src/role/parser.ts` to extract `frontmatter.role` and include in roleData
- [x] Create `packages/shared/src/role/merge.ts` with `mergeRoles` function
- [x] Create `packages/shared/src/role/includes.ts` with `resolveIncludes` and `RoleIncludeError`
- [x] Modify `packages/shared/src/role/resolve-role-fields.ts` to call `resolveIncludes` after wildcard expansion
- [x] Update `packages/shared/src/role/index.ts` to export new modules
- [x] Update `packages/shared/src/index.ts` to re-export new items
- [x] Create `packages/shared/tests/role/merge.test.ts` with merge unit tests (PRD tests 1-7)
- [x] Create `packages/shared/tests/role/includes.test.ts` with include resolution tests (PRD tests 8-11)
- [x] Run `npx tsc --noEmit` — verify no type errors
- [x] Run `npx eslint src/ tests/` in shared package — verify no lint errors
- [x] Run `npx vitest run packages/shared/tests/` — verify all tests pass
- [x] Run `npx vitest run packages/cli/tests/` — verify no regressions
