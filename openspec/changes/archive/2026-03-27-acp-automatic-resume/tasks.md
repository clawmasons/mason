## Tasks: ACP Automatic Resume

### Task 1: Add `masonSessionId` to `ExecutePromptStreamingOptions`
- [x] Add optional `masonSessionId?: string` field to `ExecutePromptStreamingOptions` interface in `prompt-executor.ts`
- [x] Update `executePromptStreaming()` to conditionally build args: when `masonSessionId` is set, use `["run", "--resume", masonSessionId, "--json", text]`; otherwise use existing `["run", "--agent", agent, "--role", role, "--json", text]`
- [x] Destructure `masonSessionId` from options alongside existing fields

### Task 2: Update ACP prompt handler to detect and use resume
- [x] At the start of the `prompt` handler in `acp-agent.ts`, read `meta.json` via `readSession()` to check for `agentSessionId`
- [x] When `agentSessionId` is present, pass `masonSessionId: sessionId` to `executePromptStreaming()`
- [x] When `agentSessionId` is absent/null, omit `masonSessionId` (backward compatible first-prompt behavior)

### Task 3: Add unit tests for prompt-executor resume args
- [x] Test: `executePromptStreaming()` with `masonSessionId` spawns `["run", "--resume", "<id>", "--json", text]`
- [x] Test: `executePromptStreaming()` without `masonSessionId` spawns legacy `["run", "--agent", agent, "--role", role, "--json", text]` (confirm existing test still passes)

### Task 4: Add unit tests for ACP auto-resume flow
- [x] Test: First ACP prompt does not pass `masonSessionId` to `executePromptStreaming()`
- [x] Test: Second ACP prompt passes `masonSessionId` when `agentSessionId` is set in meta.json
- [x] Test: Second ACP prompt does not pass `masonSessionId` when `agentSessionId` is still null

### Task 5: TypeScript compilation and lint check
- [x] Run `npx tsc --noEmit` to verify compilation
- [x] Run `npx vitest run packages/cli/tests/` to verify all 701 tests pass (including 5 new tests)
