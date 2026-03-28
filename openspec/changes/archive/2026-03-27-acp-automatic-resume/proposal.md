## Why

The ACP `prompt` handler currently spawns a fresh `mason run --agent X --role Y` subprocess for every prompt, even within the same session. This means multi-turn ACP conversations have no continuity -- each prompt starts a brand-new agent process with no memory of prior turns. The session infrastructure (meta.json, agentSessionId capture via hooks, `--resume` CLI flag) is in place from Changes 1-6, but the ACP layer does not use it. IDE plugins using ACP (Zed, VS Code) cannot provide seamless multi-turn conversations.

## What Changes

- Add an optional `masonSessionId` field to `ExecutePromptStreamingOptions` in `packages/cli/src/acp/prompt-executor.ts`. When present, replace `--agent`/`--role` args with `--resume <masonSessionId>` in the spawned command.
- In the ACP `prompt` handler (`packages/cli/src/acp/acp-agent.ts`), after each prompt completes: read `meta.json` to check if `agentSessionId` was captured by the agent hook. On subsequent prompts, if `agentSessionId` is set, pass `masonSessionId` (the session's own ID) to `executePromptStreaming()` so it spawns `mason run --resume <masonSessionId> --json <text>` instead of `mason run --agent X --role Y --json <text>`.

## Capabilities

### New Capabilities

- `executePromptStreaming()` accepts optional `masonSessionId` and uses `--resume` args when present
- ACP prompt handler automatically detects `agentSessionId` after first prompt and uses resume mode for subsequent prompts
- Multi-turn ACP conversations seamlessly resume the agent session

### Modified Capabilities

- `executePromptStreaming()` signature extended with optional `masonSessionId` field (backward compatible)
- ACP `prompt` handler reads `meta.json` after each prompt to detect `agentSessionId`

### Unchanged Capabilities

- First prompt in an ACP session still spawns `mason run --agent X --role Y` (no resume on first prompt)
- Non-streaming `executePrompt()` is unchanged
- All other ACP handlers (newSession, loadSession, cancel, etc.) unchanged
- CLI `mason run --resume` (non-ACP) unchanged

## How to Verify

1. `executePromptStreaming()` without `masonSessionId` spawns `mason run --agent X --role Y --json text` (backward compatible)
2. `executePromptStreaming()` with `masonSessionId` spawns `mason run --resume <masonSessionId> --json text`
3. First ACP prompt for a new session does not use `--resume` (no agentSessionId yet)
4. After first ACP prompt sets `agentSessionId` in meta.json, second prompt uses `--resume <sessionId>`
5. ACP prompt reads `meta.json` after each prompt to check for `agentSessionId`
