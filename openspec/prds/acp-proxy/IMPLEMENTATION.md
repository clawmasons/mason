# ACP Proxy — Implementation Plan

**PRD:** [openspec/prds/acp-proxy/PRD.md](./PRD.md)
**Phase:** P0 (Core ACP Proxy)

---

## Implementation Steps

### CHANGE 1: MCP Server Matcher

Create `packages/cli/src/acp/matcher.ts` — pure logic for matching ACP client `mcpServers` entries against chapter's resolved Apps.

**PRD refs:** REQ-002 (MCP Server Matching)

**Summary:** Given a map of `mcpServers` from an ACP client and a list of resolved Apps from the agent dependency graph, produce a `MatchResult` with matched servers (linked to their chapter App), unmatched servers, and any ambiguity warnings. Matching uses `getAppShortName()` as the primary key (case-insensitive), with command/URL as secondary confirmation for disambiguation.

**User Story:** As the ACP proxy startup logic, I receive `{ "github": {...}, "slack": {...}, "personal-notes": {...} }` from the ACP client. I call `matchServers(mcpServers, resolvedApps)` and get back `{ matched: [{name: "github", app: resolvedGithubApp}, {name: "slack", app: resolvedSlackApp}], unmatched: [{name: "personal-notes", reason: "no matching chapter App"}] }`.

**Scope:**
- New file: `packages/cli/src/acp/matcher.ts`
- New test: `packages/cli/tests/acp/matcher.test.ts`
- Reuses: `getAppShortName()` from `packages/shared/src/toolfilter.ts`
- Types:
  ```typescript
  interface McpServerConfig {
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    headers?: Record<string, string>;
  }
  interface MatchedServer {
    name: string;
    config: McpServerConfig;
    app: ResolvedApp;
    appShortName: string;
  }
  interface UnmatchedServer {
    name: string;
    config: McpServerConfig;
    reason: string;
  }
  interface MatchResult {
    matched: MatchedServer[];
    unmatched: UnmatchedServer[];
  }
  function matchServers(
    mcpServers: Record<string, McpServerConfig>,
    apps: ResolvedApp[]
  ): MatchResult;
  ```

**Testable output:** Unit tests verifying: (a) name-based matching (case-insensitive), (b) unmatched servers get descriptive reasons, (c) empty mcpServers returns empty result, (d) all servers unmatched when no apps exist, (e) duplicate app short names use command/URL for disambiguation.

**Implemented**

- Archived change: [2026-03-09-mcp-server-matcher](../../changes/archive/2026-03-09-mcp-server-matcher/)
  - [Proposal](../../changes/archive/2026-03-09-mcp-server-matcher/proposal.md)
  - [Design](../../changes/archive/2026-03-09-mcp-server-matcher/design.md)
  - [Tasks](../../changes/archive/2026-03-09-mcp-server-matcher/tasks.md)
- Spec: [mcp-server-matcher](../../specs/mcp-server-matcher/spec.md)
- Source: `packages/cli/src/acp/matcher.ts`
- Tests: `packages/cli/tests/acp/matcher.test.ts`

---

### CHANGE 2: MCP Server Rewriter & Warning Generator

Create `packages/cli/src/acp/rewriter.ts` and `packages/cli/src/acp/warnings.ts` — transforms matched/unmatched results into container-ready MCP config and structured warnings.

**PRD refs:** REQ-003 (MCP Server Rewriting), REQ-004 (Unmatched MCP Server Warning)

**Summary:** Given a `MatchResult` from CHANGE 1 and proxy connection details (endpoint URL, session token), produce: (1) the rewritten `mcpServers` config containing only a single `chapter` entry pointing to the proxy, and (2) structured warning messages for each dropped server. The rewriter extracts credential keys from matched servers' `env` fields for later injection into the credential-service session.

**User Story:** As the ACP proxy, after matching servers I call `rewriteMcpConfig(matchResult, proxyEndpoint, sessionToken)` and get `{ mcpServers: { chapter: { url: "http://proxy:3000/mcp", headers: { Authorization: "Bearer <token>" } } }, extractedCredentials: { GITHUB_TOKEN: "ghp_...", SLACK_TOKEN: "xoxb-..." } }`. I also call `generateWarnings(matchResult.unmatched)` and get formatted warning strings for stderr and audit logging.

**Scope:**
- New file: `packages/cli/src/acp/rewriter.ts`
- New file: `packages/cli/src/acp/warnings.ts`
- New tests: `packages/cli/tests/acp/rewriter.test.ts`, `packages/cli/tests/acp/warnings.test.ts`
- Functions:
  - `rewriteMcpConfig(matchResult, proxyUrl, sessionToken): RewriteResult`
  - `extractCredentials(matched: MatchedServer[]): Record<string, string>`
  - `generateWarnings(unmatched: UnmatchedServer[]): string[]`
  - `formatWarning(server: UnmatchedServer): string`

**Testable output:** Unit tests: (a) rewritten config has single `chapter` entry with correct URL and auth header, (b) credentials extracted from matched servers' env fields, (c) no warnings when all servers match, (d) warning format matches PRD spec (`[chapter acp-proxy] WARNING: Dropping unmatched MCP server "..."`), (e) empty matched list still produces valid (empty tools) proxy config.

**Implemented**

- Archived change: [2026-03-10-mcp-server-rewriter](../../changes/archive/2026-03-10-mcp-server-rewriter/)
  - [Proposal](../../changes/archive/2026-03-10-mcp-server-rewriter/proposal.md)
  - [Design](../../changes/archive/2026-03-10-mcp-server-rewriter/design.md)
  - [Tasks](../../changes/archive/2026-03-10-mcp-server-rewriter/tasks.md)
- Spec: [mcp-server-rewriter](../../specs/mcp-server-rewriter/spec.md)
- Source: `packages/cli/src/acp/rewriter.ts`, `packages/cli/src/acp/warnings.ts`
- Tests: `packages/cli/tests/acp/rewriter.test.ts`, `packages/cli/tests/acp/warnings.test.ts`

---

### CHANGE 3: MCP Agent Package

Create `packages/mcp-agent/` — a proper agent package that responds to ACP requests and provides an interactive MCP tool-calling interface. Replaces the ad-hoc `mcp-test` agent fixture.

**PRD refs:** PRD §7.7 (MCP ACP Agent materializer)

**Summary:** Package up a general-purpose MCP agent that: (1) connects to the chapter proxy for tool access, (2) supports both direct REPL mode (existing mcp-test behavior) and ACP agent mode (`--acp` flag), (3) in ACP mode, listens for incoming ACP connections and processes tool call requests where the user prompt must exactly match a tool name + JSON args, (4) shows a help message listing available tools when an unrecognized command is entered. This becomes the standard test/debug agent for chapter.

**User Story:** As an agent operator, I want to test the full ACP pipeline without needing Claude Code or pi-coding-agent. I run `chapter acp-proxy --agent mcp-agent --role myrole`, connect an ACP client, and type `github_create_pr {"title": "test"}` to call tools through the governed proxy. If I type something wrong, I see a help message listing all available tools.

**Scope:**
- New directory: `packages/mcp-agent/`
  - `src/index.ts` — main entry: mode detection (REPL vs ACP), proxy connection, tool listing, command parsing
  - `src/acp-server.ts` — ACP agent server: listens for ACP connections, routes messages
  - `src/tool-caller.ts` — shared tool-calling logic: parse command, call via MCP client, format response
  - `package.json` — `@clawmasons/mcp-agent`, bin: `mcp-agent`
- Update: `e2e/fixtures/test-chapter/agents/mcp-test/` — depend on `@clawmasons/mcp-agent` instead of inline implementation
- New tests: `packages/mcp-agent/tests/tool-caller.test.ts`, `packages/mcp-agent/tests/acp-server.test.ts`
- Build: esbuild bundle for Docker image usage (same pattern as agent-entry)

**Testable output:** (a) REPL mode: start mcp-agent, type `list` → see available tools, type `<tool> <json>` → call tool and see result, type unknown command → see help. (b) ACP mode: start with `--acp`, connect ACP client, send tool command → get result. (c) Existing mcp-test e2e tests pass with new package.

**Implemented**

- Archived change: [2026-03-10-mcp-agent-package](../../changes/archive/2026-03-10-mcp-agent-package/)
  - [Proposal](../../changes/archive/2026-03-10-mcp-agent-package/proposal.md)
  - [Design](../../changes/archive/2026-03-10-mcp-agent-package/design.md)
  - [Tasks](../../changes/archive/2026-03-10-mcp-agent-package/tasks.md)
- Spec: [mcp-agent-package](../../specs/mcp-agent-package/spec.md)
- Source: `packages/mcp-agent/src/` (index.ts, tool-caller.ts, mcp-client.ts, acp-server.ts)
- Tests: `packages/mcp-agent/tests/tool-caller.test.ts`
- Updated fixture: `e2e/fixtures/test-chapter/agents/mcp-test/` (delegates to @clawmasons/mcp-agent)

---

### CHANGE 4: Credential Session Override Support

Extend the credential-service to accept session-scoped credential overrides from the ACP proxy, so that credentials extracted from ACP client `mcpServers` env fields take precedence over host-resolved credentials.

**PRD refs:** REQ-007 (Credential Flow Preservation)

**Summary:** When the ACP proxy starts a Docker session, it extracts credentials from the client's mcpServers config (e.g., `GITHUB_TOKEN=ghp_abc123` from the `env` field). These should be injected into the credential-service as session overrides — if the agent requests `GITHUB_TOKEN`, the session override is returned instead of resolving from host env/keychain/.env. This ensures client-provided credentials flow through the governed pipeline without touching the agent container filesystem.

**User Story:** As a developer using Zed, my ACP config has `"env": {"GITHUB_TOKEN": "ghp_my_token"}` for the github server. When the chapter agent requests `GITHUB_TOKEN` via the credential_request tool, it receives `ghp_my_token` — the value I provided, not whatever is in the server's `.env` file.

**Scope:**
- Modify: `packages/credential-service/src/service.ts` — add `setSessionOverrides(overrides: Record<string, string>)` method; check overrides before other resolution sources
- Modify: `packages/credential-service/src/resolver.ts` — session override as highest-priority resolution source
- Modify: `packages/proxy/src/handlers/credential-relay.ts` — support passing session overrides when establishing the credential-service connection
- New tests: `packages/credential-service/tests/session-overrides.test.ts`

**Testable output:** Unit tests: (a) session override returns override value instead of env var, (b) non-overridden credentials still resolve from env/keychain, (c) session overrides don't persist across sessions, (d) empty overrides behave identically to current behavior.

**Implemented**

- Archived change: [2026-03-10-credential-session-overrides](../../changes/archive/2026-03-10-credential-session-overrides/)
  - [Proposal](../../changes/archive/2026-03-10-credential-session-overrides/proposal.md)
  - [Design](../../changes/archive/2026-03-10-credential-session-overrides/design.md)
  - [Tasks](../../changes/archive/2026-03-10-credential-session-overrides/tasks.md)
- Spec: [credential-session-overrides](../../specs/credential-session-overrides/spec.md)
- Source: `packages/credential-service/src/resolver.ts`, `packages/credential-service/src/service.ts`, `packages/credential-service/src/cli.ts`
- Tests: `packages/credential-service/tests/session-overrides.test.ts`

---

### CHANGE 5: Agent Schema ACP Extension & Materializer ACP Mode

Add the `acp` field to the agent schema and extend Claude Code + pi-coding-agent materializers to generate ACP agent configuration.

**PRD refs:** PRD §7.6 (Agent Schema Extension), PRD §7.7 (Materializer Changes), REQ-006 (Container ACP Agents)

**Summary:** (1) Add optional `acp` field to `agentChapterFieldSchema` with `port` config. (2) Add an `ACP_RUNTIME_COMMANDS` mapping from runtime name to ACP agent command. (3) Extend the Claude Code materializer to additionally generate ACP agent config when running in ACP mode. (4) Extend the pi-coding-agent materializer similarly. (5) Create an mcp-agent materializer for the new package from CHANGE 3.

**User Story:** As the `chapter acp-proxy` command, when I resolve an agent with `runtimes: ["claude-code"]` and start it in ACP mode, the materializer generates the standard workspace files PLUS the ACP agent config so `claude-agent-acp` knows to listen for incoming ACP connections on the configured port.

**Scope:**
- Modify: `packages/shared/src/schemas/agent.ts` — add `acp: z.object({ port: z.number().default(3002) }).optional()`
- Modify: `packages/shared/src/types.ts` — add `acp` to `ResolvedAgent` type
- Modify: `packages/cli/src/materializer/claude-code.ts` — accept `acpMode?: boolean` option; when true, add ACP agent config to materialized workspace
- Modify: `packages/cli/src/materializer/pi-coding-agent.ts` — same ACP mode extension
- New file: `packages/cli/src/materializer/mcp-agent.ts` — materializer for the mcp-agent package
- Add: `ACP_RUNTIME_COMMANDS` constant mapping runtime names to ACP commands
- Update tests: materializer tests verify ACP mode generates additional config

**Testable output:** (a) Agent schema accepts `acp: { port: 3002 }` field, (b) Claude Code materializer in ACP mode produces ACP-specific config file, (c) pi-coding-agent materializer same, (d) mcp-agent materializer produces correct workspace, (e) `ACP_RUNTIME_COMMANDS` correctly maps `"claude-code"` → `"claude-agent-acp"`, `"pi-coding-agent"` → `"pi-agent-acp"`, `"node"` → `"node src/index.js --acp"`.

**Implemented**

- Archived change: [2026-03-10-agent-schema-acp-extension](../../changes/archive/2026-03-10-agent-schema-acp-extension/)
  - [Proposal](../../changes/archive/2026-03-10-agent-schema-acp-extension/proposal.md)
  - [Design](../../changes/archive/2026-03-10-agent-schema-acp-extension/design.md)
  - [Tasks](../../changes/archive/2026-03-10-agent-schema-acp-extension/tasks.md)
- Spec: [agent-schema-acp-extension](../../specs/agent-schema-acp-extension/spec.md)
- Source: `packages/shared/src/schemas/agent.ts`, `packages/shared/src/types.ts`, `packages/cli/src/materializer/common.ts`, `packages/cli/src/materializer/claude-code.ts`, `packages/cli/src/materializer/pi-coding-agent.ts`, `packages/cli/src/materializer/mcp-agent.ts`
- Tests: `packages/cli/tests/materializer/claude-code.test.ts`, `packages/cli/tests/materializer/pi-coding-agent.test.ts`, `packages/cli/tests/materializer/mcp-agent.test.ts`

---

### CHANGE 6: Agent Dockerfile ACP Entrypoint

Extend `agent-dockerfile.ts` to generate Dockerfiles that support ACP agent mode entrypoints.

**PRD refs:** REQ-006 (Container ACP Agents)

**Summary:** The agent Dockerfile generator currently produces containers that run the agent runtime directly. For ACP mode, the entrypoint changes to the ACP agent command (e.g., `claude-agent-acp` instead of `claude`). The generator needs to accept an `acpMode` flag and use the `ACP_RUNTIME_COMMANDS` mapping from CHANGE 5 to set the correct entrypoint.

**User Story:** As `chapter acp-proxy`, when I generate the agent container Dockerfile for a Claude Code agent in ACP mode, the Dockerfile's CMD is `["claude-agent-acp"]` instead of the direct runtime command, so the container listens for ACP connections rather than running interactively.

**Scope:**
- Modify: `packages/cli/src/generator/agent-dockerfile.ts` — accept `acpMode?: boolean`; when true, use ACP runtime command as entrypoint
- Update tests: `packages/cli/tests/generator/agent-dockerfile.test.ts` — verify ACP mode generates correct entrypoint

**Testable output:** (a) Non-ACP mode Dockerfile unchanged (regression), (b) ACP mode Dockerfile for Claude Code uses `claude-agent-acp` CMD, (c) ACP mode for pi-coding-agent uses `pi-agent-acp`, (d) ACP mode for mcp-agent uses `node src/index.js --acp`.

**Implemented**

- Archived change: [2026-03-10-agent-dockerfile-acp-entrypoint](../../changes/archive/2026-03-10-agent-dockerfile-acp-entrypoint/)
  - [Proposal](../../changes/archive/2026-03-10-agent-dockerfile-acp-entrypoint/proposal.md)
  - [Design](../../changes/archive/2026-03-10-agent-dockerfile-acp-entrypoint/design.md)
  - [Tasks](../../changes/archive/2026-03-10-agent-dockerfile-acp-entrypoint/tasks.md)
- Spec: [agent-dockerfile-acp-entrypoint](../../specs/agent-dockerfile-acp-entrypoint/spec.md)
- Source: `packages/cli/src/generator/agent-dockerfile.ts`
- Tests: `packages/cli/tests/generator/agent-dockerfile.test.ts`

---

### CHANGE 7: ACP Bridge — Bidirectional ACP ↔ Container Communication

Create `packages/cli/src/acp/bridge.ts` — the bidirectional bridge that relays ACP protocol messages between the host-side ACP endpoint and the container-side ACP agent.

**PRD refs:** REQ-001 (ACP endpoint), PRD §7.1 (Architecture), PRD §7.4 (Tool Call Flow)

**Summary:** The ACP bridge is the core networking component. On the host side, it exposes an ACP-compliant endpoint (HTTP/WebSocket) that editors connect to. On the container side, it connects to the agent's ACP agent port inside Docker. Messages flow bidirectionally: editor requests go to the container agent, agent responses come back to the editor. The bridge handles connection lifecycle (editor connect/disconnect) and reports container agent status.

**User Story:** As a developer using Zed, I connect to `localhost:3001` (the chapter ACP endpoint). My messages are transparently relayed to the Claude Code ACP agent running inside the Docker container. Agent responses flow back to Zed. If the container dies, I get a clean error instead of a hang.

**Scope:**
- New file: `packages/cli/src/acp/bridge.ts`
- New test: `packages/cli/tests/acp/bridge.test.ts`
- Class: `AcpBridge`
  - `constructor(config: { hostPort: number; containerHost: string; containerPort: number })`
  - `start(): Promise<void>` — start host-side ACP endpoint
  - `connectToAgent(): Promise<void>` — establish connection to container ACP agent
  - `stop(): Promise<void>` — teardown both sides
  - Event emitters: `onClientConnect`, `onClientDisconnect`, `onAgentExit`
- Protocol handling: relay ACP messages without interpretation (transparent proxy)
- Error handling: connection refused, timeout, container exit

**Testable output:** Unit tests with mock HTTP servers: (a) bridge starts and accepts connections on host port, (b) messages relayed host->container and container->host, (c) client disconnect event fires, (d) agent error event fires when container connection drops, (e) bridge stop tears down cleanly, (f) connectToAgent succeeds/fails/retries appropriately.

**Implemented**

- Archived change: [2026-03-10-acp-bridge](../../changes/archive/2026-03-10-acp-bridge/)
  - [Proposal](../../changes/archive/2026-03-10-acp-bridge/proposal.md)
  - [Design](../../changes/archive/2026-03-10-acp-bridge/design.md)
  - [Tasks](../../changes/archive/2026-03-10-acp-bridge/tasks.md)
- Spec: [acp-bridge](../../specs/acp-bridge/spec.md)
- Source: `packages/cli/src/acp/bridge.ts`
- Tests: `packages/cli/tests/acp/bridge.test.ts`

---

### CHANGE 8: Docker Session Orchestration for ACP

Create the Docker session lifecycle management for ACP, adapting the existing `run-agent.ts` three-container pattern.

**PRD refs:** REQ-005 (Docker Session Lifecycle)

**Summary:** Adapt the existing `run-agent.ts` Docker Compose orchestration for ACP mode. The same three-container session (proxy + credential-service + agent) is used, but: (1) the agent container uses ACP entrypoint (from CHANGE 6), (2) the proxy container gets only matched apps (from CHANGE 1), (3) session credentials from the ACP client are passed to credential-service (from CHANGE 4), (4) the agent container exposes its ACP port for the bridge (from CHANGE 7). Session teardown happens on ACP client disconnect.

**User Story:** As the `chapter acp-proxy` command, when an ACP client connects I call `startAcpSession(matchResult, credentials, agentConfig)` and get a running Docker session with all three containers. When the ACP client disconnects, I call `stopSession()` and all containers are torn down.

**Scope:**
- New file: `packages/cli/src/acp/session.ts`
- New test: `packages/cli/tests/acp/session.test.ts`
- Reuses: Docker Compose generation patterns from `run-agent.ts`
- Reuses: Token generation, volume mounts, network setup
- Class: `AcpSession`
  - `constructor(config: AcpSessionConfig)` — agent, role, matched apps, credentials, ports
  - `start(): Promise<SessionInfo>` — generate compose file, start containers, wait for health
  - `stop(): Promise<void>` — tear down all containers
  - `isRunning(): boolean`
- Generates docker-compose.yml with:
  - proxy service: `chapter proxy --agent <name>` with matched apps only
  - credential-service: with session overrides
  - agent service: ACP mode entrypoint, exposes ACP port

**Testable output:** (a) Generated docker-compose.yml has correct three services, (b) agent service uses ACP entrypoint, (c) proxy service gets matched apps only, (d) credential-service gets session override env vars, (e) agent service exposes ACP port for bridge connection.

**Not Implemented Yet**

---

### CHANGE 9: `chapter acp-proxy` CLI Command

Create the top-level CLI command that wires together matcher, rewriter, session, and bridge.

**PRD refs:** REQ-001 (`chapter acp-proxy` CLI Command), PRD §7.3 (Startup Sequence)

**Summary:** The `chapter acp-proxy` command is the user-facing entry point. It: (1) discovers and resolves the agent, (2) computes tool filters, (3) starts the ACP endpoint and waits for a client, (4) on client connect: matches mcpServers, rewrites config, extracts credentials, starts Docker session, establishes bridge, (5) on client disconnect: tears down session. Follows the exact startup sequence in PRD §7.3.

**User Story:** As an agent operator, I run `chapter acp-proxy --agent myagent --role myrole` in my workspace. It prints "chapter acp-proxy ready — waiting for ACP client on port 3001". I open Zed and connect. The proxy matches my MCP servers, starts the Docker session, and bridges my editor to the container agent. I see matched/dropped server summary. When I close Zed, everything tears down cleanly.

**Scope:**
- New file: `packages/cli/src/cli/commands/acp-proxy.ts`
- Modify: `packages/cli/src/cli/commands/index.ts` — register the acp-proxy command
- CLI options: `--agent <name>`, `--role <name>`, `--port <number>` (default 3001), `--proxy-port <number>` (default 3000)
- Orchestration:
  1. Discover packages → resolve agent
  2. Compute tool filters
  3. Start ACP endpoint on `--port`
  4. On client connect with mcpServers:
     - `matchServers()` → `rewriteMcpConfig()` → `extractCredentials()`
     - Log warnings for unmatched servers
     - `AcpSession.start()` (Docker containers)
     - `AcpBridge.connectToAgent()` (bridge to container)
  5. On client disconnect: `AcpBridge.stop()` → `AcpSession.stop()`
  6. On SIGTERM/SIGINT: graceful shutdown
- New test: `packages/cli/tests/cli/acp-proxy.test.ts`

**Testable output:** (a) Command registers with correct options and defaults, (b) startup sequence resolves agent and computes filters, (c) ACP endpoint starts on configured port, (d) SIGTERM triggers graceful shutdown, (e) integration test: full startup → mock client connect → verify session started → disconnect → verify teardown.

**Not Implemented Yet**

---

### CHANGE 10: Audit Logging ACP Extensions

Extend audit logging to capture ACP session metadata (session type, client editor name, dropped server events).

**PRD refs:** REQ-008 (Audit Logging for ACP Sessions)

**Summary:** Add `session_type` and `acp_client` columns to the `audit_log` table. When tool calls happen in an ACP session, the audit entries include `session_type: "acp"` and `acp_client: "<editor-name>"` (when available from the ACP handshake). Additionally, log each dropped MCP server as an audit entry with `status: "dropped"`.

**User Story:** As an agent operator reviewing audit logs, I can filter by `session_type = 'acp'` to see all tool calls from ACP sessions vs direct proxy sessions. I can see which editor was used and which servers were dropped at session start.

**Scope:**
- Modify: `packages/proxy/src/db.ts` — add `session_type` and `acp_client` columns to `audit_log` table (nullable, backward-compatible)
- Modify: `packages/proxy/src/hooks/audit.ts` — accept and pass through ACP metadata
- Modify: `packages/cli/src/acp/session.ts` — pass ACP metadata to proxy container via env vars
- New function: `logDroppedServers(db, unmatched, acpClient)` — write dropped server audit entries
- Update tests: audit hook tests verify ACP metadata flows through

**Testable output:** (a) Schema migration adds columns without breaking existing data, (b) ACP tool calls logged with `session_type: "acp"`, (c) direct proxy calls still have `session_type: null` (backward compatible), (d) dropped servers appear in audit log with `status: "dropped"`, (e) `acp_client` captured when available.

**Not Implemented Yet**

---

### CHANGE 11: End-to-End ACP Integration Test

Comprehensive integration test exercising the full ACP proxy lifecycle using the mcp-agent.

**PRD refs:** PRD §8 UC-3 (End-to-End Testing with mcp Agent)

**Summary:** Write an integration test that: starts `chapter acp-proxy` with the mcp-agent in the test workspace, connects a mock ACP client, sends mcpServers config (some matching, some not), verifies warnings for dropped servers, calls a tool through the governed pipeline, verifies audit logging, disconnects and verifies teardown.

**User Story:** As a developer working on the ACP proxy, I run the integration test and get confidence that the entire ACP flow works: editor → ACP proxy → matcher → Docker session → bridge → container agent → proxy → upstream MCP → audit log. If any component breaks, this test catches it.

**Scope:**
- New file: `e2e/tests/acp-proxy.test.ts`
- Uses: `e2e/fixtures/test-chapter/` workspace (with mcp-agent + filesystem app)
- Test scenarios:
  1. `chapter acp-proxy` starts and ACP endpoint accepts connections
  2. ACP client sends mcpServers → matched servers produce governed tools, unmatched produce warnings
  3. Tool call through ACP → bridge → agent → proxy → upstream → result back to ACP client
  4. Audit log contains ACP session entries with `session_type: "acp"`
  5. Dropped servers logged with `status: "dropped"`
  6. ACP client disconnect triggers Docker session teardown
  7. Graceful shutdown on SIGTERM
- Cleanup: remove temp DB, stop containers

**Testable output:** `npx vitest run e2e/tests/acp-proxy.test.ts` passes. All 7 scenarios verified.

**Not Implemented Yet**
