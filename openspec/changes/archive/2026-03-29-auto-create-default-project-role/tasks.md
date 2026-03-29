## Tasks

- [x] Add `createDefaultProjectRole(projectDir, dialectDir)` function to `run-agent.ts`
- [x] Add `loadAndResolveProjectRole(projectDir, sourceOverride?)` function to `run-agent.ts`
- [x] Add imports for `readMaterializedRole` and `resolveRoleFields` to `run-agent.ts`
- [x] Replace `generateProjectRole()` call at lines ~1316-1338 with three-way branch
- [x] Create `packages/cli/tests/cli/default-project-role.test.ts` with all test cases
- [x] Run `npx tsc --noEmit` — verify no type errors
- [x] Run `npx eslint src/ tests/` in cli package — verify no lint errors
- [x] Run `npx vitest run packages/cli/tests/` ��� verify all tests pass (734 tests, 45 files)
- [x] Run `npx vitest run packages/shared/tests/` — verify no regressions (350 tests, 18 files)
