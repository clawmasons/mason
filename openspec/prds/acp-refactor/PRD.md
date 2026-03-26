# ACP Refactor — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** ClawForge, Inc.

---

## 1. Problem Statement

The current ACP (Agent Communication Protocol) implementation was never fully functional. It uses a complex three-layer architecture that bridges between an editor, a host process, and a Docker container running an ACP agent. This approach has several problems:

- **Unnecessary complexity:** The Docker-bridging architecture (`AcpSession`, `AcpSdkBridge`, `AcpAgent`) mediates between editor and container for every protocol message, adding latency and failure modes.
- **Coupled to Docker lifecycle:** ACP mode starts Docker infrastructure on `session/new`, tying editor integration to container orchestration. Agents don't need to be running until the client sends the first prompt.
- **Not functional:** The implementation was never completed to a working state, making it dead code that adds maintenance burden.
- **Redundant with `run-agent --print`:** The core capability needed — running an agent with a prompt and getting results — already exists in `run-agent`'s print mode. ACP should delegate to it rather than reimplementing agent execution.
- **Custom protocol handling:** The old implementation manually parses and constructs ACP JSON-RPC messages. The official `@agentclientprotocol/sdk` package now provides a standard TypeScript SDK for this.

---

## 2. Goals

### User Goals
- Editor extensions (VS Code, Zed, etc.) can communicate with mason via the ACP protocol to run agents interactively.
- Users can select which agent and role to use from within the editor via `configOptions`.
- Sessions persist across prompts, allowing conversation continuity.
- Available slash commands from the active role are surfaced to the editor.

### Business Goals
- Provide a working, protocol-compliant ACP integration that editors can use immediately.
- Simplify the codebase by removing the Docker-bridging ACP code.
- Reuse existing `run-agent` infrastructure rather than maintaining parallel execution paths.
- Use the official `@agentclientprotocol/sdk` to ensure protocol compliance and reduce maintenance burden.

### Measurable Outcomes
- `mason acp` starts an ACP agent that handles the full protocol lifecycle (initialize → session/new → prompt → end_turn).
- Old ACP code (`packages/cli/src/acp/`, `packages/mcp-agent/src/acp-agent.ts`) is removed.
- Each `session/prompt` delegates to `run-agent --print` and returns results via the ACP protocol.
- All ACP messages conform to the [Agent Client Protocol specification](https://agentclientprotocol.com/protocol/overview).

---

## 3. Non-Goals

- **Streaming responses:** Initial implementation sends the final agent message as a single `agent_message_chunk`. Real-time streaming will be added later.
- **Persistent agent process:** Each prompt runs a fresh `run-agent --print` invocation. Long-running agent processes are a future enhancement.
- **Multi-turn context within a single prompt:** The agent receives the current prompt only. Session history/context is a future enhancement.
- **Interactive tool approval:** The ACP protocol supports `session/request_permission` (agent → client), but tool calls are handled by the agent in `--print` mode for now. Interactive permission prompts from the editor are out of scope.
- **File system access:** The ACP protocol supports `fs/read_text_file` and `fs/write_text_file` (agent → client). These are not implemented in this phase.
- **Terminal access:** The ACP protocol supports `terminal/*` methods. These are not implemented in this phase.
- **Docker integration:** This PRD explicitly removes Docker-based ACP. Container-based agent execution remains available via `mason run` (non-ACP modes).
- **HTTP transport:** The ACP spec defines HTTP transport as a draft. We only implement stdio transport.
- **Session forking/resuming:** The ACP protocol supports `session/fork` and `session/resume` (both unstable). Not implemented.
- **Authentication:** The ACP protocol supports `authenticate` method. Not needed for local stdio transport.

---

## 4. User Stories

**US-1:** As an editor extension developer, I want to spawn `mason acp` as a subprocess and communicate via newline-delimited JSON-RPC 2.0 on stdin/stdout, so that I can integrate mason as an ACP-compliant agent.

**US-2:** As an editor user, I want `session/new` to return a list of available agents and roles as `configOptions`, so that I can select which agent and role to use from within my editor.

**US-3:** As an editor user, I want to send a `session/prompt` with `ContentBlock[]` and receive the agent's response as `agent_message_chunk` updates followed by an `end_turn` stop reason, so that I can see the agent's output in my editor.

**US-4:** As an editor user, I want to switch agents or roles mid-session via `session/set_config_option`, so that I can change my workflow without creating a new session.

**US-5:** As an editor user, I want to resume a previous session via `session/load`, so that I can continue where I left off.

**US-6:** As an editor extension, I want to receive `available_commands_update` via `session/update` with the active role's source tasks, so that I can present slash commands to the user.

**US-7:** As an editor extension, I want to list all sessions via `session/list` with optional `cwd` filtering and cursor-based pagination, so that I can present a session picker to the user.

**US-8:** As an editor extension, I want to cancel an in-progress prompt via `session/cancel`, so that I can interrupt long-running agent operations.

---

## 5. Requirements

### P0 — Must-Have

**REQ-001: Top-Level `mason acp` Command**

Register `mason acp` as a top-level CLI command. When invoked, it creates an `AgentSideConnection` from `@agentclientprotocol/sdk` using stdio transport (stdin/stdout with newline-delimited JSON-RPC 2.0). The command does not start any Docker infrastructure.

The SDK dependency `@agentclientprotocol/sdk` (v0.17.x) is added to the `packages/cli` package.

Acceptance criteria:
- Given a user runs `mason acp`, then the process starts and waits for ACP protocol messages on stdin.
- Given the process is running, when it receives JSON-RPC 2.0 messages on stdin, then it processes them via the SDK's `AgentSideConnection` and writes JSON-RPC 2.0 responses to stdout.
- Given the process, it MUST NOT write anything to stdout that is not a valid ACP message (per spec). Diagnostic output goes to stderr.

**REQ-002: SDK Integration — `AgentSideConnection`**

Implement the mason ACP agent using the `AgentSideConnection` class from `@agentclientprotocol/sdk`. The agent is created by providing a factory function `(conn: AgentSideConnection) => Agent` that returns handler implementations for each ACP method.

```typescript
import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk";

const connection = new AgentSideConnection(
  (conn) => ({
    initialize: async (params) => { /* REQ-004 */ },
    newSession: async (params) => { /* REQ-005 */ },
    prompt: async (params) => { /* REQ-006 */ },
    cancel: async (params) => { /* REQ-009 */ },
    loadSession: async (params) => { /* REQ-007 */ },
    listSessions: async (params) => { /* REQ-008 */ },
    closeSession: async (params) => { /* REQ-010 */ },
    setConfigOption: async (params) => { /* REQ-011 */ },
  }),
  ndJsonStream({ readable: process.stdin, writable: process.stdout })
);
```

Session update notifications are sent via `conn.sessionUpdate()`.

Acceptance criteria:
- Given the agent implementation, all handlers are registered via the SDK's `Agent` interface.
- Given the SDK's `ndJsonStream()` utility, stdio transport is correctly initialized from `process.stdin`/`process.stdout`.

**REQ-003: Role and Agent Discovery (Deferred to `session/new`)**

Role and agent discovery is **not** performed at startup. The `mason acp` process does not know which project directory to inspect until the client sends `session/new` with a `cwd` parameter. Discovery happens per-session:

1. On `session/new`, use the provided `cwd` as the project directory.
2. Discover all available roles (project-local + packaged) using `discoverRoles(cwd)` from `packages/shared/src/role/discovery.ts`.
3. If no non-packaged (project-local) roles are available, create a default project role in `{cwd}/.mason/roles/project/ROLE.md`.
4. Discover/seed default agents using `createAgentRegistry()` from `packages/agent-sdk/src/discovery.ts`, scoped to `cwd`.

This logic must share code with `run-agent` — no duplication.

Discovery results are cached per `cwd` so that subsequent `session/new` calls for the same project directory reuse the cached roles and agents (cache can be invalidated by `session/set_config_option` if needed).

Acceptance criteria:
- Given `mason acp` starts, it does NOT attempt to discover roles or agents (no project context yet).
- Given a `session/new` with `cwd: "/path/to/project"`, then roles and agents are discovered relative to that `cwd`.
- Given a project with no `.mason/roles/` directory, when `session/new` is called with its `cwd`, then a default project role is created.
- Given a project with existing roles and agents, when `session/new` is called, then all are discovered and returned as `configOptions`.

**REQ-004: `initialize` Handler**

Implement the `initialize` handler. Receive `InitializeRequest` (containing `protocolVersion`, `clientCapabilities`, `clientInfo`) and return `InitializeResponse`.

Store the client's capabilities for later use (e.g., to know if `fs` or `terminal` methods are available).

Response (per ACP spec):
```json
{
  "protocolVersion": 1,
  "agentCapabilities": {
    "loadSession": true,
    "promptCapabilities": {
      "image": true,
      "audio": false,
      "embeddedContext": true
    },
    "mcpCapabilities": {
      "http": true,
      "sse": false
    },
    "sessionCapabilities": {
      "list": {},
      "close": {}
    }
  },
  "agentInfo": {
    "name": "mason",
    "title": "Mason",
    "version": "{package-version}"
  }
}
```

Note: The `mcpCapabilities` field (not `mcp`) aligns with the user-facing protocol. If the SDK uses `mcp`, map accordingly.

Acceptance criteria:
- Given an `initialize` request with `protocolVersion: 1`, then the response echoes `protocolVersion: 1`.
- Given the response, `agentInfo.version` matches the mason CLI package version.
- Given the response, `loadSession: true` and `sessionCapabilities` includes `list` and `close`.

**REQ-005: `session/new` (`newSession`) Handler**

Handle `session/new`. Receive `NewSessionRequest` (containing `cwd`, optional `mcpServers`).

First, perform role and agent discovery using the provided `cwd` (see REQ-003). Then create a new session with a UUID, store it at `{cwd}/.mason/sessions/{sessionId}/`, and return `NewSessionResponse`:
- `sessionId` — generated UUID
- `configOptions` — array of `SessionConfigOption` with two `select` options:
  - **role** (`id: "role"`, `category: "role"`) — all discovered roles for this `cwd`, `currentValue` set to first non-packaged role
  - **agent** (`id: "agent"`, `category: "model"`) — all discovered agents for this `cwd`, `currentValue` set to first available agent

After the response, send `session/update` notifications via `conn.sessionUpdate()`:
1. `available_commands_update` — the default role's source tasks as `AvailableCommand[]`
2. `config_option_update` — initial config state (optional, for client sync)

Session directory structure:
```
{cwd}/.mason/sessions/{sessionId}/
├── meta.json       # { sessionId, cwd, firstPrompt, lastUpdated, agent, role, closed }
```

Acceptance criteria:
- Given a `session/new` request with `cwd: "/path/to/project"`, then roles/agents are discovered for that `cwd` and a session directory is created at `/path/to/project/.mason/sessions/{uuid}/`.
- Given the response, `configOptions` includes both `role` and `agent` selects with correct `SessionConfigSelect` structure.
- Given the response, an `available_commands_update` notification is sent with the default role's source tasks.

**REQ-006: `session/prompt` (`prompt`) Handler**

Handle `session/prompt`. Receive `PromptRequest` (containing `sessionId`, `prompt: ContentBlock[]`, optional `messageId`).

Extract text content from the `ContentBlock[]` array (initial implementation handles `TextContent` blocks only, per `promptCapabilities`).

Execute the prompt by running `run-agent --agent {agent} --role {role} --print {text}` using the session's configured agent and role.

1. Run `run-agent` in `--print` mode with the extracted text prompt.
2. Collect the final output.
3. Send `session/update` via `conn.sessionUpdate()` with `agent_message_chunk`:
   ```json
   {
     "sessionId": "{sessionId}",
     "update": {
       "sessionUpdate": "agent_message_chunk",
       "content": { "type": "text", "text": "{agent output}" }
     }
   }
   ```
4. Return `PromptResponse` with `stopReason: "end_turn"`.
5. Update `meta.json` with `lastUpdated` timestamp and `firstPrompt` (if first prompt in session).
6. Send `session_info_update` notification with updated `title` (first prompt text) and `updatedAt`.

Acceptance criteria:
- Given a `session/prompt` with `prompt: [{ type: "text", text: "hello" }]`, then `run-agent --print` is invoked with "hello".
- Given the agent produces output, then `conn.sessionUpdate()` sends `agent_message_chunk` followed by a `PromptResponse` with `stopReason: "end_turn"`.
- Given an `image` content block (supported per capabilities), it is passed through to the agent if the agent supports it, otherwise the text content is extracted.

**REQ-007: `session/load` (`loadSession`) Handler**

Handle `session/load`. Receive `LoadSessionRequest` (containing `sessionId`, `cwd`, optional `mcpServers`).

Load the session's `meta.json` to restore agent/role configuration. Replay conversation history (if stored) as `session/update` notifications (`user_message_chunk` and `agent_message_chunk` for each turn). Then return `null` (per spec — `session/load` response is `null` after history replay).

Acceptance criteria:
- Given a `session/load` with a valid `sessionId`, then the session's agent and role are restored from `meta.json`.
- Given a loaded session with conversation history, then history is replayed via `session/update` notifications before the response.
- Given a loaded session, subsequent `session/prompt` requests execute with the restored configuration.

**REQ-008: `session/list` (`listSessions`) Handler**

Handle `session/list`. Receive `ListSessionsRequest` (optional `cwd` filter, optional `cursor` for pagination).

Scan `{cwd}/.mason/sessions/` and return `ListSessionsResponse`:

```json
{
  "sessions": [
    {
      "sessionId": "{session id}",
      "cwd": "{cwd from meta.json}",
      "title": "{firstPrompt from meta.json}",
      "updatedAt": "{lastUpdated from meta.json}"
    }
  ],
  "nextCursor": null
}
```

Each session is a `SessionInfo` object. Closed sessions (where `meta.json` has `closed: true`) are excluded.

If `cwd` is provided, filter sessions to those matching the working directory. Cursor-based pagination is supported but optional for initial implementation (return all sessions, `nextCursor: null`).

Acceptance criteria:
- Given sessions exist in `.mason/sessions/`, then all non-closed sessions are returned as `SessionInfo` objects.
- Given a `cwd` filter, only sessions with matching `cwd` are returned.
- Given no sessions exist, an empty `sessions` array is returned.

**REQ-009: `session/cancel` (`cancel`) Handler**

Handle `session/cancel` notification. Receive `{ sessionId }`. Abort the in-progress `run-agent --print` subprocess for the given session.

The `cancel` handler receives an `AbortSignal` from the SDK connection. Use this signal to kill the running agent subprocess. The in-flight `prompt` handler should catch the cancellation and return `stopReason: "cancelled"`.

Acceptance criteria:
- Given a `session/cancel` during an active prompt, then the `run-agent` subprocess is killed.
- Given the cancellation, the `prompt` handler returns `{ stopReason: "cancelled" }`.

**REQ-010: `session/close` (`closeSession`) Handler**

Handle `session/close`. Receive `CloseSessionRequest` (containing `sessionId`). Mark the session as closed in `meta.json` (set `closed: true` and `closedAt` timestamp). Return `CloseSessionResponse` (empty object `{}`).


Acceptance criteria:
- Given a `session/close` for a valid session, then `meta.json` is updated with `closed: true`.
- Given a closed session, when `session/list` is called, the closed session is excluded.

**REQ-011: `session/set_config_option` (`setConfigOption`) Handler**

Handle `session/set_config_option`. Receive `SetSessionConfigOptionRequest` (containing `sessionId`, `configId`, `value`). Update the session's agent or role configuration and persist to `meta.json`.

Return `SetSessionConfigOptionResponse` — the **complete list** of all config options with current values (per spec, since changing one option may affect others).

If the role changes, also send `session/update` notifications via `conn.sessionUpdate()`:
1. `available_commands_update` with the new role's source tasks
2. `config_option_update` with the full updated config state

Acceptance criteria:
- Given `configId: "agent"` and `value: "codex"`, then subsequent prompts use the codex agent.
- Given `configId: "role"` and a role change, then `available_commands_update` and `config_option_update` are sent.
- Given the response, it contains the complete `configOptions` array reflecting current state.

**REQ-012: `available_commands_update` Notifications**

Send `session/update` with `sessionUpdate: "available_commands_update"` containing the active role's source tasks as `AvailableCommand[]`.

Triggers:
- After `session/new` response (using default role)
- After `session/set_config_option` when role changes

Each command follows the `AvailableCommand` schema:
```json
{
  "name": "{task-name}",
  "description": "{task description}",
  "input": {
    "hint": "command arguments"
  }
}
```

Acceptance criteria:
- Given a role with source tasks, when `session/new` completes, then `available_commands_update` includes all source tasks.
- Given a role change, then `available_commands_update` is re-sent with the new role's tasks.

**REQ-013: Remove Old ACP Code**

Remove the existing Docker-bridging ACP implementation:

- `packages/cli/src/acp/` — entire directory (session.ts, bridge.ts, logger.ts, matcher.ts, rewriter.ts, warnings.ts)
- `packages/mcp-agent/src/acp-agent.ts` — ACP agent implementation
- `packages/cli/src/cli/commands/run-agent.ts` — remove `runAgentAcpMode()` and `--acp` flag
- Remove any ACP-related imports and dead code paths
- Remove old `@anthropic-ai/acp` or similar SDK dependencies if present

Acceptance criteria:
- Given the codebase after removal, `--acp` flag is no longer a valid option for `mason run`.
- Given the codebase after removal, no files in `packages/cli/src/acp/` exist.
- Given the codebase after removal, `npm run build` and unit tests pass.

---

### P1 — Nice-to-Have

**REQ-014: Session History Context**

Pass previous prompts and responses from the session to the agent on subsequent prompts, enabling multi-turn conversation context. Store conversation turns in the session directory.

We will do this later by creating docker-compose mounts in the session directory

**REQ-015: Streaming Responses**

Instead of waiting for the full `--print` output, stream agent responses as multiple `agent_message_chunk` updates in real-time as the subprocess produces output.

will support this later with a `--json` option in run-agent that will be translated to message chunks

**REQ-016: Tool Call Reporting**

Report tool calls made by the agent as `tool_call` and `tool_call_update` session updates, giving the editor visibility into what the agent is doing.

---

### P2 — Future Consideration

**REQ-017: Interactive Tool Approval**

Forward tool permission requests from the agent to the editor via ACP `session/request_permission`, allowing the user to approve/deny tool calls from within the editor.

**REQ-018: File System Access**

Implement `fs/read_text_file` and `fs/write_text_file` client methods, allowing the agent to read/write files through the editor's file system access.

**REQ-019: Terminal Access**

Implement `terminal/*` client methods (`createTerminal`, `currentOutput`, `waitForExit`, `kill`, `release`), allowing the agent to execute commands through the editor's terminal.

**REQ-020: Session Forking**

Implement `session/fork` to create a new session that inherits the conversation history of an existing session, branching from a specific point.

---

## 6. Architecture

### 6.1 Technology Stack

| Component | Technology |
|-----------|-----------|
| ACP Protocol SDK | `@agentclientprotocol/sdk` v0.17.x |
| Transport | stdio (newline-delimited JSON-RPC 2.0) |
| Protocol Version | ACP v1 |
| Session IDs | UUID v7 |

The `@agentclientprotocol/sdk` provides:
- `AgentSideConnection` — manages the agent-side protocol connection
- `ndJsonStream()` — creates a stdio transport stream from Node.js `process.stdin`/`process.stdout`
- `schema.*` types — TypeScript types for all ACP messages (`InitializeResponse`, `NewSessionResponse`, `PromptResponse`, `SessionUpdate`, `SessionConfigOption`, `AvailableCommand`, etc.)
- Automatic JSON-RPC 2.0 framing, method routing, and error handling

### 6.2 Command Structure

```
mason acp
  │
  ├── Startup
  │   └── Create AgentSideConnection (no project context yet)
  │
  ├── AgentSideConnection (SDK-managed protocol handler)
  │   ├── initialize        → InitializeResponse (capabilities + agentInfo)
  │   ├── newSession(cwd)   → discover roles/agents for cwd (shared with run-agent)
  │   │                        → seed defaults if needed
  │   │                        → NewSessionResponse (sessionId + configOptions)
  │   │                        + sessionUpdate: available_commands_update
  │   ├── prompt            → sessionUpdate: agent_message_chunk
  │   │                        → PromptResponse { stopReason: "end_turn" }
  │   ├── cancel            → abort in-flight run-agent subprocess
  │   ├── loadSession       → replay history via sessionUpdate → null
  │   ├── listSessions      → ListSessionsResponse
  │   ├── closeSession      → CloseSessionResponse
  │   └── setConfigOption   → SetSessionConfigOptionResponse
  │                            + sessionUpdate: available_commands_update (if role changed)
  │                            + sessionUpdate: config_option_update
  │
  └── Session State (in-memory Map + .mason/sessions/{id}/)
      ├── sessionId
      ├── agent (current)
      ├── role (current)
      ├── cwd
      ├── abortController (for cancel)
      └── meta.json (persisted)
```

### 6.3 Prompt Execution Flow

```
Editor → session/prompt { sessionId, prompt: ContentBlock[] }
  │
  ├─1─ Look up session state (agent, role, cwd)
  │
  ├─2─ Extract text from ContentBlock[] (TextContent.text)
  │
  ├─3─ Create AbortController for cancellation support
  │
  ├─4─ Execute: run-agent --agent {agent} --role {role} --print {text}
  │    └── Uses session cwd as working directory
  │    └── Collects stdout as final result
  │    └── Abortable via AbortController.signal
  │
  ├─5─ conn.sessionUpdate({
  │      sessionId,
  │      update: {
  │        sessionUpdate: "agent_message_chunk",
  │        content: { type: "text", text: result }
  │      }
  │    })
  │
  ├─6─ Return { stopReason: "end_turn" }
  │    (or { stopReason: "cancelled" } if aborted)
  │
  └─7─ Update meta.json { lastUpdated, firstPrompt (if first) }
       + conn.sessionUpdate({ session_info_update: { title, updatedAt } })
```

### 6.4 JSON-RPC 2.0 Message Format

All messages are UTF-8 encoded, newline-delimited (`\n`), and MUST NOT contain embedded newlines (per ACP transport spec). The SDK handles framing automatically.

**Example: Initialize**
```
→ {"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{},"clientInfo":{"name":"vscode","title":"VS Code","version":"1.0.0"}}}
← {"jsonrpc":"2.0","id":0,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":true,"promptCapabilities":{"image":true,"audio":false,"embeddedContext":true},"mcpCapabilities":{"http":true,"sse":false},"sessionCapabilities":{"list":{},"close":{}}},"agentInfo":{"name":"mason","title":"Mason","version":"0.2.1"}}}
```

**Example: Prompt with update notification**
```
→ {"jsonrpc":"2.0","id":2,"method":"session/prompt","params":{"sessionId":"...","prompt":[{"type":"text","text":"hello"}]}}
← {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"...","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"Hello! How can I help?"}}}}
← {"jsonrpc":"2.0","id":2,"result":{"stopReason":"end_turn"}}
```

### 6.5 Session Storage

Sessions are stored under the project's `.mason/` directory (scoped to `cwd`):

```
{cwd}/.mason/sessions/
├── {uuid-1}/
│   └── meta.json
│       {
│         "sessionId": "uuid-1",
│         "cwd": "/path/to/project",
│         "agent": "claude",
│         "role": "project",
│         "firstPrompt": "help me refactor this",
│         "lastUpdated": "2026-03-25T10:30:00Z",
│         "closed": false
│       }
├── {uuid-2}/
│   └── meta.json
└── ...
```

### 6.6 Code Sharing with `run-agent`

The following functions are already implemented and must be reused (not duplicated):

| Function | Location | Purpose |
|----------|----------|---------|
| `discoverRoles()` | `packages/shared/src/role/discovery.ts` | Find all available roles |
| `resolveRole()` | `packages/shared/src/role/discovery.ts` | Resolve a role by name |
| `createAgentRegistry()` | `packages/agent-sdk/src/discovery.ts` | Build agent registry |
| `resolveAgentTypeWithAutoInstall()` | `packages/cli/src/cli/commands/run-agent.ts` | Resolve agent with fallback install |
| `runAgentPrintMode()` | `packages/cli/src/cli/commands/run-agent.ts` | Execute agent in print mode |

### 6.7 Files to Remove

| File/Directory | Reason |
|----------------|--------|
| `packages/cli/src/acp/session.ts` | Docker session lifecycle — replaced |
| `packages/cli/src/acp/bridge.ts` | ACP SDK bridge — replaced by `@agentclientprotocol/sdk` |
| `packages/cli/src/acp/logger.ts` | ACP file logging — replaced |
| `packages/cli/src/acp/matcher.ts` | MCP tool matching — unused |
| `packages/cli/src/acp/rewriter.ts` | MCP tool rewriting — unused |
| `packages/cli/src/acp/warnings.ts` | ACP warnings — unused |
| `packages/mcp-agent/src/acp-agent.ts` | Container-side ACP agent — replaced |
| `runAgentAcpMode()` in run-agent.ts | ACP mode routing — replaced by `mason acp` |

---

## 7. Protocol Compliance Notes

The following ACP protocol features are **advertised but not implemented** in this phase. They are declared in capabilities so that future versions can enable them without breaking clients:

| Feature | Capability Declaration | Status |
|---------|----------------------|--------|
| `session/load` | `loadSession: true` | Implemented (P0) |
| `session/list` | `sessionCapabilities.list: {}` | Implemented (P0) |
| `session/close` | `sessionCapabilities.close: {}` | Implemented (P0) |
| `session/cancel` | (notification, always supported) | Implemented (P0) |
| `image` prompts | `promptCapabilities.image: true` | Accepted, passed to agent |
| `audio` prompts | `promptCapabilities.audio: false` | Not supported |
| `embeddedContext` | `promptCapabilities.embeddedContext: true` | Accepted, passed to agent |
| MCP HTTP servers | `mcpCapabilities.http: true` | Forwarded to agent |
| MCP SSE servers | `mcpCapabilities.sse: false` | Not supported |
| `fs/*` methods | Not declared in clientCapabilities | Future (REQ-018) |
| `terminal/*` methods | Not declared in clientCapabilities | Future (REQ-019) |
| `session/fork` | Not declared | Future (REQ-020) |
| `session/request_permission` | Not called | Future (REQ-017) |

---

## 8. Open Questions

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| Q1 | How should session directory interact with `run-agent --print`'s own session/context tracking? | Engineering | Yes |
| Q2 | Should closed sessions be deleted or just filtered from `session/list`? | Engineering | No |
| Q3 | What is the maximum number of sessions to retain before auto-cleanup? | Engineering | No |
| Q4 | Should `mcpServers` from `session/new` params be forwarded to `run-agent` invocations? | Engineering | No |
| Q5 | The SDK types use `mcp` for the capabilities field name — confirm whether the wire format uses `mcp` or `mcpCapabilities` and align accordingly. | Engineering | Yes — **Resolved:** SDK v0.16.x uses `mcpCapabilities` for the field name. Also, session close capability uses `stop` not `close` in `sessionCapabilities`. |
