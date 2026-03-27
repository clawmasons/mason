## Context

The claude-code-agent has `printMode` (extracts final result text) but lacks `jsonMode` (streams real-time ACP session updates). The codex-agent already implements `jsonMode` and serves as the reference pattern. Both agents use `generateAgentLaunchJson` from `@clawmasons/agent-sdk` which already supports a `jsonMode` parameter — the claude-code-agent just doesn't pass it through.

Claude CLI's `--output-format stream-json --verbose` emits NDJSON lines with event types: `system` (init/retry/compact), `assistant` (with text/tool_use content blocks), `user` (with tool_result content blocks), and `result`. The agent-relevant events must be mapped to the ACP `SessionUpdate` discriminated union.

## Goals / Non-Goals

**Goals:**
- Add `jsonMode` to the claude-code-agent `AgentPackage` with a parser that maps Claude's stream-json events to valid ACP session updates
- Pass `options?.jsonMode` through both materializer methods to `generateAgentLaunchJson`
- Produce ACP updates that pass the `validateSessionUpdate()` Zod schema validation

**Non-Goals:**
- Adding `plan` or `current_mode_update` ACP events (Claude CLI doesn't emit these in stream-json format)
- Adding `agent_thought_chunk` events (Claude doesn't expose thinking in stream-json)
- Changing the existing `printMode` behavior
- Changing any agent-sdk types unrelated to the parser return type

## Decisions

### 1. Reuse the same `jsonStreamArgs` as `printMode`

Claude CLI uses `--output-format stream-json --verbose` for both streaming modes. The difference is only in how the output is parsed (final result extraction vs. per-line ACP mapping). This is the same pattern codex uses — its `printMode` and `jsonMode` share `--json` as the stream flag.

**Alternative**: Different flags — rejected because Claude CLI doesn't have a separate JSON streaming mode.

### 2. Parser maps 4 event types from Claude's stream-json format

Claude's `--output-format stream-json` emits these top-level event types: `system` (init/retry/compact), `assistant` (with content blocks), `user` (with tool_result blocks), and `result`. The parser maps:

| Claude event | ACP update | Mapping |
|---|---|---|
| `type: "assistant"` + `text` block | `agent_message_chunk` | `block.text` → `content.text` |
| `type: "assistant"` + `tool_use` block | `tool_call` | `block.id` → `toolCallId`, `block.name` → `title`, kind=`"other"`, status=`"in_progress"` |
| `type: "user"` + `tool_result` block | `tool_call_update` | `block.tool_use_id` → `toolCallId`, status=`"completed"`, `block.content` → `content` (see note below) |
| `type: "result"` (success only) | `agent_message_chunk` | `event.result` → `content.text` (skip if `result` is null/empty or `is_error: true`) |

**Important**: Tool results are **not** a top-level `type: "tool_result"` event. They are wrapped inside `type: "user"` events as content blocks within `message.content`. Each `tool_result` block has a `tool_use_id` that references the corresponding `tool_use` block's `id` from the `assistant` event. The `content` field is typically a string but can be an array of content blocks.

An `assistant` event may contain multiple content blocks (e.g., text + tool_use), and a `user` event may contain multiple `tool_result` blocks. Since we return arrays, all blocks from a single event are emitted as separate ACP updates.

Events we skip: `system` (init, api_retry, compact_boundary) — these are infrastructure events, not agent activity.

**Alternative**: Map more event types — rejected because Claude's stream-json format doesn't expose plan, mode, or thinking events. We map what's available.

### 3. Tool kind defaults to `"other"`

Claude's `tool_use` blocks don't include a tool category. Rather than guessing from the tool name (fragile), we default to `kind: "other"` which is valid per the ACP schema.

**Alternative**: Infer kind from tool name (e.g., "Read" → `"read"`, "Edit" → `"edit"`) — possible future enhancement but not necessary for correctness.

### 4. Parser returns array to handle multi-block assistant messages

A single `assistant` event can contain multiple content blocks (e.g., text + tool_use interleaved). Rather than returning only the first mappable block and dropping the rest, `parseJsonStreamAsACP` returns `AcpSessionUpdate | AcpSessionUpdate[] | null`:

- **`null`** — line doesn't map to any ACP update (skip)
- **Single `AcpSessionUpdate`** — one update from this line (most common)
- **`AcpSessionUpdate[]`** — multiple updates from one line (e.g., an `assistant` event with both a text block and a tool_use block)

This requires two changes:

1. **SDK type change** (`packages/agent-sdk/src/types.ts`): Update the `parseJsonStreamAsACP` return type from `AcpSessionUpdate | null` to `AcpSessionUpdate | AcpSessionUpdate[] | null`
2. **CLI caller change** (`packages/cli/src/cli/commands/run-agent.ts`): Normalize the result — if it's an array, iterate and emit each update as a separate NDJSON line; if it's a single object, emit as before. Use `Array.isArray()` to distinguish.

This is backward-compatible: existing agents (codex, pi) that return a single update or null continue to work unchanged. The array path is additive.

### 5. Materializer changes are mechanical

Both `materializeWorkspace` and `materializeSupervisor` call `generateAgentLaunchJson` — both need `options?.jsonMode` appended as the final argument. This is identical to what the codex materializer does.

## Risks / Trade-offs

**[Claude stream-json format may change]** → The parser is isolated in `parseJsonStreamAsACP`; format changes only require updating this one function. Wrapped in try/catch at the call site (by the CLI), so parse errors are logged and skipped rather than crashing.

**[Array return type adds minor complexity to caller]** → Mitigated by a simple `Array.isArray()` check. The normalization logic is ~3 lines and all existing agents are unaffected since they return single values.

**[tool_result content format variability]** → Claude's `tool_result.content` can be a string or an array of content blocks. ACP's `tool_call_update.content` expects `Array<{type: "content", content: {type: "text", text: string}}>` — a doubly-nested structure. The parser must:
- If `block.content` is a string: wrap as `[{type: "content", content: {type: "text", text: block.content}}]`
- If `block.content` is an array: extract text blocks, wrap each in the ACP content structure
- If `block.content` is missing/null: omit `content` from the update (it's optional on `tool_call_update`)

**[result event error cases]** → Claude emits `result` events with `is_error: true` and no `result` field for error exits (max turns, budget exceeded, etc.). The parser should skip these (return null) rather than emitting an empty `agent_message_chunk`.
