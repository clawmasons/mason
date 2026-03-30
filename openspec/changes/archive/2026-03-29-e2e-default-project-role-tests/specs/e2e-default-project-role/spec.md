# Spec: E2E Default Project Role Tests

## Overview

E2E tests validating the full default-project-role lifecycle through the CLI binary. Extends `packages/cli/tests/e2e/project-role.test.ts` with 9 new test scenarios.

## Test Scenarios

| # | Scenario | Verifies | PRD Ref |
|---|----------|----------|---------|
| 1 | Auto-creation | ROLE.md created with correct template (sources, tasks: ["*"], skills: ["*"]) | PRD 4.2 |
| 2 | Reuse | Existing ROLE.md not overwritten on second run | PRD 4.1 |
| 3 | Wildcard all | Auto-created file contains tasks: ["*"] | PRD 7.1 |
| 4 | Scoped wildcard | tasks: ["deploy/*"] accepted without error | PRD 7.1 |
| 5 | Explicit restriction | tasks: ["review"] accepted without error | PRD 6.1 |
| 6 | Alias | commands: ["*"] works in mason dialect | PRD 5.1 |
| 7 | Role includes | role.includes: ["base-role"] merges correctly | PRD 8.1 |
| 8 | Circular include | Error with cycle chain reported | PRD 8.5 |
| 9 | Write failure fallback | Read-only dir produces fallback warning | PRD 4.2, UC-7 |

## Files Modified

- `packages/cli/tests/e2e/project-role.test.ts` -- added 9 new E2E test scenarios in `default-project-role` describe block
- Updated pre-existing "missing source directory" test to reflect auto-creation behavior change

## Fixtures Added

- `packages/cli/tests/e2e/fixtures/project-role/.claude/commands/deploy/staging.md`
- `packages/cli/tests/e2e/fixtures/project-role/.claude/commands/deploy/production.md`
- `packages/cli/tests/e2e/fixtures/project-role/.mason/roles/base-role/ROLE.md`

## Test Results

- All 18 E2E tests pass (9 existing + 9 new)
- All 734 CLI unit tests pass
- All 350 shared unit tests pass
- Lint passes
