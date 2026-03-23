## 1. Log Unification

- [x] 1.1 Rename hardcoded `"acp.log"` to `"session.log"` in `packages/cli/src/acp/logger.ts` and update JSDoc

## 2. SDK Types

- [x] 2.1 Add `printMode?: { jsonStreamArgs: string[]; parseJsonStreamFinalResult(line: string): string | null }` to `AgentPackage` in `packages/agent-sdk/src/types.ts`
- [x] 2.2 Add `printMode?: boolean` to `MaterializeOptions` in `packages/agent-sdk/src/types.ts`

## 3. SDK Helpers

- [x] 3.1 Add `printMode?: boolean` parameter to `generateAgentLaunchJson` in `packages/agent-sdk/src/helpers.ts`
- [x] 3.2 When `printMode && !acpMode`: append `agentPkg.printMode.jsonStreamArgs` then `["-p", initialPrompt]` instead of bare positional
- [x] 3.3 Add unit tests for print mode in `packages/agent-sdk/tests/helpers.test.ts`: printMode emits json stream args + `-p`; non-print emits bare positional; ACP mode omits prompt regardless

## 4. Agent Package Configs

- [x] 4.1 Add `printMode` config to claude-code-agent in `packages/claude-code-agent/src/index.ts` with `jsonStreamArgs: ["--output-format", "stream-json"]` and `parseJsonStreamFinalResult` for `event.type === "result"`
- [x] 4.2 Add `printMode` config to pi-coding-agent in `packages/pi-coding-agent/src/index.ts` with `jsonStreamArgs: ["--mode", "json"]` and `parseJsonStreamFinalResult` for `event.type === "agent_end"`

## 5. Thread printMode Through Materializers

- [x] 5.1 Pass `options?.printMode` to `generateAgentLaunchJson` in `packages/claude-code-agent/src/materializer.ts`
- [x] 5.2 Pass `options?.printMode` to `generateAgentLaunchJson` in `packages/pi-coding-agent/src/materializer.ts`
- [x] 5.3 Add `printMode?: boolean` to `GenerateBuildDirOptions` in `packages/cli/src/materializer/docker-generator.ts` and thread to `materializeOpts`

## 6. Bug Fix: Forward initialPrompt

- [x] 6.1 Add `initialPrompt: deps?.initialPrompt` to the `generateRoleDockerBuildDir` call in `ensureDockerBuild` at `packages/cli/src/cli/commands/run-agent.ts:389-398`

## 7. CLI Flag and Print Mode

- [x] 7.1 Add `-p, --print <prompt>` option to `registerRunCommand` in `packages/cli/src/cli/commands/run-agent.ts`
- [x] 7.2 Add `print?: string` to options type in `createRunAction()` and set `initialPrompt`/`printMode` from it, with mutual exclusivity validation
- [x] 7.3 Add `printMode?: boolean` to `ensureDockerBuild` deps type and forward to `generateRoleDockerBuildDir`
- [x] 7.4 Add `printMode?: boolean` to `acpOptions` in `runAgent()` and add dispatch branch for print mode

## 8. Print Mode Runtime

- [x] 8.1 Implement `execComposeRunWithStreamCapture(composeFile, args, onLine)` with `stdio: ["inherit", "pipe", "pipe"]`, line-by-line stdout reading, and stderr capture
- [x] 8.2 Implement `runAgentPrintMode()` with: early log suppression, file logger to `session.log`, same agent lifecycle as interactive mode, stdout capture via `execComposeRunWithStreamCapture`, `parseJsonStreamFinalResult` parsing with try/catch, final result output, exit code propagation

## 9. Verification

- [x] 9.1 Run `npx tsc --noEmit` — type check passes
- [x] 9.2 Run `npx eslint src/ tests/` — lint passes
- [x] 9.3 Run `npx vitest run packages/agent-sdk/tests/` — unit tests pass
- [x] 9.4 Run `npx vitest run packages/cli/tests/` — unit tests pass
