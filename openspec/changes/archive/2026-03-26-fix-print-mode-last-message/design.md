## Context

Print mode runs an agent non-interactively and extracts a final text result from its JSON stream. The SDK currently calls `parseJsonStreamFinalResult(line)` for each JSON line and stores the first non-null return as the final result. The codex agent emits multiple `item.completed` events with `type: "agent_message"` — one per reasoning/tool-use step — followed by a `turn.completed` sentinel. The current parser matches the first `agent_message`, which is typically an intermediate thought, not the final answer.

## Goals / Non-Goals

**Goals:**
- Return the last `agent_message` text from a codex stream (the one immediately before `turn.completed`)
- Preserve backward compatibility — existing parsers (claude-code-agent, pi-coding-agent) must work unchanged
- Keep the change minimal: one optional parameter addition, one callback-site change, one parser rewrite

**Non-Goals:**
- Changing the streaming infrastructure (`execComposeRunWithStreamCapture`)
- Supporting non-JSON previous lines
- Changing behavior for agents other than codex

## Decisions

### 1. Add `previousLine` as an optional second parameter

The SDK passes the previous JSON-looking line to `parseJsonStreamFinalResult(line, previousLine?)`. Because the parameter is optional, existing parsers that only declare `(line)` continue to work without modification.

**Alternative considered**: accumulate all `agent_message` lines in the SDK and pick the last one. Rejected because that pushes agent-specific knowledge into the SDK — the parser contract should keep agent-specific logic in the extension.

### 2. SDK tracks `previousLine` only for JSON-looking lines

The streaming callback keeps a `previousLine` variable. A line is retained as `previousLine` only if its trimmed content starts with `{` or `[`. This avoids passing garbage/non-JSON lines to the parser.

### 3. Codex parser matches on `turn.completed` and reads `previousLine`

The codex parser changes from "match any `item.completed` with `agent_message`" to "match `turn.completed`, then extract the `agent_message` from the parsed `previousLine`". This guarantees we always get the last message.

## Risks / Trade-offs

- [Breaking type change] → Mitigated by making `previousLine` optional; no existing code breaks
- [previousLine might not be an agent_message] → Parser returns `null` if previousLine doesn't contain the expected structure, falling through gracefully
- [Stream ends without turn.completed] → Parser returns null, same as current behavior for missing results
