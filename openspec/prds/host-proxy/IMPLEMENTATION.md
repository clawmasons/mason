# Host Proxy — Implementation Plan

**PRD:** [openspec/prds/host-proxy/PRD.md](./PRD.md)
**Phase:** P0 (Relay + Credentials + Approvals + SQLite Removal) + P1 (Host MCP Servers)

---

## Implementation Steps

### CHANGE 1: Relay Message Protocol — Types and Zod Schemas

Define the typed message protocol for the relay WebSocket. Pure types and validation schemas — no behavior, no I/O.

**PRD refs:** REQ-002 (Relay Message Protocol)

**Summary:** Create `packages/proxy/src/relay/messages.ts` with TypeScript interfaces and Zod schemas for all relay message types: `credential_request`, `credential_response`, `approval_request`, `approval_response`, `mcp_tool_call`, `mcp_tool_result`, `mcp_tools_register`, `mcp_tools_registered`, `audit_event`. Each message extends a base `RelayMessage` with `id` (UUIDv4) and `type` (string discriminator). Include a `parseRelayMessage()` function that uses a discriminated union to validate and type-narrow incoming JSON. This is the foundational change — all subsequent relay code depends on these types.

**User Story:** As a developer building the relay server or client, I import `parseRelayMessage()` and get back a typed, validated message I can switch on by `type`. Invalid messages are rejected with clear Zod errors.

**Scope:**
- New: `packages/proxy/src/relay/messages.ts` — all relay message interfaces, Zod schemas, `parseRelayMessage()`, `createRelayMessage()` helper
- New: `packages/proxy/tests/relay/messages.test.ts` — schema validation tests (valid/invalid for each type, unknown type handling, missing fields)

**Testable output:** `parseRelayMessage(validCredentialRequest)` returns typed `CredentialRequestMessage`. `parseRelayMessage({type: "unknown"})` returns error. `parseRelayMessage({})` returns error (missing id and type). Each message type schema validates correct fields and rejects invalid ones. `npx tsc --noEmit` compiles. `npx vitest run packages/proxy/tests/` passes.

**Implemented** — [Archived spec](../../changes/archive/2026-03-21-relay-message-protocol/)
- [Proposal](../../changes/archive/2026-03-21-relay-message-protocol/proposal.md)
- [Design](../../changes/archive/2026-03-21-relay-message-protocol/design.md)
- [Tasks](../../changes/archive/2026-03-21-relay-message-protocol/tasks.md)
- [Spec: relay-messages](../../changes/archive/2026-03-21-relay-message-protocol/specs/relay-messages/spec.md)

---

### CHANGE 2: Relay Server (Docker-side WebSocket)

Replace the single-purpose `/ws/credentials` endpoint with a generic `/ws/relay` WebSocket endpoint on the Docker proxy that dispatches messages by type.

**PRD refs:** REQ-001 (Generic Relay WebSocket Endpoint), REQ-002 (Relay Message Protocol)

**Summary:** Create `packages/proxy/src/relay/server.ts` with a `RelayServer` class that manages the host proxy WebSocket connection. It authenticates with bearer token (`RELAY_TOKEN`), accepts one connection at a time (replacing previous if reconnected), and dispatches incoming messages to registered handlers by type. Outgoing messages are sent via `send(message)` with request/response correlation using the `id` field. Pending requests have configurable timeouts. This replaces `packages/proxy/src/handlers/credential-relay.ts` — the old file is deleted in a later change once all consumers are migrated. Update `packages/proxy/src/server.ts` to handle `/ws/relay` WebSocket upgrade alongside the existing `/ws/credentials` (both active during migration).

**User Story:** As the Docker proxy, I create a `RelayServer` and register message handlers. When the host proxy connects to `/ws/relay`, I can send it credential requests, approval requests, and tool calls, and receive responses correlated by ID.

**Scope:**
- New: `packages/proxy/src/relay/server.ts` — `RelayServer` class
  - `constructor(config: { token: string; defaultTimeoutMs?: number })`
  - `handleUpgrade(req, socket, head)` — bearer token auth, WebSocket accept
  - `registerHandler(type: string, handler: (msg) => void)` — message dispatch
  - `send(message: RelayMessage): void` — send to connected host proxy
  - `request(message: RelayMessage, timeoutMs?: number): Promise<RelayMessage>` — send and await correlated response
  - `isConnected(): boolean`
  - `shutdown(): void`
- Modify: `packages/proxy/src/server.ts` — add `/ws/relay` upgrade path using `RelayServer` (keep `/ws/credentials` for now)
- New: `packages/proxy/tests/relay/server.test.ts` — auth tests, message dispatch, request/response correlation, timeout handling, reconnection

**Testable output:** WebSocket connects to `/ws/relay` with valid bearer token → accepted. Invalid token → rejected 401. `send()` delivers message to connected client. `request()` resolves when correlated response arrives. `request()` rejects after timeout. Reconnection replaces old connection. `npx tsc --noEmit` compiles. `npx vitest run packages/proxy/tests/` passes.

**Implemented** — [Archived spec](../../changes/archive/2026-03-21-relay-server/)
- [Proposal](../../changes/archive/2026-03-21-relay-server/proposal.md)
- [Design](../../changes/archive/2026-03-21-relay-server/design.md)
- [Tasks](../../changes/archive/2026-03-21-relay-server/tasks.md)
- [Spec: relay-server](../../changes/archive/2026-03-21-relay-server/specs/relay-server/spec.md)

---

### CHANGE 3: Relay Client (Host-side WebSocket)

Create the host-side WebSocket client that connects to the Docker proxy's `/ws/relay` and dispatches incoming messages to handlers.

**PRD refs:** REQ-005 (Host Proxy Mode — WebSocket client)

**Summary:** Create `packages/proxy/src/relay/client.ts` with a `RelayClient` class — the mirror of `RelayServer`. It connects to `ws://<host>:<port>/ws/relay` with bearer token auth, parses incoming messages, and dispatches to registered handlers. It also supports `request()` for sending a message and awaiting a correlated response (used by host MCP tool calls). This replaces the credential-service's `CredentialWSClient` for the relay protocol.

**User Story:** As the host proxy, I create a `RelayClient`, register handlers for `credential_request`, `approval_request`, `mcp_tool_call`, and `audit_event`, and connect to the Docker proxy. When messages arrive, my handlers are called with typed messages.

**Scope:**
- New: `packages/proxy/src/relay/client.ts` — `RelayClient` class
  - `constructor(config: { url: string; token: string; defaultTimeoutMs?: number })`
  - `connect(): Promise<void>` — WebSocket connection with auth header
  - `registerHandler(type: string, handler: (msg) => void)` — message dispatch
  - `send(message: RelayMessage): void` — send to Docker proxy
  - `request(message: RelayMessage, timeoutMs?: number): Promise<RelayMessage>` — send and await correlated response
  - `disconnect(): void`
  - `isConnected(): boolean`
- New: `packages/proxy/tests/relay/client.test.ts` — connection, auth, message dispatch, request/response, disconnect

**Testable output:** Client connects to mock WS server with valid token → connected. Invalid token → rejected. Incoming messages dispatched to correct handler by type. `send()` delivers message to server. `request()` resolves on correlated response, rejects on timeout. `disconnect()` closes cleanly. `npx tsc --noEmit` compiles. `npx vitest run packages/proxy/tests/` passes.

**Implemented** — [Archived spec](../../changes/archive/2026-03-21-relay-client/)
- [Proposal](../../changes/archive/2026-03-21-relay-client/proposal.md)
- [Design](../../changes/archive/2026-03-21-relay-client/design.md)
- [Tasks](../../changes/archive/2026-03-21-relay-client/tasks.md)
- [Spec: relay-client](../../changes/archive/2026-03-21-relay-client/specs/relay-client/spec.md)

---

### CHANGE 4: Move Credential Service into Proxy Package

Absorb `packages/credential-service` into `packages/proxy/src/credentials/`. Delete the standalone package. Update all imports.

**PRD refs:** REQ-004 (Absorb Credential Service into Proxy)

**Summary:** Copy the credential service source files into the proxy package under `src/credentials/`: `resolver.ts`, `service.ts`, `keychain.ts`, `env-file.ts`, `schemas.ts`, `audit.ts`. The credential audit module (`audit.ts`) needs adaptation — instead of writing to SQLite directly, it will emit audit entries that the host proxy can handle (preparation for CHANGE 6). Update `packages/proxy/src/index.ts` to export credential types. Update all CLI imports from `@clawmasons/credential-service` to `@clawmasons/proxy`. Delete `packages/credential-service/` entirely. Update the monorepo workspace config to remove the credential-service package.

**User Story:** As a developer, I import `CredentialService` and `CredentialResolver` from `@clawmasons/proxy` instead of `@clawmasons/credential-service`. The API is identical. The credential-service package no longer exists.

**Scope:**
- New: `packages/proxy/src/credentials/resolver.ts` — copied from `packages/credential-service/src/resolver.ts`
- New: `packages/proxy/src/credentials/service.ts` — copied from `packages/credential-service/src/service.ts`
- New: `packages/proxy/src/credentials/keychain.ts` — copied from `packages/credential-service/src/keychain.ts`
- New: `packages/proxy/src/credentials/env-file.ts` — copied from `packages/credential-service/src/env-file.ts`
- New: `packages/proxy/src/credentials/schemas.ts` — copied from `packages/credential-service/src/schemas.ts`
- New: `packages/proxy/src/credentials/audit.ts` — adapted from `packages/credential-service/src/audit.ts` (emit entries instead of SQLite writes)
- New: `packages/proxy/src/credentials/index.ts` — barrel exports
- Modify: `packages/proxy/src/index.ts` — export credentials module
- Modify: `packages/proxy/package.json` — no new deps needed (ws already present, remove better-sqlite3 in CHANGE 6)
- Modify: `packages/cli/src/cli/commands/run-agent.ts` — update imports from `@clawmasons/credential-service` to `@clawmasons/proxy`
- Modify: any other files importing from `@clawmasons/credential-service`
- Delete: `packages/credential-service/` (entire directory)
- Modify: root `package.json` or workspace config — remove credential-service from workspaces
- New: `packages/proxy/tests/credentials/resolver.test.ts` — migrated tests
- New: `packages/proxy/tests/credentials/service.test.ts` — migrated tests

**Testable output:** `@clawmasons/credential-service` no longer exists. `CredentialResolver` imported from `@clawmasons/proxy` resolves credentials with same priority order (env > keychain > .env). `CredentialService.handleRequest()` validates access and resolves. All existing credential tests pass from new location. No TypeScript import errors. `npx tsc --noEmit` compiles. `npx vitest run packages/proxy/tests/` passes.

**Implemented** — [Archived spec](../../changes/archive/2026-03-21-move-credential-service/)
- [Proposal](../../changes/archive/2026-03-21-move-credential-service/proposal.md)
- [Design](../../changes/archive/2026-03-21-move-credential-service/design.md)
- [Tasks](../../changes/archive/2026-03-21-move-credential-service/tasks.md)

---

### CHANGE 5: Credential Requests via Relay

Wire the Docker proxy's `credential_request` MCP tool to use the relay protocol instead of the old `CredentialRelay` WebSocket handler. Wire the host-side relay client to handle credential requests using the `CredentialService`.

**PRD refs:** REQ-003 (Credential Resolution via Relay)

**Summary:** On the Docker side: modify `packages/proxy/src/server.ts` so the `credential_request` tool handler sends a `credential_request` relay message via `RelayServer.request()` instead of calling `CredentialRelay.handleCredentialRequest()`. On the host side: register a `credential_request` handler on the `RelayClient` that calls `CredentialService.handleRequest()` and sends back a `credential_response`. Delete `packages/proxy/src/handlers/credential-relay.ts` — it's fully replaced by the relay. Remove the `/ws/credentials` endpoint from `server.ts`.

**User Story:** As an agent, I call the `credential_request` tool. The Docker proxy sends the request over `/ws/relay` to the host proxy. The host proxy resolves it using the local `CredentialService` and returns the value. The flow is identical from the agent's perspective — only the internal plumbing changed.

**Scope:**
- Modify: `packages/proxy/src/server.ts` — `credential_request` tool uses `RelayServer.request()` instead of `CredentialRelay`; remove `/ws/credentials` upgrade path
- Delete: `packages/proxy/src/handlers/credential-relay.ts` — fully replaced by relay
- Modify: `packages/proxy/src/index.ts` — remove `CredentialRelay` export
- New: `packages/proxy/src/credentials/relay-handler.ts` — host-side handler that bridges `RelayClient` → `CredentialService` → `credential_response`
- Modify: `packages/proxy/tests/` — update credential flow tests to use relay
- Delete: `packages/proxy/tests/handlers/credential-relay.test.ts` — replaced by relay tests

**Testable output:** Agent calls `credential_request` tool → Docker proxy sends `credential_request` over relay → host handler resolves credential → `credential_response` returns to Docker proxy → agent receives value. Timeout on no response returns error to agent. `/ws/credentials` endpoint returns 404. `CredentialRelay` class no longer exists. `npx tsc --noEmit` compiles. `npx vitest run packages/proxy/tests/` passes.

**Implemented** — [Archived spec](../../changes/archive/2026-03-21-credential-requests-via-relay/)
- [Proposal](../../changes/archive/2026-03-21-credential-requests-via-relay/proposal.md)
- [Design](../../changes/archive/2026-03-21-credential-requests-via-relay/design.md)
- [Tasks](../../changes/archive/2026-03-21-credential-requests-via-relay/tasks.md)

---

### CHANGE 6: Audit Events via Relay + Remove SQLite

Replace SQLite audit logging with relay `audit_event` messages. Create a host-side JSONL audit writer. Remove `better-sqlite3` and `db.ts` from the proxy package.

**PRD refs:** REQ-008 (Remove SQLite from Proxy Package), REQ-009 (Audit Events via Relay), REQ-015 (Host Proxy Audit Persistence)

**Summary:** Modify `packages/proxy/src/hooks/audit.ts` to send `audit_event` messages over the relay instead of calling `insertAuditLog()`. Audit events are fire-and-forget (no response expected). Create `packages/proxy/src/audit/writer.ts` — a host-side module that receives `audit_event` messages and appends them as JSON lines to `~/.mason/data/audit.jsonl`. Delete `packages/proxy/src/db.ts`. Remove `better-sqlite3` from `packages/proxy/package.json`. Update `ProxyServerConfig` to remove the `db` field — replace with a reference to `RelayServer` for audit emission.

**User Story:** As an operator, after an agent session, I find all audit events in `~/.mason/data/audit.jsonl` on my host machine. No SQLite database exists in the Docker container. The proxy Docker image is smaller without `better-sqlite3`.

**Scope:**
- Modify: `packages/proxy/src/hooks/audit.ts` — replace `insertAuditLog(db, ...)` with `relay.send(auditEventMessage)`. Remove all DB imports.
- New: `packages/proxy/src/audit/writer.ts` — `AuditWriter` class
  - `constructor(config: { filePath?: string })` — defaults to `~/.mason/data/audit.jsonl`
  - `write(event: AuditEventMessage): void` — append JSON line
  - `close(): void`
- Delete: `packages/proxy/src/db.ts`
- Modify: `packages/proxy/src/server.ts` — remove `db` from `ProxyServerConfig`, remove DB open/close, pass `RelayServer` to audit hooks
- Modify: `packages/proxy/package.json` — remove `better-sqlite3` from dependencies
- Modify: `packages/proxy/src/index.ts` — remove DB exports, add `AuditWriter` export
- New: `packages/proxy/tests/audit/writer.test.ts` — JSONL write, append behavior, directory creation
- Modify: `packages/proxy/tests/hooks/audit.test.ts` — use relay mock instead of DB

**Testable output:** Tool call triggers audit pre/post hooks → `audit_event` message sent over relay. Host-side `AuditWriter` appends JSON line to file. `better-sqlite3` not in `package.json`. `db.ts` does not exist. `ProxyServerConfig` has no `db` field. `npx tsc --noEmit` compiles. `npx vitest run packages/proxy/tests/` passes.

**Implemented** — [Archived spec](../../changes/archive/audit-events-relay-remove-sqlite/)
- [Proposal](../../changes/archive/audit-events-relay-remove-sqlite/proposal.md)
- [Design](../../changes/archive/audit-events-relay-remove-sqlite/design.md)
- [Tasks](../../changes/archive/audit-events-relay-remove-sqlite/tasks.md)

---

### CHANGE 7: Approvals via Relay + osascript Dialog

Replace SQLite-based approval polling with relay `approval_request`/`approval_response` messages. Implement native macOS dialog via `osascript` on the host.

**PRD refs:** REQ-007 (Approvals via Relay)

**Summary:** Modify `packages/proxy/src/hooks/approval.ts` to send an `approval_request` message via `RelayServer.request()` instead of creating a DB row and polling. The relay `request()` call blocks until the host proxy responds with `approval_response` or the TTL expires. Create `packages/proxy/src/approvals/dialog.ts` with an `osascript`-based dialog function that displays the tool name and arguments, with Approve/Deny buttons. Create `packages/proxy/src/approvals/handler.ts` that registers as a handler for `approval_request` messages on the `RelayClient`, invokes the dialog, and sends back `approval_response`. On non-macOS platforms, auto-approve with a warning log. Remove all SQLite approval functions (they were in the now-deleted `db.ts`).

**User Story:** As an operator, when my agent tries to call `github_delete_repo` which requires approval, I see a native macOS dialog: "Agent 'researcher' wants to call github_delete_repo with {owner: 'acme', repo: 'test'}. [Deny] [Approve]". I click Approve, and the tool executes.

**Scope:**
- Modify: `packages/proxy/src/hooks/approval.ts` — replace `requestApproval()` internals: use `relay.request(approvalRequestMessage, ttl)` instead of DB polling. Remove all DB imports.
- New: `packages/proxy/src/approvals/dialog.ts` — `showApprovalDialog(toolName, arguments, agentName): Promise<boolean>`
  - Uses `child_process.exec` to run `osascript -e 'display dialog ...'`
  - Returns `true` for Approve, `false` for Deny or close
  - On non-macOS: returns `true` with console warning
- New: `packages/proxy/src/approvals/handler.ts` — `ApprovalHandler` class
  - Registers for `approval_request` on `RelayClient`
  - Calls `showApprovalDialog()`, sends `approval_response`
  - Handles TTL timeout (sends `status: "denied"`)
- New: `packages/proxy/tests/approvals/dialog.test.ts` — mock exec, test approve/deny/close paths
- New: `packages/proxy/tests/approvals/handler.test.ts` — handler registration, message flow
- Modify: `packages/proxy/tests/hooks/approval.test.ts` — use relay mock

**Testable output:** Tool matching approval pattern → `approval_request` sent over relay → host handler invokes dialog → `approval_response` returns "approved" or "denied" → Docker proxy proceeds or blocks. TTL expiry → auto-deny. Non-macOS → auto-approve with warning. No SQLite references in approval code. `npx tsc --noEmit` compiles. `npx vitest run packages/proxy/tests/` passes.

**Implemented** — [Archived spec](../../changes/archive/2026-03-21-approvals-via-relay/)
- [Proposal](../../changes/archive/2026-03-21-approvals-via-relay/proposal.md)
- [Design](../../changes/archive/2026-03-21-approvals-via-relay/design.md)
- [Tasks](../../changes/archive/2026-03-21-approvals-via-relay/tasks.md)

---

### CHANGE 8: Host Proxy Orchestrator

Create the `HostProxy` class that combines relay client, credential service, approval handler, and audit writer into a single entry point for host-side operation.

**PRD refs:** REQ-005 (Host Proxy Mode)

**Summary:** Create `packages/proxy/src/host-proxy.ts` with a `HostProxy` class that orchestrates all host-side services. On `start()`: (1) initialize `CredentialService` with `CredentialResolver`, (2) create `AuditWriter`, (3) create `ApprovalHandler`, (4) create `RelayClient` with handlers registered for `credential_request`, `approval_request`, `audit_event`, (5) connect to Docker proxy's `/ws/relay`. On `stop()`: disconnect relay, close audit writer, shut down credential service. The host proxy does NOT listen on any port — it's purely a client.

**User Story:** As the CLI, I create a `HostProxy` with the relay URL, token, and role config, then call `start()`. It connects to the Docker proxy and handles all host-side responsibilities. When the session ends, I call `stop()` for clean shutdown.

**Scope:**
- New: `packages/proxy/src/host-proxy.ts` — `HostProxy` class
  - `constructor(config: HostProxyConfig)` — relay URL, token, env file path, keychain service
  - `start(): Promise<void>` — initialize all services, connect relay
  - `stop(): Promise<void>` — clean shutdown
  - Private: wires credential/approval/audit handlers to relay client
- Modify: `packages/proxy/src/index.ts` — export `HostProxy`
- New: `packages/proxy/tests/host-proxy.test.ts` — start/stop lifecycle, handler registration, shutdown cleanup

**Testable output:** `HostProxy.start()` connects to relay, registers handlers for all message types. Credential request received → resolved via `CredentialService`. Approval request received → dialog shown (mocked). Audit event received → written to JSONL. `HostProxy.stop()` disconnects cleanly. No port listening. `npx tsc --noEmit` compiles. `npx vitest run packages/proxy/tests/` passes.

**Implemented** — [Archived spec](../../changes/archive/2026-03-21-host-proxy-orchestrator/)
- [Proposal](../../changes/archive/2026-03-21-host-proxy-orchestrator/proposal.md)
- [Design](../../changes/archive/2026-03-21-host-proxy-orchestrator/design.md)
- [Tasks](../../changes/archive/2026-03-21-host-proxy-orchestrator/tasks.md)

---

### CHANGE 9: CLI Integration — Start Host Proxy Instead of Credential Service

Update the CLI's `run-agent` command to start a `HostProxy` instance instead of a standalone `CredentialService` + `CredentialWSClient`.

**PRD refs:** REQ-006 (CLI Starts Host Proxy Instead of Credential Service)

**Summary:** Modify `packages/cli/src/cli/commands/run-agent.ts`: replace the `defaultStartCredentialService()` function with `defaultStartHostProxy()` that creates and starts a `HostProxy` instance. Update the generated Docker Compose config to use `RELAY_TOKEN` instead of `CREDENTIAL_PROXY_TOKEN`. The Docker proxy container no longer needs the credential-service container — it talks directly to the host proxy over the relay. Update `packages/cli/src/acp/session.ts` similarly for ACP session flows. Update `packages/cli/src/cli/commands/proxy.ts` to pass `RelayServer` instead of `CredentialRelay` to `ProxyServer`.

**User Story:** As an operator, when I run `mason run-agent researcher dev`, the CLI starts a host proxy on my machine that connects to the Docker proxy via WebSocket. Credentials, approvals, and audit events all flow through this single connection. No separate credential-service container is needed.

**Scope:**
- Modify: `packages/cli/src/cli/commands/run-agent.ts` — replace `defaultStartCredentialService` with `defaultStartHostProxy`, update token naming
- Modify: `packages/cli/src/acp/session.ts` — rename `credentialProxyToken` to `relayToken`, update compose env var
- Modify: `packages/cli/src/materializer/docker-generator.ts` — rename `credentialProxyToken` to `relayToken` in types and compose output
- Modify: `packages/proxy/src/host-proxy.ts` — add `envCredentials` support to `HostProxyConfig`
- No change: `packages/cli/src/cli/commands/proxy.ts` — already reads `RELAY_TOKEN` with fallback
- No change: `packages/cli/src/cli/proxy-entry.ts` — delegates to `startProxy()`, no changes needed
- Modify: relevant CLI tests

**Testable output:** `run-agent` starts a `HostProxy` instead of `CredentialService`. Docker Compose has `RELAY_TOKEN` (not `CREDENTIAL_PROXY_TOKEN`). No credential-service container in compose. Credential flow works end-to-end: agent → Docker proxy → relay → host proxy → credential resolved. `npx tsc --noEmit` compiles. `npx vitest run packages/cli/tests/` passes.

**Implemented** — [Archived spec](../../changes/archive/2026-03-21-cli-host-proxy-integration/)
- [Proposal](../../changes/archive/2026-03-21-cli-host-proxy-integration/proposal.md)
- [Design](../../changes/archive/2026-03-21-cli-host-proxy-integration/design.md)
- [Tasks](../../changes/archive/2026-03-21-cli-host-proxy-integration/tasks.md)

---

### CHANGE 10: Host MCP Server Schema — `location` Field

Add the `location` field to the app config schema and `ResolvedApp` type to distinguish proxy-side and host-side MCP servers.

**PRD refs:** REQ-010 (Host MCP Server Configuration)

**Summary:** Modify `packages/shared/src/schemas/role-types.ts` to add `location: z.enum(["proxy", "host"]).optional().default("proxy")` to `appConfigSchema`. Modify `packages/shared/src/types.ts` to add `location: "proxy" | "host"` to the `ResolvedApp` interface. Update the role resolver in the CLI to propagate the `location` field during resolution. This is a non-breaking schema change — existing roles without `location` default to `"proxy"`.

**User Story:** As a role author, I add `location: "host"` to an app config in my role definition. The schema validates it. When the role is resolved, the app's `location` field is set to `"host"`.

**Scope:**
- Modify: `packages/shared/src/schemas/role-types.ts` — add `location` to `appConfigSchema`
- Modify: `packages/shared/src/types.ts` — add `location` to `ResolvedApp`
- Modify: `packages/cli/src/resolver/resolve.ts` — propagate `location` during app resolution
- New/Modify: `packages/shared/tests/schemas/role-types.test.ts` — validate location field (valid values, default, invalid)
- Modify: tests constructing `ResolvedApp` objects — add `location` field

**Testable output:** Schema validates `{ location: "host" }` and `{ location: "proxy" }`. Omitting `location` defaults to `"proxy"`. Schema rejects `{ location: "invalid" }`. `ResolvedApp` type includes `location`. `npx tsc --noEmit` compiles. `npx vitest run packages/shared/tests/` passes.

**Implemented** — [Archived spec](../../changes/archive/2026-03-21-host-mcp-location-field/)
- [Proposal](../../changes/archive/2026-03-21-host-mcp-location-field/proposal.md)
- [Design](../../changes/archive/2026-03-21-host-mcp-location-field/design.md)
- [Tasks](../../changes/archive/2026-03-21-host-mcp-location-field/tasks.md)
- [Spec: host-mcp-location-field](../../changes/archive/2026-03-21-host-mcp-location-field/specs/host-mcp-location-field/spec.md)

---

### CHANGE 11: Host MCP Server Lifecycle — Start, Discover, Register

The host proxy starts MCP servers declared with `location: "host"`, discovers their tools, and registers them with the Docker proxy over the relay.

**PRD refs:** REQ-011 (Host MCP Server Lifecycle)

**Summary:** Extend `HostProxy` to accept a list of `ResolvedApp` entries with `location: "host"`. On `start()`, for each host app: (1) spawn the MCP server process using `StdioClientTransport` (reuse transport creation from `packages/proxy/src/upstream.ts`), (2) initialize the MCP client and call `tools/list` to discover tools, (3) send an `mcp_tools_register` message over the relay with the app name and tool definitions, (4) wait for `mcp_tools_registered` confirmation. On the Docker proxy side: extend `RelayServer` to handle incoming `mcp_tools_register` messages by creating stub route entries in the `ToolRouter`. The stub routes forward tool calls back over the relay (implemented in CHANGE 12). Extend `ToolRouter` to support dynamic `addRoutes()` for host tool registration.

**User Story:** As an operator with an iOS dev role that declares `xcode-sim` with `location: "host"`, when I start the session, the host proxy spawns the Xcode MCP server on my Mac, discovers its tools (`run_simulator`, `list_devices`), and registers them with the Docker proxy. The agent sees these tools in `tools/list`.

**Scope:**
- Modify: `packages/proxy/src/host-proxy.ts` — accept `hostApps: ResolvedApp[]`, start MCP servers, discover tools, register via relay
- Modify: `packages/proxy/src/relay/server.ts` — handle `mcp_tools_register` messages, create stub routes
- Modify: `packages/proxy/src/router.ts` — add `addRoutes(appName, tools)` method for dynamic host tool registration
- Modify: `packages/proxy/src/server.ts` — include dynamically registered host tools in `tools/list` response
- New: `packages/proxy/tests/host-mcp/lifecycle.test.ts` — mock MCP server, tool discovery, relay registration
- Modify: `packages/proxy/tests/router.test.ts` — test `addRoutes()` dynamic registration

**Testable output:** Host proxy starts mock MCP server → discovers tools → sends `mcp_tools_register` → Docker proxy creates stub routes → `tools/list` includes host tools with correct prefixing. `mcp_tools_registered` confirmation sent back. `npx tsc --noEmit` compiles. `npx vitest run packages/proxy/tests/` passes.

**Implemented** — [Archived spec](../../changes/archive/2026-03-21-host-mcp-lifecycle/)
- [Proposal](../../changes/archive/2026-03-21-host-mcp-lifecycle/proposal.md)
- [Design](../../changes/archive/2026-03-21-host-mcp-lifecycle/design.md)
- [Tasks](../../changes/archive/2026-03-21-host-mcp-lifecycle/tasks.md)

---

### CHANGE 12: Host MCP Server Tool Call Routing

Forward agent tool calls for host MCP server tools from the Docker proxy to the host proxy via relay, and return results.

**PRD refs:** REQ-012 (Host MCP Server Tool Call Routing)

**Summary:** When the Docker proxy's `ToolRouter` resolves a tool call to a host stub route (created in CHANGE 11), instead of forwarding to an upstream MCP client, it sends an `mcp_tool_call` message over the relay via `RelayServer.request()`. On the host side: extend `HostProxy` to handle `mcp_tool_call` messages by forwarding the call to the local MCP server client (started in CHANGE 11) via `client.callTool()`, then sending back an `mcp_tool_result` message. Include a configurable timeout (default 60s) for host tool calls. Update the CLI to partition role apps by `location` and pass `hostApps` to the host proxy and `proxyApps` to the Docker compose configuration.

**User Story:** As an agent, I call `xcode_run_simulator` and get back the result. I don't know or care that the tool runs on the host machine — the Docker proxy transparently relays the call.

**Scope:**
- Modify: `packages/proxy/src/server.ts` — in the `CallToolRequestSchema` handler, detect host stub routes and use `relay.request(mcpToolCallMessage)` instead of `upstream.callTool()`
- Modify: `packages/proxy/src/host-proxy.ts` — register `mcp_tool_call` handler that forwards to local MCP client and returns `mcp_tool_result`
- Modify: `packages/cli/src/cli/commands/run-agent.ts` — partition apps by location, pass `hostApps` to `HostProxy`
- New: `packages/proxy/tests/host-mcp/routing.test.ts` — tool call forwarding, response correlation, timeout handling
- Modify: `packages/proxy/tests/host-mcp/lifecycle.test.ts` — extend with end-to-end tool call flow

**Testable output:** Agent calls host tool → Docker proxy sends `mcp_tool_call` over relay → host proxy forwards to local MCP server → result returns as `mcp_tool_result` → agent receives result. Timeout → agent receives error. Non-host tools unaffected (routed to upstream as before). `npx tsc --noEmit` compiles. `npx vitest run packages/proxy/tests/` passes.

**Implemented** — [Archived spec](../../changes/archive/2026-03-21-host-mcp-tool-routing/)
- [Proposal](../../changes/archive/2026-03-21-host-mcp-tool-routing/proposal.md)
- [Design](../../changes/archive/2026-03-21-host-mcp-tool-routing/design.md)
- [Tasks](../../changes/archive/2026-03-21-host-mcp-tool-routing/tasks.md)
