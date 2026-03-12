# Tasks: Materializer Refactor — Accept RoleType Input

## Implementation Tasks

- [x] Create `packages/cli/src/materializer/role-materializer.ts` with materializer registry and `materializeForAgent()` function
- [x] Update `packages/cli/src/materializer/index.ts` to export new function and registry utilities
- [x] Create `packages/cli/tests/materializer/role-materializer.test.ts` with comprehensive tests (23 tests)
- [x] Verify `npx tsc --noEmit` compiles
- [x] Verify `npx vitest run` passes (1273 tests, 66 files)
