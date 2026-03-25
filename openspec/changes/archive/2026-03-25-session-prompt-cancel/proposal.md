## Why

After implementing the `mason acp` command (Change 3) and `session/new` handler (Change 4), the ACP agent can negotiate capabilities and create sessions, but cannot actually process user prompts. The `prompt` and `cancel` handlers are still stubs that throw `MethodNotFound`. This change makes the ACP agent functional by implementing prompt execution and cancellation -- the core value proposition of the ACP integration.

The prompt handler delegates to `mason run` as a subprocess (rather than calling `runAgentPrintMode()` in-process) to avoid `process.exit()` issues in the agent's print mode and to enable clean cancellation via process signals.

## What Changes

- **Modify:** `packages/cli/src/acp/acp-agent.ts` -- Replace the stub `prompt` and `cancel` handlers with real implementations. The `prompt` handler looks up session state, extracts text from `ContentBlock[]`, delegates to `executePrompt()`, sends `agent_message_chunk` via `conn.sessionUpdate()`, updates `meta.json`, sends `session_info_update`, and returns `{ stopReason: "end_turn" }`. The `cancel` handler calls `abortController.abort()` on the session's active abort controller.

- **New file:** `packages/cli/src/acp/prompt-executor.ts` -- Subprocess execution wrapper. Exports `executePrompt({ agent, role, text, cwd, signal })` that spawns `mason run --agent {agent} --role {role} -p {text}` using `node:child_process.execFile`, collects stdout, and returns the result. Supports cancellation via `AbortSignal`.

- **New test:** `packages/cli/tests/acp/prompt.test.ts` -- Unit tests with mocked subprocess verifying: text extraction from ContentBlock[], subprocess spawned with correct args/cwd, `agent_message_chunk` sent with output, `PromptResponse` has `stopReason: "end_turn"`, cancel aborts subprocess and returns `"cancelled"`, `meta.json` updated with firstPrompt and lastUpdated, `session_info_update` sent.

## Capabilities

### New Capabilities
- `acp-prompt`: Process user prompts via `session/prompt`, delegating to `mason run --print` subprocess and returning results as `agent_message_chunk` updates.
- `acp-cancel`: Cancel in-progress prompts via `session/cancel`, killing the subprocess and returning `stopReason: "cancelled"`.

## Impact

- **New files:** 1 source file (`prompt-executor.ts`), 1 test file (`prompt.test.ts`)
- **Modified files:** `packages/cli/src/acp/acp-agent.ts` -- prompt and cancel handler implementations (~60 lines added)
- **No removed files**
- **No behavioral changes** to existing commands
- **Dependencies:** Uses `node:child_process` for subprocess spawning (Node.js built-in, no new npm dependencies)
