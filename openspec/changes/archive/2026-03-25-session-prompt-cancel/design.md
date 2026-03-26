## Design: `session/prompt` + Cancel Handlers

### Architecture

The prompt execution uses a subprocess model: each `session/prompt` call spawns `mason run --agent {agent} --role {role} -p {text}` as a child process. This design was chosen over calling `runAgentPrintMode()` in-process because:

1. The print mode implementation calls `process.exit()` after completion, which would kill the ACP server.
2. Subprocess isolation enables clean cancellation via process signals (`SIGTERM`).
3. Each prompt gets its own clean environment without shared state pollution.

### Components

#### `prompt-executor.ts` — Subprocess Wrapper

```typescript
interface ExecutePromptOptions {
  agent: string;
  role: string;
  text: string;
  cwd: string;
  signal?: AbortSignal;
}

interface ExecutePromptResult {
  output: string;
  cancelled: boolean;
}
```

- Uses `node:child_process.execFile` with `{ cwd, signal }` options
- Resolves the `mason` binary path via the same `node_modules/.bin/mason` used by the CLI
- Returns `{ output, cancelled: false }` on success
- Returns `{ output: "", cancelled: true }` when the AbortSignal fires
- Throws on non-zero exit codes (unless aborted)

#### `acp-agent.ts` — Prompt Handler

The prompt handler orchestrates:

1. **Validate session** -- Look up `SessionState` from the in-memory `sessions` Map. Throw `InvalidParams` if session not found.
2. **Extract text** -- Iterate `ContentBlock[]`, concatenate `.text` from blocks with `type === "text"`. Skip non-text blocks gracefully.
3. **Setup cancellation** -- Create `AbortController`, store on the session state so `cancel` handler can access it.
4. **Execute** -- Call `executePrompt()` with session's agent, role, cwd, extracted text, and abort signal.
5. **Send result** -- `conn.sessionUpdate()` with `agent_message_chunk` containing the output text.
6. **Update metadata** -- Call `updateSession()` to set `lastUpdated` and `firstPrompt` (if null).
7. **Send session info** -- `conn.sessionUpdate()` with `session_info_update` containing title (truncated first prompt) and updatedAt.
8. **Cleanup** -- Remove `abortController` from session state.
9. **Return** -- `{ stopReason: "end_turn" }` or `{ stopReason: "cancelled" }` if aborted.

#### `acp-agent.ts` — Cancel Handler

The cancel handler:

1. Look up session state by `sessionId`.
2. If the session has an `abortController`, call `.abort()`.
3. The prompt handler's `executePrompt()` catches the abort, returns `{ cancelled: true }`, and the prompt handler returns `{ stopReason: "cancelled" }`.
4. No response is sent (cancel is a notification per ACP spec).

### Text Extraction

The `extractTextFromPrompt()` helper extracts text from `ContentBlock[]`:

```typescript
function extractTextFromPrompt(prompt: ContentBlock[]): string {
  return prompt
    .filter((block): block is ContentBlock & { type: "text" } => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
```

This handles the common case of text-only prompts. Non-text blocks (images, resources) are silently skipped for now, per the PRD non-goals.

### Error Handling

- **Session not found**: `RequestError.invalidParams("Session not found: {sessionId}")`
- **Empty prompt text**: Still executes (the agent may handle empty prompts gracefully)
- **Subprocess failure**: Throws an `RequestError.internalError` with the stderr output
- **Abort race condition**: If cancel arrives after subprocess completes, the abort is a no-op

### Test Coverage

Tests in `packages/cli/tests/acp/prompt.test.ts`:

1. **Text extraction**: Extracts text from single and multiple `TextContent` blocks
2. **Text extraction with mixed blocks**: Skips non-text blocks
3. **Subprocess arguments**: Verifies `executePrompt` is called with correct agent, role, text, cwd
4. **agent_message_chunk sent**: Verifies `conn.sessionUpdate()` receives the output
5. **PromptResponse**: Returns `{ stopReason: "end_turn" }`
6. **Cancel flow**: Abort controller triggers, prompt returns `{ stopReason: "cancelled" }`
7. **meta.json updated**: `firstPrompt` and `lastUpdated` set after first prompt
8. **session_info_update sent**: Title and updatedAt sent via session update
9. **Second prompt does not overwrite firstPrompt**: Only sets on first prompt

The tests mock `prompt-executor.ts` to avoid spawning real subprocesses. They use the same in-memory `TransformStream` connection pattern established in the existing test files.
