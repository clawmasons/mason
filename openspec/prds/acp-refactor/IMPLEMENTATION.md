# ACP Refactor — Implementation Plan

**PRD:** [openspec/prds/acp-refactor/PRD.md](./PRD.md)
**Phase:** P0

---

## Implementation Steps

### CHANGE 1: Remove Old ACP Code

Delete the entire Docker-bridging ACP implementation, associated tests, and the `--acp` flag from `mason run`.

**PRD refs:** REQ-013 (Remove Old ACP Code)

**Summary:** Remove all old ACP code to create a clean slate for the new implementation. This includes the `packages/cli/src/acp/` directory, the container-side `AcpAgent`, the `runAgentAcpMode()` function, and the `--acp` CLI flag. The `@agentclientprotocol/sdk` dependency stays — it will be used by the new implementation.

**User Story:** As a developer working on the new ACP implementation, I need the old dead code removed so there's no confusion about what's active vs. legacy, and no import conflicts with the new files.

**Scope:**
- Delete directory: `packages/cli/src/acp/` (session.ts, bridge.ts, logger.ts, matcher.ts, rewriter.ts, warnings.ts)
- Delete file: `packages/mcp-agent/src/acp-agent.ts`
- Delete tests: `packages/cli/tests/acp/` (bridge.test.ts, session.test.ts, matcher.test.ts, rewriter.test.ts, warnings.test.ts)
- Delete test: `packages/mcp-agent/tests/acp-agent.test.ts`
- Modify: `packages/cli/src/cli/commands/run-agent.ts` — remove `runAgentAcpMode()` (~200 lines), `--acp` option from CLI registration, `isAcpMode` branch in `runAgent()`, and ACP-related imports (`AcpSession`, `AcpSdkBridge`, `createFileLogger`, etc.)
- Clean up: Remove any remaining dead imports (check `Readable`/`Writable` from `node:stream`)

**Testable output:** `npx tsc --noEmit` passes, `npx eslint src/ tests/` clean, `npx vitest run packages/cli/tests/` passes, `npx vitest run packages/mcp-agent/tests/` passes. The `--acp` flag is no longer recognized by `mason run --help`.

**Implemented** — [proposal](../../changes/archive/2026-03-25-remove-old-acp-code/proposal.md) | [design](../../changes/archive/2026-03-25-remove-old-acp-code/design.md) | [tasks](../../changes/archive/2026-03-25-remove-old-acp-code/tasks.md)

---

### CHANGE 2: Session Storage Module (Shared)

Create a general-purpose session persistence layer for managing `{cwd}/.mason/sessions/{uuid}/meta.json`. This module is **not ACP-specific** — it lives in `packages/shared` so it can be reused by `mason run` for session resumption, session cleanup, and any future feature that needs session tracking.

**PRD refs:** REQ-005 (session directory structure), REQ-008 (session listing), REQ-010 (session close)

**Summary:** Build a shared session storage module that provides typed CRUD operations for session metadata on disk. This is the foundation for ACP session lifecycle handlers, but is intentionally decoupled from ACP so that `mason run` can also create/resume/clean up sessions in the future. Each session is stored as a `meta.json` file under `{cwd}/.mason/sessions/{sessionId}/`.

**User Story:** As a developer building session-aware features (ACP handlers, `mason run --resume`, session cleanup), I need a tested persistence layer I can import and call `createSession()`, `readSession()`, `listSessions()`, `closeSession()` without worrying about file I/O or directory structure.

**Scope:**
- New file: `packages/shared/src/session/session-store.ts`
- New test: `packages/shared/tests/session/session-store.test.ts`
- Types:
  ```typescript
  interface Session {
    sessionId: string;       // UUID v7
    cwd: string;
    agent: string;
    role: string;
    firstPrompt: string | null;
    lastUpdated: string;     // ISO 8601
    closed: boolean;
    closedAt: string | null;
  }
  ```
- Functions:
  - `createSession(cwd, agent, role): Session` — generates UUID v7, writes `meta.json`, returns metadata
  - `readSession(cwd, sessionId): Session | null` — reads `meta.json`, returns null if not found
  - `updateSession(cwd, sessionId, updates: Partial<Session>): void` — merges updates, writes atomically
  - `listSessions(cwd): Session[]` — scans `{cwd}/.mason/sessions/*/meta.json`, returns non-closed sessions sorted by `lastUpdated` desc
  - `closeSession(cwd, sessionId): void` — sets `closed: true` and `closedAt` timestamp

**Testable output:** Unit tests using temp directories that verify: create writes correct `meta.json`, read returns matching data, update persists changes, list returns only non-closed sessions, close marks session and list excludes it. UUID v7 IDs are time-ordered.

**Implemented** — [proposal](../../changes/archive/2026-03-25-session-storage-module/proposal.md) | [design](../../changes/archive/2026-03-25-session-storage-module/design.md) | [tasks](../../changes/archive/2026-03-25-session-storage-module/tasks.md)

---

### CHANGE 3: `mason acp` CLI Command + Initialize Handler

Register the `mason acp` command and implement the `initialize` handler — the first runnable artifact.

**PRD refs:** REQ-001 (Top-Level `mason acp` Command), REQ-002 (SDK Integration — `AgentSideConnection`), REQ-004 (`initialize` Handler)

**Summary:** Create the `mason acp` CLI command that starts an `AgentSideConnection` from `@agentclientprotocol/sdk` using stdio transport (`ndJsonStream` on stdin/stdout). Implement the `initialize` handler returning mason's capabilities and agent info. All other handlers start as stubs. Console output is redirected to stderr so stdout is exclusively for ACP protocol messages.

**User Story:** As an editor extension developer, I want to spawn `mason acp` as a subprocess and send an `initialize` JSON-RPC message on stdin, receiving back an `InitializeResponse` confirming that ACP communication works and I can see mason's capabilities.

**Scope:**
- New file: `packages/cli/src/acp/acp-command.ts` — `registerAcpCommand(program)` function
- New file: `packages/cli/src/acp/acp-agent.ts` — `createMasonAcpAgent(conn)` factory returning the Agent interface
- Modify: `packages/cli/src/cli/commands/index.ts` — register `acp` command
- New test: `packages/cli/tests/acp/acp-agent.test.ts`
- Initialize response (per REQ-004):
  ```json
  {
    "protocolVersion": 1,
    "agentCapabilities": {
      "loadSession": true,
      "promptCapabilities": { "image": true, "audio": false, "embeddedContext": true },
      "sessionCapabilities": { "list": {}, "close": {} }
    },
    "agentInfo": { "name": "mason", "title": "Mason", "version": "{cli-version}" }
  }
  ```
- Store `clientCapabilities` from request for future use
- Redirect `console.log`/`console.error` to stderr before creating connection

**Testable output:** Unit test creates in-memory stream pair, constructs connection, sends `initialize`, verifies response capabilities and agentInfo. Manual test: pipe initialize JSON-RPC to `mason acp`, verify valid response on stdout.

**Implemented** — [proposal](../../changes/archive/2026-03-25-mason-acp-command/proposal.md) | [design](../../changes/archive/2026-03-25-mason-acp-command/design.md) | [tasks](../../changes/archive/2026-03-25-mason-acp-command/tasks.md)

---

### CHANGE 4: `session/new` Handler with Discovery Integration

Implement session creation with role/agent discovery driven by the provided `cwd`.

**PRD refs:** REQ-003 (Role and Agent Discovery), REQ-005 (`session/new` Handler), REQ-012 (`available_commands_update` Notifications)

**Summary:** When the editor sends `session/new` with a `cwd`, discover roles and agents for that directory using existing shared functions (`discoverRoles()`, `createAgentRegistry()`), create a session via the session store (CHANGE 2), and return `configOptions` with role and agent `select` options. After the response, send `available_commands_update` notification with the default role's source tasks.

**User Story:** As an editor user, when my extension opens a project and sends `session/new`, I receive dropdown options for available roles (e.g., "project", "configure-project") and agents (e.g., "claude-code-agent", "codex"), along with slash commands from my active role.

**Scope:**
- Modify: `packages/cli/src/acp/acp-agent.ts` — implement `newSession` handler
- New file: `packages/cli/src/acp/discovery-cache.ts` — per-cwd cache for discovery results
- New test: `packages/cli/tests/acp/session-new.test.ts`
- In-memory state: `Map<string, SessionState>` keyed by sessionId
- Discovery integration (reuse existing functions):
  - `discoverRoles(cwd)` from `packages/shared/src/role/discovery.ts`
  - `createAgentRegistry(builtinAgents, cwd)` from `packages/agent-sdk/src/discovery.ts`
  - `inferAgentType(role, defaultAgent)` from `packages/cli/src/cli/commands/run-agent.ts`
- `configOptions` response:
  - Role select: `{ id: "role", type: "select", category: "role", currentValue, options: [...roles] }`
  - Agent select: `{ id: "agent", type: "select", category: "model", currentValue, options: [...agents] }`
- Post-response: `conn.sessionUpdate()` with `available_commands_update` containing role's source tasks as `AvailableCommand[]`
- Session persisted via `createSession()` from CHANGE 2
- If no non-packaged roles found, create a default project role at `{cwd}/.mason/roles/project/ROLE.md`

**Testable output:** Unit tests with mocked discovery verify: session created with UUID, `configOptions` contain role and agent selects with correct structure, `available_commands_update` sent with role tasks, `meta.json` written. Verify discovery is called with correct `cwd`.

**Implemented** — [proposal](../../changes/archive/2026-03-25-session-new-handler/proposal.md) | [design](../../changes/archive/2026-03-25-session-new-handler/design.md) | [tasks](../../changes/archive/2026-03-25-session-new-handler/tasks.md)

---

### CHANGE 5: `session/prompt` + Cancel Handlers

Implement prompt execution via `run-agent --print` subprocess and cancellation support.

**PRD refs:** REQ-006 (`session/prompt` Handler), REQ-009 (`session/cancel` Handler)

**Summary:** The `prompt` handler extracts text from `ContentBlock[]`, spawns `mason run --agent {agent} --role {role} -p "{text}"` as a subprocess in the session's `cwd`, collects stdout, sends the result as `agent_message_chunk` via `conn.sessionUpdate()`, and returns `{ stopReason: "end_turn" }`. The `cancel` handler aborts the in-flight subprocess via `AbortController`. Using a subprocess (rather than calling `runAgentPrintMode()` in-process) avoids `process.exit()` issues and enables clean cancellation.

**User Story:** As an editor user, when I type a prompt and send it, the mason agent executes my request using the configured agent and role, and I see the response in my editor. If I cancel, the operation stops immediately.

**Scope:**
- Modify: `packages/cli/src/acp/acp-agent.ts` — implement `prompt` and `cancel` handlers
- New file: `packages/cli/src/acp/prompt-executor.ts` — subprocess execution wrapper
- New test: `packages/cli/tests/acp/prompt.test.ts`
- Prompt flow:
  1. Look up session state (agent, role, cwd) from in-memory Map
  2. Extract text from `ContentBlock[]` (handle `TextContent` blocks)
  3. Create `AbortController`, store in session state
  4. Spawn: `mason run --agent {agent} --role {role} -p {text}` with `{ cwd, signal }`
  5. Collect stdout as result
  6. `conn.sessionUpdate()` → `agent_message_chunk` with result text
  7. Update `meta.json` (firstPrompt, lastUpdated)
  8. Send `session_info_update` (title, updatedAt)
  9. Return `{ stopReason: "end_turn" }`
- Cancel: `abortController.abort()` → subprocess killed → prompt handler catches, returns `{ stopReason: "cancelled" }`

**Testable output:** Unit tests with mocked subprocess verify: text extraction from ContentBlock[], subprocess spawned with correct args/cwd, `agent_message_chunk` sent with output, `PromptResponse` has `stopReason: "end_turn"`, cancel aborts subprocess and returns `"cancelled"`, `meta.json` updated.

**Implemented** — [proposal](../../changes/archive/2026-03-25-session-prompt-cancel/proposal.md) | [design](../../changes/archive/2026-03-25-session-prompt-cancel/design.md) | [tasks](../../changes/archive/2026-03-25-session-prompt-cancel/tasks.md)

---

### CHANGE 6: Session Lifecycle Handlers

Implement the remaining session management handlers: list, load, close, and set_config_option.

**PRD refs:** REQ-007 (`session/load`), REQ-008 (`session/list`), REQ-010 (`session/close`), REQ-011 (`session/set_config_option`)

**Summary:** Complete the ACP handler set with session lifecycle operations. `listSessions` scans stored sessions with optional `cwd` filtering. `loadSession` restores agent/role configuration from `meta.json` and replays history (initially empty). `closeSession` marks a session closed. `setConfigOption` updates agent or role mid-session and triggers `available_commands_update` when the role changes.

**User Story:** As an editor user, I can browse my previous sessions, resume one from where I left off, switch between agents and roles without creating a new session, and close sessions when I'm done.

**Scope:**
- Modify: `packages/cli/src/acp/acp-agent.ts` — implement remaining handlers
- New test: `packages/cli/tests/acp/session-lifecycle.test.ts`
- `listSessions(cwd?, cursor?)`:
  - Call `listSessions(cwd)` from session store
  - Map to `SessionInfo[]`: `{ sessionId, cwd, title: firstPrompt, updatedAt: lastUpdated }`
  - Return `{ sessions, nextCursor: null }` (no pagination initially)
- `loadSession(sessionId, cwd)`:
  - Read `meta.json` to restore agent/role
  - Populate in-memory session state
  - Return `null` (per ACP spec — history replay comes later as P1)
- `closeSession(sessionId)`:
  - Call `closeSession(cwd, sessionId)`
  - Remove from in-memory session state
  - Return `{}`
- `setConfigOption(sessionId, configId, value)`:
  - Update session's agent or role in memory + `meta.json`
  - If role changed: re-resolve role via `resolveRole()`, send `available_commands_update` with new role's tasks, send `config_option_update`
  - Return complete `configOptions` array with updated `currentValue`s

**Testable output:** Unit tests verify: `listSessions` returns correct `SessionInfo` objects and respects `cwd` filter, `loadSession` restores state, `closeSession` persists `closed: true` and excludes from list, `setConfigOption` for role triggers `available_commands_update`, `setConfigOption` for agent updates state.

**Not Implemented Yet**

---

### CHANGE 7: Integration Testing + Cleanup

Full protocol lifecycle integration test and codebase cleanup.

**PRD refs:** All REQs (end-to-end verification)

**Summary:** Write an integration test exercising the complete ACP protocol lifecycle through in-memory streams: initialize → session/new → prompt → list → load → close → set_config_option → cancel. Also clean up any remaining references to old ACP types (e.g., `"acp"` mode in discovery module's `VALID_MODES`).

**User Story:** As a developer maintaining the ACP implementation, I have confidence that the full protocol flow works correctly, and no dead code references remain in the codebase.

**Scope:**
- New test: `packages/cli/tests/acp/acp-integration.test.ts`
- Clean up: Remove `"acp"` from `VALID_MODES` in `packages/agent-sdk/src/discovery.ts` if present
- Clean up: Any remaining old ACP type references across the codebase
- Test scenarios:
  1. `initialize` → correct capabilities returned
  2. `session/new` with test fixture cwd → sessionId + configOptions returned
  3. `session/prompt` → agent response via `agent_message_chunk` + `end_turn`
  4. `session/list` → created sessions returned
  5. `session/close` → session marked closed, excluded from list
  6. `session/load` → session restored
  7. `session/set_config_option` → role change triggers `available_commands_update`
  8. `session/cancel` during prompt → `stopReason: "cancelled"`
- Uses `ClientSideConnection` from SDK to drive the protocol from the client side against the agent handlers via in-memory streams

**Testable output:** All 8 integration test scenarios pass. `npx tsc --noEmit` clean. `npx eslint src/ tests/` clean. `npx vitest run packages/cli/tests/` passes. No remaining references to old ACP code.

**Not Implemented Yet**
