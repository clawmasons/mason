## Why

`run-agent.ts` exports three deprecated functions that are unused in the active source tree, adding noise and confusion. `chapter build` is the only CLI command with no unit tests, despite generating critical Docker artifacts — a gap that should be closed.

## What Changes

- Remove `registerRunAgentCommand` (thin wrapper, calls `registerRunCommand`)
- Remove `registerRunAcpAgentCommand` (no-op kept for backward compat)
- Remove `runAcpAgent` (ACP wrapper, superseded by `runAgent` with `acpOptions`)
- Remove `RunAcpAgentOptions` interface (only used by `runAcpAgent`)
- Add unit test file `packages/cli/tests/cli/build.test.ts` covering `runBuild`

## Capabilities

### New Capabilities
- `build-command-tests`: Unit tests for the `chapter build` CLI command covering role discovery, filtering, validation, and Docker artifact generation

### Modified Capabilities
<!-- No spec-level requirement changes — this is a code quality change -->

## Impact

- `packages/cli/src/cli/commands/run-agent.ts`: Remove ~30 lines of deprecated exports
- `packages/cli/tests/cli/build.test.ts`: New file (~150 lines)
- No public API changes — deprecated exports have no callers in the active source tree
