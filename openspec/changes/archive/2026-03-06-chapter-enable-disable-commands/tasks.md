# Tasks: `chapter enable` / `chapter disable` Commands

## Implementation Tasks

- [ ] **Task 1:** Create `src/cli/commands/enable.ts` with `registerEnableCommand()` and `runEnable()`
- [ ] **Task 2:** Create `src/cli/commands/disable.ts` with `registerDisableCommand()` and `runDisable()`
- [ ] **Task 3:** Register both commands in `src/cli/commands/index.ts`
- [ ] **Task 4:** Add disabled member guard to `src/cli/commands/run.ts`
- [ ] **Task 5:** Create `tests/cli/enable.test.ts` with unit tests
- [ ] **Task 6:** Create `tests/cli/disable.test.ts` with unit tests
- [ ] **Task 7:** Add disabled member tests to `tests/cli/run.test.ts`

## Verification Tasks

- [ ] **Task 8:** `npx tsc --noEmit` compiles without errors
- [ ] **Task 9:** `npx eslint src/ tests/` passes without errors
- [ ] **Task 10:** `npx vitest run` -- all tests pass (including new tests)

## Spec Tasks

- [ ] **Task 11:** Create new spec `openspec/specs/enable-disable-commands/spec.md`
- [ ] **Task 12:** Update `openspec/specs/run-command/spec.md` with disabled member rejection requirement
- [ ] **Task 13:** Update `openspec/specs/cli-framework/spec.md` with enable/disable command registration
