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
```json
{"sessionUpdate": "tool_call", "id": "call_123", "name": "read_file", "input": {"path": "src/index.ts"}}
```

#### `tool_result` — Result of a tool invocation
```json
{"sessionUpdate": "tool_result", "id": "call_123", "content": [{"type": "text", "text": "file contents..."}]}
```

#### `agent_thought_chunk` — Agent reasoning/thinking block
```json
{"sessionUpdate": "agent_thought_chunk", "content": {"type": "text", "text": "I need to analyze the function signature first..."}}
```

#### `plan` — Execution plan with prioritized entries
```json
{"sessionUpdate": "plan", "entries": [{"id": "1", "title": "Read config files", "priority": 1, "status": "completed"}, {"id": "2", "title": "Update schema types", "priority": 2, "status": "in_progress"}, {"id": "3", "title": "Add unit tests", "priority": 3, "status": "pending"}]}
```

#### `current_mode_update` — Agent mode change
```json
{"sessionUpdate": "current_mode_update", "mode": "planning", "message": "Switching to planning mode to design the approach"}
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
Claude's JSON stream uses `--output-format stream-json --verbose`. The parser maps:
- `type: "assistant"` events with text content → `agent_message_chunk`
- `type: "tool_use"` events → `tool_call`
- `type: "tool_result"` events → `tool_result`
- `type: "thinking"` events → `agent_thought_chunk`
- `type: "result"` → final `agent_message_chunk` (captures the summary)

```typescript
jsonMode: {
  jsonStreamArgs: ["--output-format", "stream-json", "--verbose"],
  buildPromptArgs: (prompt) => ["-p", prompt],
  parseJsonStreamAsACP(line: string): AcpSessionUpdate | null {
    const event = JSON.parse(line);
    // Map claude stream-json events to ACP session updates
    // (implementation details per claude's stream-json schema)
  },
}
```

**REQ-6: Codex Agent `jsonMode`**
Codex streams NDJSON via `exec --json`. The parser maps:
- `type: "item.completed"` with `item.type: "agent_message"` → `agent_message_chunk`
- `type: "item.completed"` with `item.type: "tool_call"` → `tool_call`
- `type: "item.completed"` with `item.type: "tool_result"` → `tool_result`
- `type: "turn.completed"` → signals end of stream (no ACP update needed)

```typescript
jsonMode: {
  jsonStreamArgs: ["exec", "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check", "--json"],
  buildPromptArgs: (prompt) => [prompt],
  parseJsonStreamAsACP(line: string, previousLine?: string): AcpSessionUpdate | null {
    const event = JSON.parse(line);
    // Map codex NDJSON events to ACP session updates
  },
}
```

**REQ-7: Pi Coding Agent `jsonMode`**
Pi streams JSON via `--mode json`. The parser maps:
- `type: "assistant_message"` events → `agent_message_chunk`
- `type: "tool_call"` events → `tool_call`
- `type: "tool_result"` events → `tool_result`
- `type: "agent_end"` → final summary as `agent_message_chunk`

```typescript
jsonMode: {
  jsonStreamArgs: ["--mode", "json"],
  buildPromptArgs: (prompt) => ["-p", prompt],
  parseJsonStreamAsACP(line: string): AcpSessionUpdate | null {
    const event = JSON.parse(line);
    // Map pi JSON events to ACP session updates
  },
}
```

**REQ-8: ACP prompt executor uses `--json` mode**
The ACP prompt executor (`prompt-executor.ts`) is updated to:
1. Spawn `mason run --agent {agent} --role {role} --json -p {text}` instead of the current `mason run ... -p {text}`.
2. Read stdout line by line.
3. For each line, parse it as a JSON ACP session update and call `conn.sessionUpdate()` to forward it to the editor.
4. After the process exits, send the `end_turn` stop reason as today.

**REQ-9: AcpSessionUpdate type**
A shared TypeScript type `AcpSessionUpdate` is defined (in `agent-sdk`) representing the union of supported session update objects. This type is used by `parseJsonStreamAsACP` return values and by the ACP consumer.

```typescript
type AcpSessionUpdate =
  | { sessionUpdate: "agent_message_chunk"; content: { type: "text"; text: string } }
  | { sessionUpdate: "tool_call"; id: string; name: string; input: Record<string, unknown> }
  | { sessionUpdate: "tool_result"; id: string; content: Array<{ type: "text"; text: string }> }
  | { sessionUpdate: "agent_thought_chunk"; content: { type: "text"; text: string } }
  | { sessionUpdate: "plan"; entries: Array<{ id: string; title: string; priority: number; status: "pending" | "in_progress" | "completed" }> }
  | { sessionUpdate: "current_mode_update"; mode: string; message?: string };
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

This section documents the proprietary JSON format each agent produces and how it maps to ACP session updates. This serves as a reference for implementing `parseJsonStreamAsACP` per agent.

### 7.1 Claude Code (`--output-format stream-json --verbose`)

Claude emits newline-delimited JSON objects. Key event types:

| Claude Event | ACP Session Update |
|---|---|
| `{"type": "assistant", "message": {"content": [{"type": "text", "text": "..."}]}}` | `agent_message_chunk` |
| `{"type": "tool_use", "tool": {"name": "...", "id": "...", "input": {...}}}` | `tool_call` |
| `{"type": "tool_result", "tool": {"id": "...", "output": "..."}}` | `tool_result` |
| `{"type": "thinking", "thinking": {"text": "..."}}` | `agent_thought_chunk` |
| `{"type": "result", "result": "..."}` | `agent_message_chunk` (final) |
| Events containing plan/todo list data | `plan` |
| Events indicating mode changes (e.g., plan mode, code mode) | `current_mode_update` |

> **Note:** The exact field paths in Claude's stream-json format should be verified against the latest Claude Code CLI documentation during implementation. Not all agents emit plan or mode events — parsers should map them when the agent's native format includes equivalent data.

### 7.2 Codex (`exec --json`)

Codex emits NDJSON with an event-driven model:

| Codex Event | ACP Session Update |
|---|---|
| `{"type": "item.completed", "item": {"type": "agent_message", "text": "..."}}` | `agent_message_chunk` |
| `{"type": "item.completed", "item": {"type": "tool_call", "name": "...", "id": "...", "arguments": "..."}}` | `tool_call` |
| `{"type": "item.completed", "item": {"type": "tool_result", "id": "...", "output": "..."}}` | `tool_result` |
| `{"type": "turn.completed"}` | *(end of stream — no ACP update)* |

> **Note:** Codex's exact NDJSON schema should be verified against `codex exec --json` output during implementation.

### 7.3 Pi Coding Agent (`--mode json`)

Pi emits JSON events for each step of its agent loop:

| Pi Event | ACP Session Update |
|---|---|
| `{"type": "assistant_message", "content": [{"type": "text", "text": "..."}]}` | `agent_message_chunk` |
| `{"type": "tool_call", "name": "...", "id": "...", "input": {...}}` | `tool_call` |
| `{"type": "tool_result", "id": "...", "content": [...]}` | `tool_result` |
| `{"type": "agent_end", "messages": [...]}` | `agent_message_chunk` (final summary) |

> **Note:** Pi's JSON event schema should be verified against the pi-coding-agent source during implementation.

---

## 8. Integration Points

### 8.1 `AgentPackage` (agent-sdk)
- New `jsonMode` property added to the `AgentPackage` interface.
- New `AcpSessionUpdate` type exported from agent-sdk.

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

## 10. Open Questions

1. **Error recovery:** If `parseJsonStreamAsACP` throws for a line, should the line be silently skipped (current proposal) or should a warning be emitted to stderr?
