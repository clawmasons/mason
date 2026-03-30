## 1. Add Alias Logic to normalizeTasks()

- [x] 1.1 Add `TASK_FIELD_ALIASES` constant mapping `tasks` <-> `commands`
- [x] 1.2 Extract array normalization into `normalizeTasksArray()` helper
- [x] 1.3 Add alias fallback: when primary field is not found, check alias field
- [x] 1.4 Add warning when both primary and alias fields are present

## 2. Add Unit Tests

- [x] 2.1 Test: mason dialect ROLE.md with `commands:` field is parsed correctly via alias (PRD test 24)
- [x] 2.2 Test: mason dialect ROLE.md with both `tasks:` and `commands:` — primary wins, warning emitted (PRD test 25)
- [x] 2.3 Test: mason dialect ROLE.md with `tasks:` field works as before — regression guard (PRD test 26)
- [x] 2.4 Test: Claude dialect ROLE.md with `tasks:` field is parsed correctly via alias (symmetric)

## 3. Verification

- [x] 3.1 Run `npx tsc --noEmit` — no type errors
- [x] 3.2 Run `npx eslint src/ tests/` — no lint errors
- [x] 3.3 Run `npx vitest run packages/shared/tests/` — all tests pass
- [x] 3.4 Run `npx vitest run packages/cli/tests/` — all tests pass
