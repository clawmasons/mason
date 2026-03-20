# Proposal: Role Instructions into System Prompt

## Why

Role `instructions` are currently injected as a trailing positional argument to the agent command, which Claude Code interprets as the **initial user prompt**. This means role instructions become part of the conversation history as a user message, rather than persistent system-level context.

The semantically correct placement is the **system prompt**: role instructions describe *how the agent should behave*, not *what the user is asking*. Each agent runtime has its own mechanism for this:

- **Claude Code** — `--append-system-prompt <text>` CLI flag
- **Pi coding agent** — `.pi/APPEND_SYSTEM.md` file in the workspace

## What Changes

### claude-code-agent (CLI flag)
- **`packages/agent-sdk/src/helpers.ts`** — In `generateAgentLaunchJson`, change instructions injection from a trailing positional arg to `--append-system-prompt <instructions>` flag + value.
- **`packages/agent-sdk/src/types.ts`** — Rename `supportsInitialPrompt` → `supportsAppendSystemPrompt` on `RuntimeConfig` to accurately reflect the mechanism.
- **`packages/claude-code-agent/src/index.ts`** — Update to use the renamed field.
- **`packages/agent-sdk/tests/helpers.test.ts`** — Update tests to assert `--append-system-prompt` flag behavior.

### pi-coding-agent (file-based)
- **`packages/pi-coding-agent/src/materializer.ts`** — In `materializeWorkspace`, emit `.pi/APPEND_SYSTEM.md` containing the role instructions (from `agent.roles[0]?.instructions`) when instructions are present.
- **`packages/pi-coding-agent/tests/materializer.test.ts`** — Add test asserting `.pi/APPEND_SYSTEM.md` is generated with the correct content when instructions are set, and absent when they are not.

## Capabilities

### Changed Behavior
- Claude Code: role instructions land in the system prompt via `--append-system-prompt` instead of as an initial user message.
- Pi: role instructions land in the system prompt via `.pi/APPEND_SYSTEM.md` instead of being silently dropped.
- `RuntimeConfig.supportsInitialPrompt` renamed to `supportsAppendSystemPrompt`.

### No Change
- ACP mode: instructions are still skipped for claude-code-agent (unchanged).
- All other launch config fields remain identical.

## Impact

| Area | Details |
|------|---------|
| New files | None |
| Modified files | `packages/agent-sdk/src/helpers.ts`, `packages/agent-sdk/src/types.ts`, `packages/claude-code-agent/src/index.ts`, `packages/agent-sdk/tests/helpers.test.ts`, `packages/pi-coding-agent/src/materializer.ts`, `packages/pi-coding-agent/tests/materializer.test.ts` |
| New dependencies | None |
| Breaking changes | `RuntimeConfig.supportsInitialPrompt` renamed to `supportsAppendSystemPrompt` — any external agent packages using this field must update |
