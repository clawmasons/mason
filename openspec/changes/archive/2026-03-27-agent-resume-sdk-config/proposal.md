## Why

The `AgentPackage` interface has no way for agents to declare how they support session resumption. Each agent may use a different CLI flag (e.g., `--resume`, `--continue`, `--session`) and reference a different field in `meta.json` for the session ID. Without a declarative config, the CLI would need agent-specific hardcoding to inject resume arguments into `agent-launch.json`.

Additionally, `generateAgentLaunchJson()` has no mechanism to append resume-specific arguments. When resuming a session, the CLI needs to inject `[flag, resumeId]` into the args array based on the agent's declared resume config.

## What Changes

- Add an optional `resume` field to the `AgentPackage` interface in `packages/agent-sdk/src/types.ts`:
  - `flag: string` -- the CLI argument flag for resuming (e.g., `"--resume"`)
  - `sessionIdField: string` -- the `meta.json` field containing the agent's session ID (e.g., `"agentSessionId"`)
- Update `generateAgentLaunchJson()` in `packages/agent-sdk/src/helpers.ts` to accept an optional `resumeId` parameter:
  - When `resumeId` is provided and the agent package has a `resume` config, append `[resume.flag, resumeId]` to the args array
  - When `resumeId` is provided but the agent has no `resume` config, ignore it silently
  - When `resumeId` is not provided, behavior is unchanged (backward compatible)

## Capabilities

### New Capabilities

- Agent packages can declare resume support via `resume: { flag, sessionIdField }` on `AgentPackage`
- `generateAgentLaunchJson()` can inject resume arguments into the launch config

### Modified Capabilities

- `generateAgentLaunchJson()` signature gains an optional `resumeId` parameter (9th positional argument)

## Impact

- **Code**: `packages/agent-sdk/src/types.ts` (type addition), `packages/agent-sdk/src/helpers.ts` (function signature + logic)
- **Dependencies**: None new -- purely additive to existing interfaces
- **Testing**: New unit tests in `packages/agent-sdk/tests/helpers.test.ts` covering (a) resumeId with resume config appends flag+id, (b) resumeId without resume config is ignored, (c) no resumeId produces same output as before, (d) TypeScript compiles with new field
- **Compatibility**: Fully backward compatible -- `resume` is optional on `AgentPackage`, `resumeId` is optional on `generateAgentLaunchJson()`
