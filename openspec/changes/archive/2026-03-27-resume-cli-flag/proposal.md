## Why

The `mason run` command can only start fresh sessions. There is no way to resume a previous session from the CLI. Users who want to continue a prior conversation (e.g., "now add tests for that") must re-explain all context from scratch. The session infrastructure (meta.json, latest symlink, agentSessionId capture, agent resume SDK config) is now in place from Changes 1-5, but there is no CLI entry point to use it.

## What Changes

- Register `--resume [session-id]` as an optional option on the `mason run` command in `registerRunCommand()`.
- In `createRunAction()`, when `--resume` is present:
  1. Resolve session ID: if omitted or "latest", call `resolveLatestSession()`; otherwise use the provided ID.
  2. Load `meta.json` via `readSession()`.
  3. Validate: session exists, session not closed, Docker image exists (via `docker image inspect`).
  4. Warn (to stderr) if `--agent` or `--role` were also provided -- these are ignored during resume.
  5. Extract `agent` and `role` from `meta.json`.
  6. Read `agentSessionId` from `meta.json` and look up `resume` config on the agent's `AgentPackage`.
  7. Generate `agent-launch.json` with resume args into the session directory via `refreshAgentLaunchJson()`.
  8. Launch Docker compose from the existing session directory (reusing compose file, skipping Docker build).
- When session is not found, list available sessions with agent, role, first prompt, and relative time.

## Capabilities

### New Capabilities

- `mason run --resume` resumes the latest session
- `mason run --resume <id>` resumes a specific session
- `mason run --resume latest` is equivalent to `--resume` with no ID
- Session-not-found error includes a listing of available sessions
- Validation errors for closed sessions and missing Docker images

### Modified Capabilities

- `registerRunCommand()` gains the `--resume` option
- `createRunAction()` gains resume flow logic that short-circuits the normal agent/role resolution path
- `refreshAgentLaunchJson()` gains a `resumeId` option to inject resume args

## Impact

- **Code**: `packages/cli/src/cli/commands/run-agent.ts` (command registration + action handler + refreshAgentLaunchJson)
- **Dependencies**: Uses existing `readSession`, `resolveLatestSession`, `listSessions` from `@clawmasons/shared`, and `getAgentFromRegistry` from materializer
- **Testing**: New unit tests in `packages/cli/tests/cli/run-agent.test.ts` covering all 10 testable outputs from the IMPLEMENTATION.md
- **Compatibility**: Fully backward compatible -- `--resume` is optional and all existing flags work as before
