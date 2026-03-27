## Why

The claude-code-agent extension is missing `jsonMode` support, which was planned in the ACP streaming PRD (CHANGE 2, PR #239) but is not present in the current codebase. The codex-agent already has a working `jsonMode` implementation. Without this, the claude-code-agent cannot stream ACP session updates (tool calls, thoughts, messages) to the editor/CLI in real-time via `mason run --json`.

## What Changes

- Add `jsonMode` configuration to the claude-code-agent's `AgentPackage` definition in `../mason-extensions/agents/claude-code-agent/src/index.ts`
  - `jsonStreamArgs`: `["--output-format", "stream-json", "--verbose"]` (same as existing `printMode`)
  - `buildPromptArgs`: `(prompt) => ["-p", prompt]`
  - `parseJsonStreamAsACP`: Parser mapping Claude's stream-json events to ACP session updates
- Update materializer functions (`materializeWorkspace`, `materializeSupervisor`) to pass `options?.jsonMode` to `generateAgentLaunchJson`
- Map Claude's native JSON event types to ACP:
  - `assistant` + text block → `agent_message_chunk`
  - `assistant` + `tool_use` block → `tool_call`
  - `user` event with `tool_result` content blocks → `tool_call_update` (keyed by `tool_use_id`)
  - `result` event → final `agent_message_chunk`
- Widen `parseJsonStreamAsACP` return type in agent-sdk from `AcpSessionUpdate | null` to `AcpSessionUpdate | AcpSessionUpdate[] | null` so a single line can produce multiple ACP updates (e.g., assistant events with mixed text + tool_use blocks)
- Update the CLI caller in `run-agent.ts` to normalize array results, emitting each update as a separate NDJSON line

## Capabilities

### New Capabilities

_(none — this adds jsonMode to an existing agent, not a new capability)_

### Modified Capabilities

- `claude-code-agent`: Add `jsonMode` property to the agent package definition with streaming JSON parser
- `claude-code-materializer`: Pass `jsonMode` option through to `generateAgentLaunchJson` in both workspace and supervisor materializers
- `agent-sdk`: Widen `parseJsonStreamAsACP` return type to accept arrays (backward-compatible)

## Impact

- **Code**: `../mason-extensions/agents/claude-code-agent/src/index.ts` (agent package), `../mason-extensions/agents/claude-code-agent/src/materializer.ts` (materializer), `packages/agent-sdk/src/types.ts` (return type), `packages/cli/src/cli/commands/run-agent.ts` (array normalization)
- **Dependencies**: Uses `AcpSessionUpdate` types from `@clawmasons/agent-sdk`; validated by `validateSessionUpdate()` using `@agentclientprotocol/sdk` Zod schemas
- **Testing**: Must pass ACP schema validation — the existing validator in `packages/cli/src/acp/validate-session-update.ts` will validate each emitted update at runtime
- **Compatibility**: No breaking changes — `jsonMode` is additive and optional
