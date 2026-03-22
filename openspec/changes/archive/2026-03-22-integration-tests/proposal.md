## Why

Changes 1-5 of the project-role PRD added Docker pre-flight checks, implied agent aliases, `--source` flag parsing, agent-aware scanning, and in-memory project role generation. Each change included unit tests for its own functions, but there are no integration-level tests that verify these features work together end-to-end — specifically the full flow from CLI invocation through scanner to generated Role object.

Additionally, the e2e test suite (`packages/tests/`) has no coverage for the project role feature at all. Without integration and e2e tests, regressions in the feature's cross-cutting behavior (multi-source merge, source override with explicit roles, error paths) would go undetected.

## What Changes

- `packages/shared/tests/mason-scanner.test.ts`:
  No new tests needed. Existing tests already cover dialect filtering, agent-config-aware directory resolution, kebab-case flat scanning, fallback behavior, and MCP server discovery. The scanner test file has comprehensive coverage from Change 4.

- `packages/cli/tests/cli/run-agent.test.ts`:
  No new tests needed. Existing tests already cover `normalizeSourceFlags()` (all input formats, error cases), `generateProjectRole()` (single source, multi-source dedup, missing dir error, empty dir warning, .env handling, metadata, SSE transport), source override with `--role`, and the `--source` flag registration. These were added in Changes 3 and 5.

- `packages/tests/tests/project-role.test.ts` (NEW):
  Add e2e tests for the full project role flow using CLI command execution (no mocks). Tests create temp workspace directories with agent config files and invoke `mason run` via the CLI. Scenarios:
  1. Zero-config session: project with `.claude/commands/` + `.claude/settings.json` triggers project role generation
  2. Cross-source: `--source claude` with a codex agent type
  3. Multi-source merge: `--source claude --source codex` with first-wins dedup
  4. Docker check: verify early failure when Docker is unavailable
  5. Implied alias: `mason codex` without alias config routes correctly
  6. Source override with role: `--role developer --source codex` overrides role sources
  7. Error cases: missing source directory, invalid `--source` value, empty source directory

## Capabilities

### New Capabilities
- `project-role-e2e-tests`: End-to-end test coverage for the project role feature, validating CLI behavior with real file system operations and mason CLI invocations.

### Modified Capabilities
- None — existing unit tests are already comprehensive; this change only adds e2e tests.

## Impact

- New file: `packages/tests/tests/project-role.test.ts` (e2e tests)
- New fixture: `packages/tests/fixtures/project-role/` (minimal project fixture for e2e tests)
- No production code changes
- No changes to existing unit tests
