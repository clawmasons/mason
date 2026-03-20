## 1. agent-sdk: Add initialPrompt to MaterializeOptions and generateAgentLaunchJson

- [x] 1.1 Add `initialPrompt?: string` field to `MaterializeOptions` interface in `packages/agent-sdk/src/types.ts`
- [x] 1.2 Add `initialPrompt?: string` as sixth parameter to `generateAgentLaunchJson` in `packages/agent-sdk/src/helpers.ts`
- [x] 1.3 In `generateAgentLaunchJson`, append `initialPrompt` as final bare positional to `args` when non-empty and `!acpMode`
- [x] 1.4 Add unit tests in `packages/agent-sdk/tests/helpers.test.ts` covering: initialPrompt appended last, not appended when undefined/empty, not appended in ACP mode, correct ordering with instructions and agentArgs

## 2. pi-coding-agent: Forward initialPrompt to generateAgentLaunchJson

- [x] 2.1 In `packages/pi-coding-agent/src/materializer.ts` `materializeWorkspace`, pass `options?.initialPrompt` as sixth arg to `generateAgentLaunchJson`
- [x] 2.2 Add/update tests in `packages/pi-coding-agent/tests/materializer.test.ts` covering: initialPrompt present in agent-launch.json args, absent when not provided

## 3. claude-code-agent: Forward initialPrompt to generateAgentLaunchJson

- [x] 3.1 In `packages/claude-code-agent/src/materializer.ts` `materializeWorkspace`, pass `options?.initialPrompt` as sixth arg to `generateAgentLaunchJson`
- [x] 3.2 In `packages/claude-code-agent/src/materializer.ts` `materializeSupervisor`, pass `options?.initialPrompt` as sixth arg to `generateAgentLaunchJson`
- [x] 3.3 Add/update tests covering: initialPrompt appended after --append-system-prompt and agentArgs, absent when not provided

## 4. CLI: Thread initialPrompt through runAgent to materializer

- [x] 4.1 Add `initialPrompt?: string` to the `acpOptions` object in `runAgent` signature in `packages/cli/src/cli/commands/run-agent.ts`
- [x] 4.2 Pass `initialPrompt` through `runAgentInteractiveMode`, `runAgentAcpMode`, and `runAgentDevContainerMode` into `MaterializeOptions`
- [x] 4.3 Verify `initialPrompt` is NOT forwarded when `isAcpMode = true`

## 5. CLI: run command positional arg disambiguation

- [x] 5.1 Add `[prompt]` as second optional positional argument to `registerRunCommand` in `run-agent.ts`
- [x] 5.2 Update `createRunAction` signature to receive `(positionalAgent, positionalPrompt, options)` from Commander
- [x] 5.3 Implement disambiguation: when `options.agent` is set AND `positionalAgent` is also set, treat `positionalAgent` as prompt (override `positionalPrompt`)
- [x] 5.4 Derive `initialPrompt` from the resolved prompt positional, pass into `runAgent`

## 6. CLI: configure command hardcoded initial prompt

- [x] 6.1 Extend `createRunAction` to accept `overridePrompt?: string` second parameter
- [x] 6.2 Use `overridePrompt` as default `initialPrompt` when no user-supplied positional prompt is present
- [x] 6.3 Add `[prompt]` as optional positional argument to `registerConfigureCommand`
- [x] 6.4 Pass `"create and implement role plan"` as `overridePrompt` in `registerConfigureCommand`'s `createRunAction(CONFIGURE_ROLE, CONFIGURE_PROMPT)` call

## 7. Verification

- [x] 7.1 Run `npx tsc --noEmit` from repo root — no type errors (pre-existing unrelated error in package.test.ts excluded)
- [x] 7.2 Run `npx vitest run packages/agent-sdk/tests/` — all tests pass
- [x] 7.3 Run `npx vitest run packages/pi-coding-agent/tests/` — all tests pass
- [x] 7.4 Run `npx vitest run packages/claude-code-agent/tests/` — all tests pass (if test file exists)
- [x] 7.5 Run `npx eslint src/ tests/` in affected packages — no lint errors
