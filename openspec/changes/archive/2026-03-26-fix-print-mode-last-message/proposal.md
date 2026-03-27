## Why

In `--print` mode, `parseJsonStreamFinalResult` returns the first matching `agent_message` from the JSON stream. Multi-step agents like codex emit multiple `agent_message` events (one per tool-use step), so print mode returns an intermediate message instead of the agent's final answer. The fix is to wait for the `turn.completed` sentinel and return the last `agent_message` that preceded it.

## What Changes

- **BREAKING**: `parseJsonStreamFinalResult` signature changes from `(line: string) => string | null` to `(line: string, previousLine?: string) => string | null` to support two-line lookback
- SDK streaming callback tracks `previousLine` (only retaining lines that look like JSON) and passes both current line and previous line to the parser
- Codex-agent's parser changes to match on `turn.completed` and extract the agent message text from `previousLine`

## Capabilities

### New Capabilities

_None_

### Modified Capabilities

- `print-mode`: `parseJsonStreamFinalResult` gains a `previousLine` parameter; SDK passes tracked previous JSON line to the parser; the contract changes from "first non-null return wins" to "parser decides when it has the final result using current + previous line context"

## Impact

- `packages/agent-sdk/src/types.ts` — `AgentPackage.printMode.parseJsonStreamFinalResult` type signature
- `packages/cli/src/cli/commands/run-agent.ts` — streaming callback in `execComposeRunWithStreamCapture` call site
- `mason-extensions/agents/codex-agent/src/index.ts` — codex parser implementation
- Other agent extensions (claude-code-agent, pi-coding-agent) are unaffected — `previousLine` is optional
