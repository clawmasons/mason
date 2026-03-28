## Design: ACP Automatic Resume

### Overview

This change adds automatic session resume to the ACP prompt flow. When an ACP session's first prompt completes, the agent hook captures `agentSessionId` in `meta.json`. On subsequent prompts, the ACP handler detects this and switches from `--agent`/`--role` args to `--resume <masonSessionId>`, giving the agent continuity across turns.

### Architecture

Two files are modified:

1. **`packages/cli/src/acp/prompt-executor.ts`** -- `ExecutePromptStreamingOptions` gains an optional `masonSessionId` field. When set, the args array changes from `["run", "--agent", agent, "--role", role, "--json", text]` to `["run", "--resume", masonSessionId, "--json", text]`.

2. **`packages/cli/src/acp/acp-agent.ts`** -- The `prompt` handler, after each successful prompt, reads `meta.json` to check for `agentSessionId`. On the next prompt, if `agentSessionId` is present, it passes `masonSessionId` (which equals `sessionId`) to `executePromptStreaming()`.

### Detailed Design

#### prompt-executor.ts Changes

```typescript
export interface ExecutePromptStreamingOptions {
  agent: string;
  role: string;
  text: string;
  cwd: string;
  signal?: AbortSignal;
  onSessionUpdate: (update: Record<string, unknown>) => void;
  masonSessionId?: string;  // NEW
}
```

In `executePromptStreaming()`, the args construction becomes:

```typescript
const args = options.masonSessionId
  ? ["run", "--resume", options.masonSessionId, "--json", text]
  : ["run", "--agent", agent, "--role", role, "--json", text];
```

This is a clean conditional -- no mixing of `--resume` with `--agent`/`--role`.

#### acp-agent.ts Changes

In the `prompt` handler, after the prompt completes and meta.json is updated, we re-read meta.json to check for `agentSessionId`. The key insight: the agent's SessionStart hook writes `agentSessionId` during execution, so it's available in meta.json by the time the prompt completes.

For the next prompt call, we check meta.json at the start:

```typescript
// At the start of prompt handler, check if we should resume
const sessionMeta = await readSession(session.cwd, sessionId);
const shouldResume = sessionMeta?.agentSessionId != null;

// Pass masonSessionId when resuming
const result = await executePromptStreaming({
  agent: session.agent,
  role: session.role,
  text,
  cwd: session.cwd,
  signal: abortController.signal,
  onSessionUpdate: (update) => { ... },
  ...(shouldResume && { masonSessionId: sessionId }),
});
```

Note: We read `meta.json` at the _start_ of each prompt (not just at the end). This way:
- First prompt: no `agentSessionId` yet -> uses `--agent`/`--role`
- Agent hook writes `agentSessionId` during first prompt
- Second prompt: reads `agentSessionId` -> uses `--resume`

### Edge Cases

1. **First prompt**: `agentSessionId` is null, so no resume. Standard behavior.
2. **Agent hook fails**: If the hook doesn't write `agentSessionId`, all prompts use `--agent`/`--role`. Degraded but functional.
3. **loadSession then prompt**: `loadSession` populates in-memory state. The prompt handler reads meta.json to check `agentSessionId`. If present (from a prior CLI session), it resumes.
4. **Backward compatibility**: `masonSessionId` is optional. Omitting it produces the same args as before.

### Test Coverage

#### prompt-executor-streaming.test.ts (new tests)

1. **`masonSessionId` present**: Verify spawn args are `["run", "--resume", "<id>", "--json", text]`
2. **`masonSessionId` absent**: Verify spawn args are `["run", "--agent", agent, "--role", role, "--json", text]` (existing test, confirm unchanged)

#### prompt.test.ts (new tests)

3. **First prompt uses `--agent`/`--role`**: Create session, send first prompt, verify `executePromptStreaming` called without `masonSessionId`
4. **Second prompt uses `--resume` after agentSessionId captured**: Create session, mock first prompt to write `agentSessionId` to meta.json, send second prompt, verify `executePromptStreaming` called with `masonSessionId`
5. **No resume when agentSessionId is null**: Create session, send two prompts without agent hook writing `agentSessionId`, verify both use `--agent`/`--role`

### Files Changed

- `packages/cli/src/acp/prompt-executor.ts` -- Add `masonSessionId` to interface; conditional args in `executePromptStreaming()`
- `packages/cli/src/acp/acp-agent.ts` -- Read meta.json at prompt start to detect resume; pass `masonSessionId` when resuming
- `packages/cli/tests/acp/prompt-executor-streaming.test.ts` -- Add tests for resume args
- `packages/cli/tests/acp/prompt.test.ts` -- Add tests for ACP auto-resume flow
