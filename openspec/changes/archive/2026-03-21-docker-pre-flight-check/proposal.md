## Why

The `checkDockerCompose()` pre-flight check is currently called inside each mode function (`runAgentInteractiveMode`, `runAgentDevContainerMode`, `runProxyOnly`), and ACP mode (`runAgentAcpMode`) skips it entirely. This means:

1. Docker availability is checked **after** role resolution, alias resolution, and agent type resolution have already completed — wasting the user's time when Docker isn't installed.
2. ACP mode never checks Docker at all, leading to cryptic failures deep in the Docker orchestration layer.
3. The check is duplicated across three mode functions, violating DRY.

Moving the check to the `runAgent()` orchestrator (called by `createRunAction()`) ensures it runs once, immediately, regardless of mode — including ACP.

## What Changes

- `packages/cli/src/cli/commands/run-agent.ts`:
  - Add `checkDockerCompose()` call at the top of `runAgent()`, before the mode dispatch — making it the very first operation after registry init.
  - Remove the duplicate `checkDockerCompose()` calls from `runAgentInteractiveMode()`, `runAgentDevContainerMode()`, `runProxyOnly()`, and the unused one in `runAgentAcpMode()`.
  - Remove the `checkDockerComposeFn` resolution (`const checkDocker = deps?.checkDockerComposeFn ?? checkDockerCompose`) from each mode function since it's no longer needed there.

- `packages/cli/src/cli/commands/docker-utils.ts`:
  - Update the `checkDockerCompose()` error message to include installation links per PRD Section 5.3.

- `packages/cli/tests/cli/run-agent.test.ts`:
  - Update the existing "exits 1 when docker compose is not available" test to verify the check happens before role resolution (the error should not contain role-resolution artifacts).
  - Add a test verifying ACP mode also fails fast when Docker is unavailable.

## Capabilities

### Modified Capabilities
- `run-command`: Docker pre-flight check hoisted to `runAgent()` orchestrator. All modes (interactive, dev-container, ACP, proxy-only) now fail fast before any role resolution.

## Impact

- Modified file: `packages/cli/src/cli/commands/run-agent.ts` (hoist check, remove duplicates)
- Modified file: `packages/cli/tests/cli/run-agent.test.ts` (update/add docker check tests)
- No new files, no breaking changes to public API
- `RunAgentDeps.checkDockerComposeFn` remains in the interface — it's now consumed in `runAgent()` instead of in individual mode functions
