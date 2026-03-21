## 1. Adapter — Normalize `/` to `:`

- [x] 1.1 Update `adaptTask()` in `packages/shared/src/role/adapter.ts` to normalize `/` to `:` before splitting on last `:`
- [x] 1.2 Add unit tests for `/`-delimited task references: `opsx/apply`, `ops/triage/label`, mixed `ops/triage:label`

## 2. Mason Config — Switch to Path Format

- [x] 2.1 Update `MASON_TASK_CONFIG` in `packages/cli/src/materializer/role-materializer.ts`: change `scopeFormat` to `"path"` and `nameFormat` to `"{scopePath}/{taskName}.md"`
- [x] 2.2 Update `allFieldsConfig` test fixture in `packages/agent-sdk/tests/tasks.test.ts` to use path format

## 3. Verification

- [x] 3.1 Run `npx vitest run packages/shared/tests/` and verify all tests pass
- [x] 3.2 Run `npx vitest run packages/agent-sdk/tests/` and verify all tests pass
- [x] 3.3 Run `npx vitest run packages/cli/tests/` and verify all tests pass
- [x] 3.4 Run `npx tsc --noEmit` to verify no type errors
