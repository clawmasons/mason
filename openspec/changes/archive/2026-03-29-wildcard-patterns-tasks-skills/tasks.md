## Tasks

- [x] Create `packages/shared/src/role/wildcard.ts` with `isWildcardPattern`, `validatePattern`, `matchWildcard`, `expandTaskWildcards`, `expandSkillWildcards`, and `WildcardPatternError`
- [x] Create `packages/shared/src/role/resolve-role-fields.ts` with `resolveRoleFields`
- [x] Update `packages/shared/src/role/index.ts` to export new modules
- [x] Update `packages/shared/src/index.ts` if needed to re-export from role index
- [x] Create `packages/shared/tests/role/wildcard.test.ts` with all wildcard unit tests (PRD tests 12-20, 23)
- [x] Create `packages/shared/tests/role/resolve-role-fields.test.ts` with resolution pipeline tests
- [x] Run `npx tsc --noEmit` — verify no type errors
- [x] Run `npx eslint src/ tests/` in shared package — verify no lint errors
- [x] Run `npx vitest run packages/shared/tests/` — verify all tests pass
- [x] Run `npx vitest run packages/cli/tests/` — verify no regressions
