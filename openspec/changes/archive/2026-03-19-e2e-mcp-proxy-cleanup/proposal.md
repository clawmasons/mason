## Why

The e2e test suite has accumulated many test files that are broken, untested, and rely on a shared fixture (`test-chapter`) that is no longer maintained. We want to consolidate around a single well-functioning test (`mcp-proxy-agent.test.ts`) that validates the system end-to-end using CLI invocation and Docker inspection (`docker exec <container> ls`, `docker exec <container> cat`).

## What Changes

- **REMOVE**: All test files in `packages/tests/tests/` except `mcp-proxy-agent.test.ts` and `helpers.ts`
- **REMOVE**: `packages/tests/fixtures/test-chapter/` directory
- **REMOVE**: `packages/tests/scripts/` directory (`setup-chapter.ts`, `teardown-chapter.ts`)
- **FIX**: Make `mcp-proxy-agent.test.ts` pass by running it, evaluating errors, and fixing them iteratively

Files deleted:
- `tests/acp-client-spawn.test.ts`
- `tests/build-pipeline.test.ts`
- `tests/cross-agent-materialization.test.ts`
- `tests/docker-proxy.test.ts`
- `tests/error-paths.test.ts`
- `tests/mcp-proxy.test.ts`
- `tests/role-workflow.test.ts`
- `tests/test-note-taker-mcp.test.ts`
- `tests/volume-masking.test.ts`
- `fixtures/test-chapter/` (entire directory)
- `scripts/` (entire directory)

Files kept:
- `tests/mcp-proxy-agent.test.ts` — the one test to fix and maintain
- `tests/helpers.ts` — shared utilities used by the remaining test
- `fixtures/claude-test-project/` — fixture used by `mcp-proxy-agent.test.ts`

## Capabilities

### New Capabilities
- `mcp-proxy-agent-e2e`: A single passing e2e test that validates the full agent↔proxy pipeline by spawning `mason run` via CLI and verifying behavior through stdout and `docker exec` inspection

### Modified Capabilities
<!-- none -->

## Impact

- `packages/tests/tests/` — 9 test files removed
- `packages/tests/fixtures/test-chapter/` — deleted
- `packages/tests/scripts/` — deleted
- `mcp-proxy-agent.test.ts` — fixed and passing
- No other packages affected
