## 1. Adapter — Scope Extraction

- [x] 1.1 Update `adaptTask()` in `packages/shared/src/role/adapter.ts` to split task name on last `:` into `scope` and `name` fields
- [x] 1.2 Add unit tests for `adaptTask()` scope extraction: scoped (`opsx:apply`), deeply nested (`ops:triage:label`), and unscoped (`doc-cleanup`)

## 2. Core — readTask (singular)

- [x] 2.1 Add `readTask(config, projectDir, name, scope)` function to `packages/agent-sdk/src/helpers.ts` that constructs file path via `resolveNameFormat()` and reads a single file
- [x] 2.2 Export `readTask` from `packages/agent-sdk/src/helpers.ts`
- [x] 2.3 Add unit tests for `readTask`: path format scoped, kebab format scoped, unscoped, deeply nested scope, nonexistent file returns undefined

## 3. Materializer — Targeted Resolution

- [x] 3.1 Update `resolveTaskContent()` in `packages/cli/src/materializer/role-materializer.ts` to call `readTask()` per task instead of bulk `readTasks()` + map lookup
- [x] 3.2 Verify existing materializer tests pass with the new resolution path

## 4. ROLE.md — Syntax Update

- [x] 4.1 Update `.mason/roles/lead/ROLE.md` task references from `/` to `:` syntax (e.g., `opsx/apply` → `opsx:apply`)
- [x] 4.2 Update `.mason/roles/developer/ROLE.md` task references from `/` to `:` syntax
- [x] 4.3 Update any other ROLE.md files in the repo that reference scoped tasks

## 5. Tests — Existing Test Updates

- [x] 5.1 Update `packages/agent-sdk/tests/tasks.test.ts` to cover the new `readTask()` function
- [x] 5.2 Run `npx vitest run packages/agent-sdk/tests/` and verify all tests pass
- [x] 5.3 Run `npx vitest run packages/shared/tests/` and verify all tests pass
- [x] 5.4 Run `npx vitest run packages/cli/tests/` and verify all tests pass

## 6. Verification

- [x] 6.1 Run `npx tsc --noEmit` to verify no type errors
- [x] 6.2 Run `npx eslint src/ tests/` to verify no lint errors
