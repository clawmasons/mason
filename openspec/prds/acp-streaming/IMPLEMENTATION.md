# ACP Streaming — Implementation Plan

**PRD:** [openspec/prds/acp-streaming/PRD.md](./PRD.md)
**Phase:** P0 (Core Streaming)

---

## Implementation Steps

### CHANGE 1: AcpSessionUpdate Type & jsonMode Interface

Add the shared `AcpSessionUpdate` discriminated union type and the `jsonMode` property to `AgentPackage` in `agent-sdk`.

**PRD refs:** REQ-9 (AcpSessionUpdate type), REQ-2 (jsonMode on AgentPackage), REQ-3 (jsonMode independent of printMode)

**Summary:** Define the `AcpSessionUpdate` type (union of `agent_message_chunk`, `tool_call`, `tool_call_update`, `agent_thought_chunk`, `plan`, `current_mode_update`) with flat tool call fields (intersection types matching the ACP spec) in `packages/agent-sdk/src/types.ts`. Define supporting types: `ToolKind`, `ToolCallStatus`, `ToolCallContent`, `AcpToolCallFields`, `AcpToolCallUpdateFields`. Deprecate the legacy `ToolCallInfo` interface (kept for backwards compatibility). Add the optional `jsonMode` property to `AgentPackage` — structurally parallel to the existing `printMode` but with `parseJsonStreamAsACP` returning `AcpSessionUpdate | null` instead of extracting a final result string. Export all new types from the agent-sdk barrel.

**User Story:** As an agent package author, I want a well-typed `jsonMode` field on `AgentPackage` with a clear `AcpSessionUpdate` return type, so that I can implement my agent's JSON-to-ACP parser with compile-time safety.

**Scope:**
- Modify: `packages/agent-sdk/src/types.ts` — add `ToolKind`, `ToolCallStatus`, `ToolCallContent`, `AcpToolCallFields`, `AcpToolCallUpdateFields`, `AcpSessionUpdate` (flat intersection types), deprecated `ToolCallInfo`, `jsonMode` on `AgentPackage`
- Modify: `packages/agent-sdk/src/index.ts` — export all new types (`AcpSessionUpdate`, `AcpToolCallFields`, `AcpToolCallUpdateFields`, `ToolKind`, `ToolCallStatus`, `ToolCallContent`, `ToolCallInfo`)
- New test: `packages/agent-sdk/tests/acp-session-update.test.ts` — type validation tests (verify discriminated union works, parser signature matches)

**Testable output:** `npx tsc --noEmit` passes. Unit tests verify that objects conforming to each `AcpSessionUpdate` variant are accepted, and that `jsonMode.parseJsonStreamAsACP` has the correct signature.

**Implemented** — PR #238

---

### CHANGE 2: Claude Code Agent jsonMode Parser

Add `jsonMode` to the Claude Code agent package with a parser that maps Claude's `--output-format stream-json --verbose` output to ACP session updates.

**PRD refs:** REQ-5 (Claude Code Agent jsonMode), PRD §7.1 (Claude JSON stream format)

**Summary:** Implement `jsonMode` on the Claude Code agent package: `jsonStreamArgs: ["--output-format", "stream-json", "--verbose"]`, `buildPromptArgs: (prompt) => ["-p", prompt]`, and `parseJsonStreamAsACP` that maps `assistant` events (text blocks → `agent_message_chunk`, tool_use blocks → `tool_call`), tool_result → `tool_call_update`, and `result` → final `agent_message_chunk`. Claude does not emit plan, mode, or thinking events.

**User Story:** As an editor user running a Claude-backed agent, I want to see Claude's text responses and tool calls streamed in real time, so I can follow what the agent is doing without waiting for the full turn to complete.

**Scope:**
- Modify: Claude Code agent package definition — add `jsonMode` property
- New test: parser unit tests with fixture lines from Claude's stream-json output
- Test cases: `assistant` with text block, `assistant` with `tool_use` block, `assistant` with `tool_result`, `result` event, unknown/system events return null, malformed JSON logs and returns null

**Testable output:** Unit tests pass. Given real Claude stream-json lines as input, `parseJsonStreamAsACP` returns correctly typed `AcpSessionUpdate` objects.

**Implemented** — PR #239

---

### CHANGE 3: Codex Agent jsonMode Parser

Add `jsonMode` to the Codex agent package with a parser that maps Codex's `exec --json` NDJSON output to ACP session updates.

**PRD refs:** REQ-6 (Codex Agent jsonMode), PRD §7.2 (Codex JSON stream format)

**Summary:** Implement `jsonMode` on the Codex agent package: `jsonStreamArgs: ["exec", "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check", "--json"]`, `buildPromptArgs: (prompt) => [prompt]`, and `parseJsonStreamAsACP` mapping: `item.completed` + `agent_message` → `agent_message_chunk`, `reasoning` → `agent_thought_chunk`, `command_execution` started/completed → `tool_call`/`tool_call_update`, `file_change` → `tool_call_update`, `mcp_tool_call` → `tool_call`/`tool_call_update`, `todo_list` → `plan`. Codex is the richest parser — it produces plan and thinking events that Claude and Pi do not. **Note:** Codex `command_execution` events map to `kind: "execute"` (an ACP `ToolKind` value), not `"command_execution"` (which is a Codex item type, not a valid ACP kind).

**User Story:** As an editor user running a Codex-backed agent, I want to see Codex's reasoning, command executions, file changes, and todo list progress streamed in real time.

**Scope:**
- Modify: Codex agent package definition — add `jsonMode` property
- New test: parser unit tests with fixture lines from Codex NDJSON output
- Test cases: all item types (agent_message, reasoning, command_execution start/complete, file_change, mcp_tool_call start/complete, todo_list start/update), lifecycle events (turn.completed, turn.failed) return null

**Testable output:** Unit tests pass. Codex NDJSON fixture lines produce correct `AcpSessionUpdate` objects including `plan` entries with correct status mapping.

**Implemented** — PR #240

---

### CHANGE 4: Pi Coding Agent jsonMode Parser

Add `jsonMode` to the Pi Coding Agent package with a parser that maps Pi's `--mode json` output to ACP session updates.

**PRD refs:** REQ-7 (Pi Coding Agent jsonMode), PRD §7.3 (Pi JSON stream format)

**Summary:** Implement `jsonMode` on the Pi Coding Agent package: `jsonStreamArgs: ["--mode", "json"]`, `buildPromptArgs: (prompt) => ["-p", prompt]`, and `parseJsonStreamAsACP` mapping: `assistant_message` → `agent_message_chunk`, `tool_call` → `tool_call`, `tool_result` → `tool_call_update`, `agent_end` → final `agent_message_chunk` (extract last assistant message). Pi does not emit plan, mode, or thinking events.

**User Story:** As an editor user running a Pi-backed agent, I want to see Pi's assistant messages, tool calls, and tool results streamed in real time.

**Scope:**
- Modify: Pi Coding Agent package definition — add `jsonMode` property
- New test: parser unit tests with fixture lines from Pi's JSON output
- Test cases: `assistant_message` with text blocks, `tool_call`, `tool_result`, `agent_end` with messages array, events with no text content return null

**Testable output:** Unit tests pass. Pi JSON fixture lines produce correct `AcpSessionUpdate` objects.

**Implemented** — PR #241

---

### CHANGE 5: generateAgentLaunchJson — jsonMode Support

Extend `generateAgentLaunchJson()` in agent-sdk to support `jsonMode` materialization, parallel to existing `printMode` support.

**PRD refs:** REQ-2 (jsonMode on AgentPackage), PRD §8.3 (generateAgentLaunchJson)

**Summary:** Add a `jsonMode?: boolean` flag to `MaterializeOptions` (or equivalent options type). When `jsonMode=true` and the agent has `jsonMode` defined, append `jsonMode.jsonStreamArgs` to the command and use `jsonMode.buildPromptArgs` (defaulting to `["-p", prompt]`) to build prompt arguments. This follows the exact same pattern as the existing `printMode` materialization at `packages/agent-sdk/src/helpers.ts:159-163`.

**User Story:** As a developer building the `mason run --json` command, I need `generateAgentLaunchJson` to produce the correct agent-launch.json with JSON streaming args, so that the Docker container runs the agent in JSON mode.

**Scope:**
- Modify: `packages/agent-sdk/src/helpers.ts` — add `jsonMode` branch parallel to `printMode`
- Update tests: `packages/agent-sdk/tests/helpers.test.ts` — verify jsonMode args are appended, buildPromptArgs is called, default prompt args work

**Testable output:** Unit tests pass. Given an agent with `jsonMode`, `generateAgentLaunchJson({ jsonMode: true, initialPrompt: "fix the bug" })` produces a launch JSON with the correct streaming args and prompt args.

**Implemented** — PR #242

---

### CHANGE 6: `mason run --json` CLI Mode

Add the `--json` flag to `mason run` that executes the agent in JSON streaming mode, writing newline-delimited ACP session update objects to stdout.

**PRD refs:** REQ-1 (--json CLI flag), REQ-4 (JSON mode execution in run-agent)

**Summary:** Add `--json` flag to the run command (mutually exclusive with `--print`). When active, follow the same Docker lifecycle as print mode (compose build → proxy start → host proxy → compose run) but instead of collecting a final result, read stdout line by line, pass each line through `agentPkg.jsonMode.parseJsonStreamAsACP()`, and write each non-null result as a JSON line to process stdout immediately. Error handling: wrap `parseJsonStreamAsACP` in try/catch — exceptions are logged to stderr and the line is skipped.

**User Story:** As an agent operator, I run `mason run --agent my-agent --role dev --json -p "fix the tests"` and see newline-delimited ACP session update JSON objects streaming to my terminal in real time — text chunks, tool calls, tool results — as the agent works.

**Scope:**
- Modify: `packages/cli/src/cli/commands/run-agent.ts` — add `--json` flag, add `runAgentJsonMode()` function
- Reuse: existing print mode Docker lifecycle orchestration
- New test: `packages/cli/tests/cli/run-agent-json.test.ts` — verify flag parsing, mutual exclusivity with `--print`, JSON output format

**Testable output:** `mason run --json` streams NDJSON to stdout. Each line parses as a valid `AcpSessionUpdate`. Malformed agent lines are skipped (logged to stderr). Process exits cleanly.

**Implemented** — PR #243

---

### CHANGE 7: ACP Prompt Executor Streaming

Update the ACP prompt executor to use `--json` mode and stream each parsed line as a `conn.sessionUpdate()` to the editor in real time.

**PRD refs:** REQ-8 (ACP prompt executor uses --json mode)

**Summary:** Modify `prompt-executor.ts` to spawn `mason run --agent {agent} --role {role} --json -p {text}` instead of the current print mode invocation. Read stdout line by line. For each line, parse it as a JSON `AcpSessionUpdate` and call `conn.sessionUpdate({ sessionId, update })` to forward it to the editor. After the process exits, send the `end_turn` stop reason as today. This replaces the current "wait for full result then send one chunk" behavior with real-time streaming.

**User Story:** As an editor user, when I send a prompt to an ACP agent, I see the agent's messages, tool calls, and reasoning appear in my editor in real time — just like watching a terminal session — instead of waiting minutes for a single final response.

**Scope:**
- Modify: `packages/cli/src/acp/prompt-executor.ts` — switch from stdout collection to line-by-line streaming with `conn.sessionUpdate()`
- Update: `packages/cli/src/acp/acp-agent.ts` — pass `conn` or a streaming callback to the prompt executor
- New test: `packages/cli/tests/acp/prompt-executor-streaming.test.ts` — verify each NDJSON line triggers a `sessionUpdate` call, verify `end_turn` sent after process exit, verify malformed lines are skipped

**Testable output:** ACP prompt execution streams updates to the editor. Each `AcpSessionUpdate` line from `mason run --json` becomes a `conn.sessionUpdate()` call. Editor sees real-time agent activity. `end_turn` is sent after process exit.

**Implemented** — PR #244

---

### CHANGE 8: ACP Spec Compliance — Flat Tool Call Fields & Runtime Validation

Align ACP session update types and parser output with the official ACP spec: flatten tool call fields, add proper ACP types, fix Codex kind values, and add runtime validation.

**PRD refs:** REQ-9 (AcpSessionUpdate type), §7.2 (Codex mapping), §9 (Resolved Decisions)

**Summary:** This change brings the implementation into compliance with the official ACP spec as defined by `@agentclientprotocol/sdk`:

1. **Flat tool call fields:** Replace the nested `toolCall` wrapper with intersection types (`{ sessionUpdate: "tool_call" } & AcpToolCallFields`). Fields like `toolCallId`, `title`, `kind`, `status`, and `content` are now flat on the session update object.
2. **New supporting types:** Add `ToolKind` (union of ACP tool kinds), `ToolCallStatus`, `ToolCallContent`, `AcpToolCallFields` (for `tool_call`), `AcpToolCallUpdateFields` (for `tool_call_update` — only `toolCallId` required, others nullable).
3. **Codex kind alignment:** Codex `command_execution` events now map to `kind: "execute"` (a valid ACP `ToolKind`), not `"command_execution"` (which was a Codex item type).
4. **Runtime validation:** New `validateSessionUpdate()` function uses `@agentclientprotocol/sdk` Zod schemas to validate each session update at runtime. Validation is lenient — errors are logged to stderr but the update is still forwarded.
5. **Deprecated `ToolCallInfo`:** The legacy nested wrapper interface is deprecated but still exported for backwards compatibility.

**User Story:** As an ACP integration, I want session updates to conform to the official ACP spec schema, so that spec-compliant ACP clients can consume them without transformation.

**Scope:**
- Modify: `packages/agent-sdk/src/types.ts` — flatten `AcpSessionUpdate`, add new types, deprecate `ToolCallInfo`
- Modify: `packages/agent-sdk/src/index.ts` — export new types
- Modify: `packages/agent-sdk/tests/acp-session-update.test.ts` — update tests for flat fields
- New: `packages/cli/src/acp/validate-session-update.ts` — runtime validation using `@agentclientprotocol/sdk` Zod schemas
- Modify: `packages/cli/src/cli/commands/run-agent.ts` — call `validateSessionUpdate()` on each parsed update
- Modify: `packages/cli/src/acp/acp-agent.ts` — validate updates before forwarding
- Modify: all agent `parseJsonStreamAsACP` implementations and their tests — emit flat fields, use `kind: "execute"` for Codex
- Modify: `packages/cli/tests/acp/mock-agent-packages.ts` — update mock fixtures for flat fields

**Testable output:** `npx tsc --noEmit` passes. All existing ACP streaming tests updated for flat fields. Validation logs errors for non-conforming updates but does not block them.

**Implemented** — commit 797d0fa
