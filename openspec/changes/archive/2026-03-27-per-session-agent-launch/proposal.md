## Why

Currently, `agent-launch.json` is generated into the shared build directory at `.mason/docker/<role>/<agent>/workspace/agent-launch.json`. This file is shared across all sessions for the same role/agent combination, which means per-session customization (like injecting `--resume` args) is impossible. Additionally, the session directory is not mounted into the container, so agents cannot access `meta.json` or other session-specific state at runtime.

This change moves `agent-launch.json` to the per-session directory and mounts that directory into the container, enabling per-session launch customization and giving agents access to session metadata.

## What Changes

Three coordinated changes across three packages:

1. **`packages/cli/src/cli/commands/run-agent.ts`** -- Update `refreshAgentLaunchJson()` to write `agent-launch.json` to `.mason/sessions/{id}/` instead of `.mason/docker/{role}/{agent}/workspace/`. The function signature changes to accept `sessionDir` instead of `dockerBuildDir`.

2. **`packages/cli/src/materializer/docker-generator.ts`** -- Update `generateSessionComposeYml()` to add a bind mount from `.mason/sessions/{id}/` to `/home/mason/.mason/session/` (rw). The `SessionComposeOptions` interface gains a new `sessionMountEnabled` flag (defaulting to true for new sessions).

3. **`packages/agent-entry/src/index.ts`** -- Update `loadLaunchConfig()` to check `/home/mason/.mason/session/agent-launch.json` first (new primary path), falling back to `/home/mason/workspace/agent-launch.json` and then CWD for backward compatibility.

## Capabilities

### New Capabilities

- Per-session `agent-launch.json` in `.mason/sessions/{id}/`
- Session directory mounted into container at `/home/mason/.mason/session/`
- `agent-entry` loads launch config from session mount path first

### Modified Capabilities

- `refreshAgentLaunchJson()` writes to session dir instead of build dir
- `generateSessionComposeYml()` includes session directory mount
- `loadLaunchConfig()` has updated search path order

## Impact

- **Code**: `run-agent.ts` (launch json target), `docker-generator.ts` (compose generation), `agent-entry/index.ts` (config loading)
- **Dependencies**: No new dependencies
- **Testing**: New unit tests for session mount in compose output, updated agent-entry tests for search path order, updated run-agent tests for session dir write target
- **Compatibility**: Backward compatible -- agent-entry falls back to legacy path when session mount is not present
