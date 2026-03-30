## Why

The default-project-role feature (PRD changes 1-4) introduced auto-creation of `.mason/roles/project/ROLE.md`, wildcard expansion, role composition via `role.includes`, and `tasks`/`commands` aliasing. While each change has unit tests, the full lifecycle has not been validated end-to-end through the CLI. E2E tests are needed to ensure the entire pipeline works when invoked via the `mason` binary: auto-creation, reuse, wildcard expansion (bare and scoped), explicit restrictions, aliasing, role includes, circular detection, and write-failure fallback.

## What Changes

- Extend `packages/cli/tests/e2e/project-role.test.ts` with new test scenarios covering the default-project-role lifecycle
- Add fixture content: scoped tasks (`deploy/staging.md`, `deploy/production.md`) to the existing `project-role` fixture
- Test scenarios exercise the CLI binary directly via `masonExecExpectError` and verify file artifacts and stdout/stderr output
- No production code changes — this is a test-only change

## Capabilities

### Modified Capabilities
- `project-role-e2e-tests`: The E2E test suite for project role gains 9 new test scenarios covering auto-creation, reuse, wildcards, aliasing, includes, circular detection, and write-failure fallback

## Impact

- **Extended**: `packages/cli/tests/e2e/project-role.test.ts` — 9 new E2E test scenarios
- **New fixtures**: `packages/cli/tests/e2e/fixtures/project-role/.claude/commands/deploy/staging.md`, `deploy/production.md`
- **New fixtures**: `packages/cli/tests/e2e/fixtures/project-role/.mason/roles/base-role/ROLE.md` (for includes test)
- **No production code changes**
