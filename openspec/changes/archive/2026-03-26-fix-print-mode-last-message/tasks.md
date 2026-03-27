## 1. SDK Type Change

- [x] 1.1 Update `parseJsonStreamFinalResult` signature in `packages/agent-sdk/src/types.ts` to add optional `previousLine?: string` parameter

## 2. SDK Streaming Callback

- [x] 2.1 In `packages/cli/src/cli/commands/run-agent.ts`, add `previousLine` tracking variable to the streaming callback — retain only JSON-looking lines
- [x] 2.2 Pass `previousLine` as second argument to `parseFinalResult(line, previousLine)` call
- [x] 2.3 Change `finalResult` logic to keep updating on each non-null return instead of stopping at the first match

## 3. Codex Agent Parser

- [x] 3.1 Update `parseJsonStreamFinalResult` in `mason-extensions/agents/codex-agent/src/index.ts` to match on `turn.completed` and extract agent_message text from `previousLine`

## 4. Tests

- [x] 4.1 Add/update unit tests for the new previousLine tracking and parser behavior
