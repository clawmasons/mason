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

---

## 2. Goals

### User Goals
- Editor extensions (VS Code, etc.) can communicate with mason via the ACP protocol to run agents interactively.
- Users can select which agent and role to use from within the editor via `configOptions`.
- Sessions persist across prompts, allowing conversation continuity.
- Available slash commands from the active role are surfaced to the editor.

### Business Goals
- Provide a working ACP integration that editors can use immediately.
- Simplify the codebase by removing the Docker-bridging ACP code.
- Reuse existing `run-agent` infrastructure rather than maintaining parallel execution paths.

### Measurable Outcomes
- `mason acp` starts an ACP server that handles the full protocol lifecycle (initialize → session/new → prompt → end_turn).
- Old ACP code (`packages/cli/src/acp/`, `packages/mcp-agent/src/acp-agent.ts`) is removed.
- Each `session/prompt` delegates to `run-agent --print` and returns results via the ACP protocol.

---

## 3. Non-Goals

- **Streaming responses:** Initial implementation sends the final agent message as a single `agent_message_chunk`. Real-time streaming will be added later.
- **Persistent agent process:** Each prompt runs a fresh `run-agent --print` invocation. Long-running agent processes are a future enhancement.
- **Multi-turn context within a single prompt:** The agent receives the current prompt only. Session history/context is a future enhancement.
- **MCP tool approval UI:** Tool calls are handled by the agent in `--print` mode. Interactive permission prompts from the editor are out of scope.
- **Docker integration:** This PRD explicitly removes Docker-based ACP. Container-based agent execution remains available via `mason run` (non-ACP modes).

---

## 4. User Stories

**US-1:** As an editor extension developer, I want to connect to `mason acp` via stdin/stdout ndjson and receive capability information on `initialize`, so that I can discover what mason supports.

**US-2:** As an editor user, I want `session/new` to return a list of available agents and roles as `configOptions`, so that I can select which agent and role to use from within my editor.

**US-3:** As an editor user, I want to send a `session/prompt` and receive the agent's response as `agent_message_chunk` updates followed by an `end_turn`, so that I can see the agent's output in my editor.

**US-4:** As an editor user, I want to switch agents or roles mid-session via `session/set_config_option`, so that I can change my workflow without creating a new session.

**US-5:** As an editor user, I want to resume a previous session via `session/load`, so that I can continue where I left off.

**US-6:** As an editor extension, I want to receive `available_commands_update` with the active role's source tasks, so that I can present slash commands to the user.

**US-7:** As an editor extension, I want to list all sessions via `session/list`, so that I can present a session picker to the user.

---

## 5. Requirements

### P0 — Must-Have

**REQ-001: Top-Level `mason acp` Command**

Register `mason acp` as a top-level CLI command. When invoked, it starts an ACP server that communicates via ndjson on stdin/stdout. The command does not start any Docker infrastructure.

Acceptance criteria:
- Given a user runs `mason acp`, then the process starts and waits for ACP protocol messages on stdin.
- Given the process is running, when it receives ndjson messages on stdin, then it processes them according to the ACP protocol and writes ndjson responses to stdout.

**REQ-002: Startup — Role and Agent Discovery**

On startup (before responding to any protocol messages), `mason acp` must:

1. Discover all available roles (project-local + packaged) using the same discovery logic as `run-agent` (`discoverRoles` from `packages/shared/src/role/discovery.ts`).
2. If no non-packaged (project-local) roles are available, create a default project role in `.mason/roles/project/ROLE.md`.
3. Discover/seed default agents using the same logic as `run-agent` (agent registry from `packages/agent-sdk/src/discovery.ts`).

This logic must share code with `run-agent` — no duplication.

Acceptance criteria:
- Given a project with no `.mason/roles/` directory, when `mason acp` starts, then a default project role is created and available.
- Given a project with existing roles and agents, when `mason acp` starts, then all are discovered and available for `session/new` config options.

**REQ-003: `initialize` Request/Response**

Handle the ACP `initialize` request. Return agent capabilities and info.

Response:
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

Acceptance criteria:
- Given an `initialize` request, then the response includes `protocolVersion: 1`, `loadSession: true`, and session capabilities for `list` and `close`.
- Given the response, the `agentInfo.version` matches the mason CLI package version.

**REQ-004: `session/new` Request/Response**

Handle `session/new`. Create a new session with a UUID, store it at `.mason/sessions/{sessionId}/`, and return:
- `sessionId`
- `configOptions` with two select options:
  - **role** — all discovered roles, defaulting to the first non-packaged role (or `project` if auto-created)
  - **agent** — all discovered agents, defaulting to the first available agent

Also send a `session/update` with `available_commands_update` containing the default role's source tasks.

Session directory structure:
```
.mason/sessions/{sessionId}/
├── meta.json       # { sessionId, cwd, firstPrompt, lastUpdated, agent, role }
```

Acceptance criteria:
- Given a `session/new` request, then a UUID session is created at `.mason/sessions/{sessionId}/`.
- Given the response, `configOptions` includes both `role` and `agent` selects with all discovered options.
- Given the response, an `available_commands_update` is sent with the default role's source tasks.

**REQ-005: `session/prompt` Request/Response**

Handle `session/prompt`. Execute the prompt by running `run-agent --agent {agent} --role {role} --print {prompt}` using the session's configured agent and role. The session directory is used as the working context.

1. Run `run-agent` in `--print` mode with the prompt.
2. Collect the final output.
3. Send `session/update` with `agent_message_chunk` containing the full response text.
4. Send `session/prompt` end-turn response with `"stopReason": "end_turn"`.
5. Update `meta.json` with `lastUpdated` timestamp and `firstPrompt` (if first prompt in session).

Acceptance criteria:
- Given a `session/prompt` with text "hello", then `run-agent --print` is invoked with that prompt.
- Given the agent produces output, then a `session/update` with `agent_message_chunk` is sent followed by an end-turn response.
- Given a new session's first prompt, then `meta.json.firstPrompt` is set to the prompt text.

**REQ-006: `session/load` Request/Response**

Handle `session/load`. Resume an existing session by its `sessionId`. Load the session's `meta.json` to restore agent/role configuration, then run the agent on the existing session directory.

Acceptance criteria:
- Given a `session/load` with a valid `sessionId`, then the session's agent and role are restored from `meta.json`.
- Given a loaded session, when a `session/prompt` is sent, then it executes with the restored configuration.

**REQ-007: `session/set_config_option` Request/Response**

Handle `session/set_config_option`. Update the session's agent or role configuration and persist the change to `meta.json`.

If the role changes, send a `session/update` with `available_commands_update` reflecting the new role's source tasks.

Request example:
```json
{
  "sessionId": "{sessionId}",
  "configId": "agent",
  "value": "codex"
}
```

Response: return updated `configOptions` reflecting the current state.

Acceptance criteria:
- Given a `set_config_option` changing `agent` to `codex`, then subsequent prompts use the codex agent.
- Given a `set_config_option` changing `role`, then an `available_commands_update` is sent with the new role's source tasks.

**REQ-008: `session/list` Request/Response**

Handle `session/list`. Scan `.mason/sessions/` and return all sessions with their metadata.

Response:
```json
{
  "sessions": [
    {
      "sessionId": "{session id}",
      "cwd": "{cwd from meta.json}",
      "title": "{firstPrompt from meta.json}",
      "updatedAt": "{lastUpdated from meta.json}"
    }
  ]
}
```

Acceptance criteria:
- Given sessions exist in `.mason/sessions/`, then all are returned with correct metadata.
- Given no sessions exist, then an empty `sessions` array is returned.

**REQ-009: `session/close` Request/Response**

Handle `session/close`. Mark the session as closed in `meta.json` (set `closed: true` and `closedAt` timestamp). Closed sessions are excluded from `session/list` results.

Acceptance criteria:
- Given a `session/close` for a valid session, then `meta.json` is updated with `closed: true`.
- Given a closed session, when `session/list` is called, then the closed session is not included.

**REQ-010: `available_commands_update`**

Send `session/update` with `available_commands_update` containing the active role's source tasks as available commands.

Triggers:
- On `session/new` (using default role)
- On `session/set_config_option` when role changes

Command format:
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
- Given a role with source tasks, when `session/new` is sent, then `available_commands_update` includes all source tasks.
- Given a role change, then `available_commands_update` is re-sent with the new role's tasks.

**REQ-011: Remove Old ACP Code**

Remove the existing Docker-bridging ACP implementation:

- `packages/cli/src/acp/` — entire directory (session.ts, bridge.ts, logger.ts, matcher.ts, rewriter.ts, warnings.ts)
- `packages/mcp-agent/src/acp-agent.ts` — ACP agent implementation
- `packages/cli/src/cli/commands/run-agent.ts` — remove `runAgentAcpMode()` and `--acp` flag
- Remove any ACP-related imports and dead code paths

Acceptance criteria:
- Given the codebase after removal, `--acp` flag is no longer a valid option for `mason run`.
- Given the codebase after removal, no files in `packages/cli/src/acp/` exist.
- Given the codebase after removal, `npm run build` and unit tests pass.

---

### P1 — Nice-to-Have

**REQ-012: Session History Context**

Pass previous prompts and responses from the session to the agent on subsequent prompts, enabling multi-turn conversation context. Store conversation turns in the session directory.

**REQ-013: Streaming Responses**

Instead of waiting for the full `--print` output, stream agent responses as multiple `agent_message_chunk` updates in real-time.

---

### P2 — Future Consideration

**REQ-014: Interactive Tool Approval**

Forward tool permission requests from the agent to the editor via ACP, allowing the user to approve/deny tool calls from within the editor.

**REQ-015: Session Forking**

Allow creating a new session that inherits the conversation history of an existing session, branching from a specific point.

---

## 6. Architecture

### 6.1 Command Structure

```
mason acp
  │
  ├── Startup
  │   ├── discoverRoles(projectDir)          # shared with run-agent
  │   ├── createDefaultProjectRole()          # if no project roles exist
  │   ├── createAgentRegistry()               # shared with run-agent
  │   └── seedDefaultAgents()                 # if no agents configured
  │
  ├── Protocol Handler (ndjson stdin/stdout)
  │   ├── initialize        → capabilities response
  │   ├── session/new       → create session + configOptions + availableCommands
  │   ├── session/prompt    → run-agent --print → agent_message_chunk + end_turn
  │   ├── session/load      → restore session → ready for prompts
  │   ├── session/list      → scan .mason/sessions/
  │   ├── session/close     → mark session closed
  │   └── session/set_config_option → update agent/role
  │
  └── Session State (in-memory + .mason/sessions/{id}/)
      ├── sessionId
      ├── agent (current)
      ├── role (current)
      └── meta.json (persisted)
```

### 6.2 Prompt Execution Flow

```
Editor → session/prompt { sessionId, prompt }
  │
  ├─1─ Look up session state (agent, role, cwd)
  │
  ├─2─ Execute: run-agent --agent {agent} --role {role} --print {prompt}
  │    └── Uses session directory as context
  │    └── Collects stdout as final result
  │
  ├─3─ Send: session/update { agent_message_chunk, content: { type: "text", text: result } }
  │
  ├─4─ Send: session/prompt response { stopReason: "end_turn" }
  │
  └─5─ Update meta.json { lastUpdated, firstPrompt (if first) }
```

### 6.3 Session Storage

```
.mason/sessions/
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

### 6.4 Code Sharing with `run-agent`

The following functions are already implemented and must be reused (not duplicated):

| Function | Location | Purpose |
|----------|----------|---------|
| `discoverRoles()` | `packages/shared/src/role/discovery.ts` | Find all available roles |
| `resolveRole()` | `packages/shared/src/role/discovery.ts` | Resolve a role by name |
| `createAgentRegistry()` | `packages/agent-sdk/src/discovery.ts` | Build agent registry |
| `resolveAgentTypeWithAutoInstall()` | `packages/cli/src/cli/commands/run-agent.ts` | Resolve agent with fallback install |
| `runAgentPrintMode()` | `packages/cli/src/cli/commands/run-agent.ts` | Execute agent in print mode |

### 6.5 Files to Remove

| File/Directory | Reason |
|----------------|--------|
| `packages/cli/src/acp/session.ts` | Docker session lifecycle — replaced |
| `packages/cli/src/acp/bridge.ts` | ACP SDK bridge — replaced |
| `packages/cli/src/acp/logger.ts` | ACP file logging — replaced |
| `packages/cli/src/acp/matcher.ts` | MCP tool matching — unused |
| `packages/cli/src/acp/rewriter.ts` | MCP tool rewriting — unused |
| `packages/cli/src/acp/warnings.ts` | ACP warnings — unused |
| `packages/mcp-agent/src/acp-agent.ts` | Container-side ACP agent — replaced |
| `runAgentAcpMode()` in run-agent.ts | ACP mode routing — replaced by `mason acp` |

---

## 7. Open Questions

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| Q1 | Should `mason acp` also accept a `--port` flag to serve over HTTP/SSE instead of stdin/stdout? | Engineering | No |
| Q2 | How should session directory interact with `run-agent --print`'s own session/context tracking? | Engineering | Yes |
| Q3 | Should closed sessions be deleted or just filtered from `session/list`? | Engineering | No |
| Q4 | What is the maximum number of sessions to retain before auto-cleanup? | Engineering | No |
