# Tasks: Role Instructions into System Prompt

## agent-sdk

- [x] In `packages/agent-sdk/src/types.ts`, rename `supportsInitialPrompt` → `supportsAppendSystemPrompt` on `RuntimeConfig` and update the doc comment
- [x] In `packages/agent-sdk/src/helpers.ts`, update the guard from `supportsInitialPrompt` → `supportsAppendSystemPrompt` and change the injection from `[...args, instructions]` to `[...args, "--append-system-prompt", instructions]`
- [x] In `packages/agent-sdk/tests/helpers.test.ts`, replace all `supportsInitialPrompt` with `supportsAppendSystemPrompt` and update assertions to expect `["--flag", "--append-system-prompt", "Do the thing"]` (and the agentArgs-after-instructions test)

## claude-code-agent

- [x] In `packages/claude-code-agent/src/index.ts`, rename `supportsInitialPrompt: true` → `supportsAppendSystemPrompt: true` in the `runtime` config

## pi-coding-agent

- [x] In `packages/pi-coding-agent/src/materializer.ts`, add block in `materializeWorkspace` (after the skills loop, before `agent-launch.json`) to emit `.pi/APPEND_SYSTEM.md` when `agent.roles[0]?.instructions` is non-empty
- [x] In `packages/pi-coding-agent/tests/materializer.test.ts`, add test: instructions present → `.pi/APPEND_SYSTEM.md` in result with correct value
- [x] In `packages/pi-coding-agent/tests/materializer.test.ts`, add test: instructions absent → `.pi/APPEND_SYSTEM.md` not in result

## Verification

- [ ] `npx tsc --noEmit` passes from repo root (pre-existing unrelated error in cli/tests)
- [ ] `npx eslint src/ tests/` passes in `packages/agent-sdk` and `packages/pi-coding-agent`
- [x] `npx vitest run packages/agent-sdk/tests/` passes
- [x] `npx vitest run packages/pi-coding-agent/tests/` passes
