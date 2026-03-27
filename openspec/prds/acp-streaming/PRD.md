# ACP Streaming — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** ClawForge, Inc.

---

## 1. Problem Statement

When an agent is run from ACP, mason currently uses `--print` mode (`mason run -p`). Print mode streams the agent's JSON output but only extracts the **final result** — a single text string returned as one `agent_message_chunk` to the ACP client. The editor user sees nothing until the agent's entire turn completes, which can take minutes for complex tasks.

This creates a poor user experience:

- **No intermediate visibility:** Users cannot see tool calls, reasoning, or partial progress while the agent works.
- **No streaming feedback:** The editor appears frozen until the full response is ready.
- **Lost context:** Tool invocations, file edits, and agent reasoning are invisible to the user — they only see the final summary.

---

## 2. Goals

### User Goals
- Editor users see all agent messages in real time: text output, tool calls, tool results, and reasoning/thinking blocks.
- The streaming experience matches what a user would see in an interactive terminal session.
- Each agent (Claude, Codex, Pi) streams ACP-compliant messages from its own proprietary JSON format.

### Business Goals
- Enable richer editor integrations that show agent activity as it happens.
- Keep the architecture extensible — each agent defines its own JSON-to-ACP translation without coupling agents to each other.
- Reuse the existing `printMode` pattern to minimize new infrastructure.

### Measurable Outcomes
- `mason run --json` streams newline-delimited ACP session update messages to stdout.
- ACP prompt execution uses `--json` mode instead of `--print` mode, forwarding each line as a session update.
- All three agents (claude-code-agent, codex-agent, pi-coding-agent) implement `jsonMode` with agent-specific parsers.

---

## 3. Non-Goals

- **Partial text streaming (sub-message granularity):** Each emitted message is a complete event. Character-by-character or token-by-token streaming within a single message is out of scope for this phase.
- **Session history / multi-turn context:** Each `--json` invocation is still a single-turn execution. Session memory remains a future enhancement.
- **Interactive tool approval via ACP:** Tool calls are reported to the editor for visibility, but approval/denial flows remain out of scope.
- **Replacing print mode:** `--print` mode continues to exist for use cases that only need the final result. `--json` mode is additive.
- **Persistent agent process:** Each prompt still spawns a fresh agent process.
- **HTTP transport:** Only stdio-based newline-delimited JSON is supported.

---

## 4. User Stories

**US-1:** As an editor user, I want to see each agent message as it happens (text responses, tool calls, tool results, thinking blocks), so that I understand what the agent is doing in real time.

**US-2:** As an editor extension developer, I want `mason run --json` to emit newline-delimited ACP session update messages on stdout, so that I can forward them directly to the ACP client connection without transformation.

**US-3:** As an agent package author, I want to define a `jsonMode` configuration on my `AgentPackage` that translates my agent's proprietary JSON stream into ACP messages, so that I can support streaming without changing the CLI core.

**US-4:** As an ACP integration, I want the prompt executor to use `--json` mode and stream each line as a session update, so that editor users see real-time agent activity instead of waiting for the final result.

---

## 5. Architecture Overview

### 5.1 Data Flow

```
Editor (ACP Client)
    ↓ session/prompt
ACP Agent (acp-agent.ts)
    ↓ spawns subprocess
mason run --agent <agent> --role <role> --json -p "prompt"
    ↓ docker compose run
Agent Container (e.g., claude, codex, pi)
    ↓ agent's native JSON stream (stdout)
parseJsonStreamAsACP(line, previousLine)  ← per-agent parser
    ↓ ACP session update JSON (one per line)
stdout → ACP prompt executor
    ↓ conn.sessionUpdate() per line
Editor (ACP Client)
```

### 5.2 Output Format

Each line emitted by `--json` mode is a JSON object conforming to ACP session update types. The supported update types are:

#### `agent_message_chunk` — Text content from the agent
```json
{"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "Here is my analysis..."}}
```

#### `tool_call` — Agent invokes a tool
Per ACP protocol, tool call fields are flat on the session update object (not nested in a wrapper). Fields include `toolCallId`, `title`, `kind`, and `status`:
```json
{"sessionUpdate": "tool_call", "toolCallId": "toolu_abc123", "title": "Read src/index.ts", "kind": "other", "status": "in_progress"}
```

#### `tool_call_update` — Tool call status change or result
Used to report tool completion with content. Only `toolCallId` is required; other fields are optional/nullable:
```json
{"sessionUpdate": "tool_call_update", "toolCallId": "toolu_abc123", "status": "completed", "content": [{"type": "content", "content": {"type": "text", "text": "file contents..."}}]}

#### `agent_thought_chunk` — Agent reasoning/thinking block
```json
{"sessionUpdate": "agent_thought_chunk", "content": {"type": "text", "text": "I need to analyze the function signature first..."}}
```

#### `plan` — Execution plan with prioritized entries
Per ACP protocol, plan entries have `content` (string), `priority` (high/medium/low), and `status` (pending/in_progress/completed). Each update replaces the entire plan:
```json
{"sessionUpdate": "plan", "entries": [{"content": "Read config files", "priority": "high", "status": "completed"}, {"content": "Update schema types", "priority": "high", "status": "in_progress"}, {"content": "Add unit tests", "priority": "medium", "status": "pending"}]}
```

#### `current_mode_update` — Agent mode change
Per ACP protocol, uses `modeId` referencing a mode from the session's `availableModes`:
```json
{"sessionUpdate": "current_mode_update", "modeId": "planning"}
```

When consumed by the ACP prompt executor, each update is wrapped in the full ACP JSON-RPC envelope for `session/update`:
```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123def456",
    "update": {
      "sessionUpdate": "agent_thought_chunk",
      "content": {
        "type": "text",
        "text": "I need to analyze the function signature first..."
      }
    }
  }
}
```

> **Note:** The exact set of `sessionUpdate` types may expand. Each agent parser emits whichever types it can extract from its native format. Unknown types are logged and skipped by the consumer.

---

## 6. Requirements

### P0 — Must-Have

**REQ-1: `--json` CLI flag**
`mason run` accepts a `--json` flag. When set, the agent is launched with JSON streaming args (from `jsonMode.jsonStreamArgs`) and stdout emits newline-delimited ACP session update objects. Mutually exclusive with `--print` / `-p` (prompt-only mode without `--json` still uses print mode behavior).

**REQ-2: `jsonMode` on `AgentPackage`**
The `AgentPackage` interface gains a new optional `jsonMode` property, independent of `printMode`:

```typescript
jsonMode?: {
  /** Args to append to agent command to enable JSON streaming output. */
  jsonStreamArgs: string[];

  /**
   * Build the CLI args that pass the initial prompt to the agent.
   * Defaults to `["-p", prompt]` when not defined.
   */
  buildPromptArgs?: (prompt: string) => string[];

  /**
   * Parse a line from the agent's JSON stream and convert it to an ACP session update.
   * Return an ACP session update object when the line maps to one, or null to skip.
   * Called with try/catch — exceptions are logged and the line is skipped.
   *
   * @param line - The current JSON stream line from the agent
   * @param previousLine - The previous JSON-parseable line (if any)
   * @returns An ACP session update object, or null if the line should be skipped
   */
  parseJsonStreamAsACP(line: string, previousLine?: string): AcpSessionUpdate | null;
};
```

**REQ-3: `jsonMode` is independent of `printMode`**
`jsonMode` and `printMode` are separate properties on `AgentPackage`. Even when the args happen to be identical for an agent, they are declared independently. This allows the two modes to diverge as requirements evolve.

**REQ-4: JSON mode execution in `run-agent`**
When `--json` is active, `run-agent` follows the same Docker lifecycle as print mode (compose build, proxy start, host proxy, compose run) but instead of collecting a final result, it writes each parsed ACP session update as a JSON line to stdout immediately.

**REQ-5: Claude Code Agent `jsonMode`**
Claude's JSON stream uses `--output-format stream-json --verbose`. The parser maps `assistant` messages (text blocks → `agent_message_chunk`, tool_use blocks → `tool_call`, tool_result → `tool_call_update`) and `result` → final `agent_message_chunk`. Claude does not emit plan, mode, or thinking events in this format. See section 7.1 for full mapping table.

```typescript
jsonMode: {
  jsonStreamArgs: ["--output-format", "stream-json", "--verbose"],
  buildPromptArgs: (prompt) => ["-p", prompt],
  parseJsonStreamAsACP(line: string): AcpSessionUpdate | null {
    const event = JSON.parse(line);
    if (event.type === "assistant" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === "text") return { sessionUpdate: "agent_message_chunk", content: { type: "text", text: block.text } };
        if (block.type === "tool_use") return { sessionUpdate: "tool_call", toolCallId: block.id, title: block.name, kind: "other", status: "in_progress" };
      }
    }
    if (event.type === "result" && event.result) {
      return { sessionUpdate: "agent_message_chunk", content: { type: "text", text: event.result } };
    }
    return null;
  },
}
```

**REQ-6: Codex Agent `jsonMode`**
Codex streams NDJSON via `exec --json`. The parser maps `item.started`/`item.completed` events for item types: `agent_message` → `agent_message_chunk`, `reasoning` → `agent_thought_chunk`, `command_execution`/`mcp_tool_call` → `tool_call`/`tool_call_update`, `file_change` → `tool_call_update`, `todo_list` → `plan`. See section 7.2 for full mapping table.

```typescript
jsonMode: {
  jsonStreamArgs: ["exec", "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check", "--json"],
  buildPromptArgs: (prompt) => [prompt],
  parseJsonStreamAsACP(line: string): AcpSessionUpdate | null {
    const event = JSON.parse(line);
    if (event.type === "item.completed" && event.item?.type === "agent_message") {
      return { sessionUpdate: "agent_message_chunk", content: { type: "text", text: event.item.text } };
    }
    if (event.type === "item.completed" && event.item?.type === "reasoning") {
      return { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: event.item.text } };
    }
    if (event.type === "item.started" && event.item?.type === "command_execution") {
      return { sessionUpdate: "tool_call", toolCallId: event.item.id, title: event.item.command, kind: "execute", status: "in_progress" };
    }
    if (event.type === "item.completed" && event.item?.type === "command_execution") {
      return { sessionUpdate: "tool_call_update", toolCallId: event.item.id, status: "completed", content: [{ type: "content", content: { type: "text", text: event.item.aggregated_output ?? "" } }] };
    }
    if ((event.type === "item.started" || event.type === "item.updated") && event.item?.type === "todo_list") {
      return { sessionUpdate: "plan", entries: event.item.items.map((i: { text: string; completed: boolean }) => ({ content: i.text, priority: "medium" as const, status: i.completed ? "completed" as const : "pending" as const })) };
    }
    // Additional mappings for mcp_tool_call, file_change — see section 7.2
    return null;
  },
}
```

**REQ-7: Pi Coding Agent `jsonMode`**
Pi streams JSON via `--mode json`. The parser maps `assistant_message` → `agent_message_chunk`, `tool_call` → `tool_call`, `tool_result` → `tool_call_update`, `agent_end` → final `agent_message_chunk`. Pi does not emit plan, mode, or thinking events. See section 7.3 for full mapping table.

```typescript
jsonMode: {
  jsonStreamArgs: ["--mode", "json"],
  buildPromptArgs: (prompt) => ["-p", prompt],
  parseJsonStreamAsACP(line: string): AcpSessionUpdate | null {
    const event = JSON.parse(line);
    if (event.type === "assistant_message" && Array.isArray(event.content)) {
      const text = event.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n");
      return text ? { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } : null;
    }
    if (event.type === "tool_call") {
      return { sessionUpdate: "tool_call", toolCallId: event.id, title: event.name, kind: "other", status: "in_progress" };
    }
    if (event.type === "tool_result") {
      return { sessionUpdate: "tool_call_update", toolCallId: event.id, status: "completed", content: [{ type: "content", content: { type: "text", text: JSON.stringify(event.content) } }] };
    }
    if (event.type === "agent_end" && Array.isArray(event.messages)) {
      const lastAssistant = [...event.messages].reverse().find((m: { role: string }) => m.role === "assistant");
      if (lastAssistant?.content) {
        const text = lastAssistant.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n");
        return text ? { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } : null;
      }
    }
    return null;
  },
}
```

**REQ-8: ACP prompt executor uses `--json` mode**
The ACP prompt executor (`prompt-executor.ts`) is updated to:
1. Spawn `mason run --agent {agent} --role {role} --json -p {text}` instead of the current `mason run ... -p {text}`.
2. Read stdout line by line.
3. For each line, parse it as a JSON ACP session update and call `conn.sessionUpdate()` to forward it to the editor.
4. After the process exits, send the `end_turn` stop reason as today.

**REQ-9: AcpSessionUpdate type with flat tool call fields**
A shared TypeScript type `AcpSessionUpdate` is defined (in `agent-sdk`) representing the union of supported session update objects. Tool call fields are **flat** on the session update object (intersection types), matching the official ACP spec. The following supporting types are exported: `ToolKind`, `ToolCallStatus`, `ToolCallContent`, `AcpToolCallFields`, `AcpToolCallUpdateFields`. The legacy `ToolCallInfo` interface is deprecated. Runtime validation via `validateSessionUpdate()` (in the CLI package) uses `@agentclientprotocol/sdk` Zod schemas — lenient mode logs validation errors but still forwards the update.

```typescript
type ToolKind = "read" | "edit" | "delete" | "move" | "search" | "execute" | "think" | "fetch" | "switch_mode" | "other";
type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed";
type ToolCallContent = { type: "content"; content: { type: "text"; text: string } };

interface AcpToolCallFields {
  toolCallId: string;
  title: string;
  kind?: ToolKind;
  status?: ToolCallStatus;
  content?: Array<ToolCallContent>;
}

interface AcpToolCallUpdateFields {
  toolCallId: string;
  title?: string | null;
  kind?: ToolKind | null;
  status?: ToolCallStatus | null;
  content?: Array<ToolCallContent> | null;
}

/** @deprecated Use AcpToolCallFields or AcpToolCallUpdateFields instead. */
interface ToolCallInfo { /* ... legacy nested wrapper ... */ }

type AcpSessionUpdate =
  | { sessionUpdate: "agent_message_chunk"; content: { type: "text"; text: string } }
  | ({ sessionUpdate: "tool_call" } & AcpToolCallFields)
  | ({ sessionUpdate: "tool_call_update" } & AcpToolCallUpdateFields)
  | { sessionUpdate: "agent_thought_chunk"; content: { type: "text"; text: string } }
  | { sessionUpdate: "plan"; entries: Array<{ content: string; priority: "high" | "medium" | "low"; status: "pending" | "in_progress" | "completed" }> }
  | { sessionUpdate: "current_mode_update"; modeId: string };
```

### P1 — Should-Have

**REQ-10: Verbose logging in JSON mode**
When `--json --verbose` is combined, non-ACP diagnostic lines (proxy status, build progress) are written to stderr while ACP updates go to stdout. This matches the stdout/stderr separation used by ACP transport.

**REQ-11: Graceful error streaming**
If the agent process exits with a non-zero code, emit a final error update before the process exits:
```json
{"sessionUpdate": "error", "message": "Agent exited with code 1", "code": "agent_error"}
```

### P2 — Nice-to-Have

**REQ-12: Progress events**
Agents may optionally emit progress events for long-running operations:
```json
{"sessionUpdate": "progress", "message": "Installing dependencies...", "percentage": 45}
```

---

## 7. Agent JSON Stream Formats

This section documents the proprietary JSON format each agent produces and the concrete mapping to ACP session updates. Each subsection shows actual agent output and the corresponding ACP update.

### 7.1 Claude Code (`--output-format stream-json --verbose`)

Claude emits newline-delimited JSON with top-level types: `system`, `assistant`, `stream_event`, and `result`. When `--include-partial-messages` is added, `stream_event` lines carry raw Claude API streaming events (content_block_start, content_block_delta, etc.). Without it, only complete `assistant` and `result` messages are emitted.

For this PRD we use **complete message mode** (no `--include-partial-messages`):

| Claude Event | ACP Session Update | Notes |
|---|---|---|
| `{"type": "assistant", "message": {"content": [{"type": "text", "text": "..."}]}}` | `agent_message_chunk` | Extract each `text` block from `message.content[]` |
| `{"type": "assistant", "message": {"content": [{"type": "tool_use", "id": "toolu_...", "name": "Read", "input": {"file_path": "..."}}]}}` | `tool_call` | Extract `tool_use` blocks; map `id` → `toolCallId`, `name` → `title`, set `status: "in_progress"` |
| `{"type": "assistant", "message": {"content": [{"type": "tool_result", "tool_use_id": "toolu_...", "content": "..."}]}}` | `tool_call_update` | Map to `status: "completed"` with content |
| `{"type": "result", "result": "..."}` | `agent_message_chunk` | Final summary text |

**Plan & mode:** Claude Code does not emit discrete plan or mode-change events in its stream-json format. These ACP update types are **not emitted** by the Claude parser.

**Thinking:** Claude Code's `--output-format stream-json` does not emit thinking blocks (thinking requires `--include-partial-messages` with `thinking_delta` events). If a future Claude update adds thinking to complete messages, the parser should map them to `agent_thought_chunk`.

### 7.2 Codex (`exec --json`)

Codex emits NDJSON with lifecycle events (`thread.started`, `turn.started`, `turn.completed`, `turn.failed`) and item events (`item.started`, `item.updated`, `item.completed`). Item types include: `agent_message`, `reasoning`, `command_execution`, `file_change`, `mcp_tool_call`, `web_search`, `todo_list`, and `error`.

| Codex Event | ACP Session Update | Notes |
|---|---|---|
| `{"type": "item.completed", "item": {"id": "item_3", "type": "agent_message", "text": "Done. I updated the docs."}}` | `agent_message_chunk` | Map `item.text` → `content.text` |
| `{"type": "item.completed", "item": {"id": "item_0", "type": "reasoning", "text": "**Scanning docs...**"}}` | `agent_thought_chunk` | Map `item.text` → `content.text` |
| `{"type": "item.started", "item": {"id": "item_1", "type": "command_execution", "command": "bash -lc ls", "status": "in_progress"}}` | `tool_call` | Map `item.id` → `toolCallId`, `item.command` → `title`, `kind: "execute"`, `status: "in_progress"` |
| `{"type": "item.completed", "item": {"id": "item_1", "type": "command_execution", "command": "bash -lc ls", "aggregated_output": "docs\nsrc\n", "exit_code": 0, "status": "completed"}}` | `tool_call_update` | Map `aggregated_output` → content, `status: "completed"` |
| `{"type": "item.completed", "item": {"id": "item_4", "type": "file_change", "changes": [{"path": "docs/foo.md", "kind": "add"}], "status": "completed"}}` | `tool_call_update` | Map `changes` array to content text summary, `kind: "file_change"` |
| `{"type": "item.started", "item": {"id": "item_5", "type": "mcp_tool_call", "server": "docs", "tool": "search", "arguments": {"q": "exec"}, "status": "in_progress"}}` | `tool_call` | Map `server/tool` → `title` (e.g. "docs:search"), `kind: "other"` |
| `{"type": "item.completed", "item": {"id": "item_5", "type": "mcp_tool_call", "result": {"content": [...]}, "status": "completed"}}` | `tool_call_update` | Map `result.content` → content |
| `{"type": "item.started", "item": {"id": "item_8", "type": "todo_list", "items": [{"text": "Scan docs", "completed": false}]}}` | `plan` | Map `items[]` → `entries[]`: `text` → `content`, `completed: false` → `status: "pending"`, all `priority: "medium"` |
| `{"type": "item.updated", "item": {"id": "item_8", "type": "todo_list", "items": [{"text": "Scan docs", "completed": true}, {"text": "Write code", "completed": false}]}}` | `plan` | Re-emit full plan. Map `completed: true` → `status: "completed"`, `completed: false` → `status: "in_progress"` for the first incomplete item, `"pending"` for the rest |
| `{"type": "turn.completed", "usage": {...}}` | *(skip)* | End of stream signal |
| `{"type": "turn.failed", "error": {"message": "..."}}` | *(skip — handled by REQ-11)* | |

**Mode:** Codex does not emit mode-change events. `current_mode_update` is **not emitted** by the Codex parser.

### 7.3 Pi Coding Agent (`--mode json`)

Pi emits JSON events for each step of its agent loop. The exact event schema is defined in the pi-coding-agent source.

| Pi Event | ACP Session Update | Notes |
|---|---|---|
| `{"type": "assistant_message", "content": [{"type": "text", "text": "..."}]}` | `agent_message_chunk` | Extract text blocks from `content[]` |
| `{"type": "tool_call", "name": "...", "id": "...", "input": {...}}` | `tool_call` | Map `id` → `toolCallId`, `name` → `title`, `kind: "other"` |
| `{"type": "tool_result", "id": "...", "content": [...]}` | `tool_call_update` | Map `id` → `toolCallId`, `status: "completed"`, content from `content[]` |
| `{"type": "agent_end", "messages": [...]}` | `agent_message_chunk` | Extract last assistant message's text blocks as final summary |

**Plan, mode, thinking:** Pi does not emit plan, mode-change, or thinking events. These ACP update types are **not emitted** by the Pi parser.

> **Note:** Pi's JSON event schema should be verified against the pi-coding-agent source during implementation. If Pi adds plan or thinking events in the future, the parser should be updated to map them.

---

## 8. Integration Points

### 8.1 `AgentPackage` (agent-sdk)
- New `jsonMode` property added to the `AgentPackage` interface.
- New `AcpSessionUpdate` type exported from agent-sdk with flat tool call fields (intersection types).
- New supporting types exported: `AcpToolCallFields`, `AcpToolCallUpdateFields`, `ToolKind`, `ToolCallStatus`, `ToolCallContent`.
- Deprecated: `ToolCallInfo` (still exported for backwards compatibility).

### 8.2 `run-agent.ts` (cli)
- New `--json` flag on the `run` command.
- New `runAgentJsonMode()` function (parallel to `runAgentPrintMode()`).
- JSON mode writes each ACP update line to stdout immediately (no buffering).

### 8.3 `generateAgentLaunchJson()` (agent-sdk helpers)
- When `jsonMode` is active, append `jsonMode.jsonStreamArgs` and prompt args (same pattern as print mode).
- New `MaterializeOptions.jsonMode?: boolean` flag.

### 8.4 `prompt-executor.ts` (cli/acp)
- Switch from collecting stdout to streaming line-by-line.
- Each JSON line is parsed and forwarded as `conn.sessionUpdate()`.

### 8.5 Agent packages (mason-extensions)
- `claude-code-agent`: Add `jsonMode` with Claude stream-json parser.
- `codex-agent`: Add `jsonMode` with Codex NDJSON parser.
- `pi-coding-agent`: Add `jsonMode` with Pi JSON parser.

---

## 9. Resolved Decisions

1. **ACP thinking type:** Use `agent_thought_chunk` as the session update type for thinking/reasoning blocks, following the ACP `session/update` envelope format.
2. **Tool call streaming:** Emit `tool_call` and `tool_result` as separate events as they arrive from the agent. Do not wait for the result before emitting the call.
3. **Codex approval bypass:** JSON mode uses the same `--dangerously-bypass-approvals-and-sandbox` flag as print mode. Interactive approval via ACP is a future phase.
4. **Flat tool call fields:** Tool call fields (`toolCallId`, `title`, `kind`, `status`, `content`) are flat on the session update object, matching the official ACP spec. The earlier nested `toolCall` wrapper approach was replaced.
5. **Runtime validation:** `validateSessionUpdate()` in the CLI validates each ACP session update against `@agentclientprotocol/sdk` Zod schemas. Validation is **lenient** — errors are logged but the update is still forwarded. This catches spec drift without breaking streaming.
6. **Codex kind mapping:** Codex `command_execution` events map to `kind: "execute"` (an ACP `ToolKind` value), not `"command_execution"` (which is a Codex item type).

## 10. Open Questions

1. **Error recovery:** If `parseJsonStreamAsACP` throws for a line, should the line be silently skipped (current proposal) or should a warning be emitted to stderr?
