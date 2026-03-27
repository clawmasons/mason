## 1. SDK Type Changes

- [x] 1.1 Widen `parseJsonStreamAsACP` return type in `AgentPackage.jsonMode` from `AcpSessionUpdate | null` to `AcpSessionUpdate | AcpSessionUpdate[] | null` in `packages/agent-sdk/src/types.ts`

## 2. CLI Array Normalization

- [x] 2.1 Update `run-agent.ts` to normalize `parseJsonStreamAsACP` results — if array, emit each element as a separate NDJSON line; if single object, emit as-is; if null, skip

## 3. Claude Code Agent Parser

- [x] 3.1 Add `parseJsonStreamAsACP` function to `claude-code-agent/src/index.ts` mapping Claude `assistant` text blocks to `agent_message_chunk` updates
- [x] 3.2 Map Claude `assistant` tool_use blocks to `tool_call` updates with `kind: "other"` and `status: "in_progress"`
- [x] 3.3 Map Claude `user` tool_result blocks to `tool_call_update` updates with content normalization (string/array/null)
- [x] 3.4 Map Claude `result` events to `agent_message_chunk` updates, skipping errors and null results
- [x] 3.5 Handle multi-block assistant events by returning arrays of ACP updates
- [x] 3.6 Return null for `system` events and invalid JSON

## 4. Claude Code Agent Package Declaration

- [x] 4.1 Add `jsonMode` property to the `claudeCodeAgent` AgentPackage with `jsonStreamArgs`, `buildPromptArgs`, and `parseJsonStreamAsACP`

## 5. Materializer Changes

- [x] 5.1 Update `materializeWorkspace` in `claude-code-agent/src/materializer.ts` to pass `options?.jsonMode` to `generateAgentLaunchJson`
- [x] 5.2 Update `materializeSupervisor` in `claude-code-agent/src/materializer.ts` to pass `options?.jsonMode` to `generateAgentLaunchJson`

## 6. Verification

- [x] 6.1 Run TypeScript compilation (`npx tsc --noEmit`) to verify no type errors
- [x] 6.2 Run linter (`npx eslint src/ tests/`) on affected packages
- [x] 6.3 Run unit tests for agent-sdk, cli, and claude-code-agent packages
