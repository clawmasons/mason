## Why

`mason run` has no way to pass an initial prompt to the agent — the first thing the agent sees is an empty session. Both `claude` and `pi` support positional args as an initial message (`claude "do the thing"`, `pi "do the thing"`), but mason has no mechanism to thread a prompt through to the agent launch. This blocks `mason configure` from giving the agent a concrete starting task.

## What Changes

- **`mason run`** accepts additional positional arguments (after the agent, or standalone) as an initial prompt string passed to the agent at launch
- **`generateAgentLaunchJson`** in `agent-sdk` gains an optional `initialPrompt?: string` parameter; when set it appends the prompt as the final positional arg in `agent-launch.json`'s `args` array
- **pi-coding-agent materializer** forwards `initialPrompt` to `generateAgentLaunchJson` (currently passes `undefined`)
- **claude-code-agent materializer** forwards `initialPrompt` to `generateAgentLaunchJson` (currently only passes role instructions as `--append-system-prompt`)
- **`mason configure`** hardcodes the initial prompt `"create and implement role plan"` — equivalent to `mason run --agent {agent} --role @clawmasons/role-configure-project "create and implement role plan"`

## Capabilities

### New Capabilities
- `run-command-initial-prompt`: CLI positional args (without `--` prefix) become the initial prompt forwarded to the agent at launch

### Modified Capabilities
- `configure-command`: adds a hardcoded initial prompt `"create and implement role plan"` to the underlying run invocation
- `agent-sdk`: `generateAgentLaunchJson` gains `initialPrompt?: string` — appended as final positional arg in generated `args` array
- `pi-coding-agent`: materializer passes `initialPrompt` through to `generateAgentLaunchJson`
- `claude-code-agent`: materializer passes `initialPrompt` through to `generateAgentLaunchJson`

## Impact

- `packages/cli/src/cli/commands/run-agent.ts` — run and configure command registration + action
- `packages/agent-sdk/src/helpers.ts` — `generateAgentLaunchJson` signature and implementation
- `packages/agent-sdk/src/types.ts` — possibly `AgentLaunchConfig` or related types
- `packages/pi-coding-agent/src/materializer.ts` — forward initialPrompt
- `packages/claude-code-agent/src/materializer.ts` — forward initialPrompt
- `packages/agent-sdk/tests/helpers.test.ts` — new test cases for initialPrompt
- `packages/pi-coding-agent/tests/materializer.test.ts` — new test cases
- No external API or dependency changes; no breaking changes to existing `mason run` invocations (positional prompt is additive)
