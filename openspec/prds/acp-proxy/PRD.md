# ACP Proxy — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** ClawForge, Inc.

---

## 1. Problem Statement

The Agent Communication Protocol (ACP) is becoming the standard for editor-native agent integration. Editors like Zed, JetBrains, acpx, and Neovim use ACP to spawn and communicate with coding agents, passing them MCP server configurations that the agent should use for tool access.

Chapter's governance model — role-based tool filtering, audit logging, approval workflows, credential isolation — currently only works when an agent connects through the chapter proxy. ACP clients bypass this entirely: they hand MCP server configs directly to the agent, which connects to upstream servers ungoverned.

This creates a fundamental tension:

- **Governance gap:** ACP clients configure MCP servers outside chapter's control. The agent gets raw access to tools with no filtering, auditing, or approval.
- **Credential exposure:** ACP clients embed credentials in mcpServers config. Chapter's credential isolation model (agent-entry → credential-service → proxy relay) is bypassed.
- **No container isolation:** ACP agents typically run on the host. Chapter's Docker isolation model (three-container session with proxy, credential-service, and agent) is unused.
- **Ecosystem friction:** Teams using chapter for governance must choose between editor-native ACP workflows and chapter's security model. They should get both.

The ACP proxy bridges this gap: an ACP-compliant agent endpoint that intercepts the client's MCP server configuration, matches servers against chapter's declared Apps, rewrites matched servers to route through the chapter proxy, and drops unmatched servers with warnings.

---

## 2. Goals

### User Goals
- Use any ACP-compatible editor (Zed, JetBrains, acpx, Neovim) to work with chapter-governed agents.
- MCP servers declared in the editor are automatically matched and routed through chapter governance.
- Unmatched MCP servers produce clear warnings — the user knows exactly what was dropped and why.
- Container isolation and credential management work identically to the existing `chapter run-agent` flow.

### Business Goals
- Position chapter as the governance layer for the ACP ecosystem.
- Support the two dominant agent runtimes (Claude Code, pi-coding-agent) as ACP agents in containers.
- Enable teams to adopt ACP editors without abandoning chapter's security model.

### Measurable Outcomes
- ACP clients can connect to a chapter agent and receive governance-filtered tools within the existing proxy latency budget (< 500ms tool call overhead).
- 100% of matched MCP server traffic is audited in `chapter.db`.
- Unmatched MCP servers produce a warning visible to the ACP client before the agent session begins.

---

## 3. Non-Goals

- **ACP protocol implementation from scratch:** We use existing ACP libraries/SDKs where available. The proxy adapts chapter's existing MCP proxy, not reimplements ACP.
- **Host-mode ACP agents:** v1 targets Docker-isolated agents only. Running ACP agents directly on the host without containers is future work.
- **Bidirectional MCP server injection:** The proxy does not inject additional MCP servers that the ACP client didn't request. It only filters and rewrites the client's declared servers.
- **ACP client modifications:** The proxy works with unmodified ACP clients. No editor plugins or extensions required.
- **Multi-agent ACP sessions:** Each ACP connection maps to one chapter agent with one role. Multi-agent orchestration over ACP is out of scope.

---

## 4. User Stories

**US-1:** As a developer using Zed, I want to connect to a chapter-governed agent via ACP, so that I get editor-native agent integration with chapter's security model.

**US-2:** As an agent operator, I want `chapter acp-proxy` to start an ACP-compliant endpoint that editors can connect to, so that ACP clients work without manual proxy setup.

**US-3:** As a developer, I want the ACP proxy to match my editor's mcpServers config against chapter Apps, so that matched servers are automatically governed and audited.

**US-4:** As a developer, I want clear warnings when my editor configures MCP servers that don't match any chapter App, so that I understand why those tools aren't available.

**US-5:** As an agent operator, I want the ACP proxy to run the agent runtime (Claude Code, pi-coding-agent) inside a Docker container as an ACP agent, so that container isolation is preserved.

**US-6:** As an agent operator, I want credentials to flow through chapter's credential-service even in ACP mode, so that secrets never leak to the agent container.

**US-7:** As an agent operator, I want to test ACP integration using the mcp-test agent, so that I can validate the pipeline end-to-end without production runtimes.

---

## 5. Core Concepts

### 5.1 ACP Client ↔ Agent Model

In the ACP protocol, the **client** (editor) sends a session initialization that includes:
- The agent to invoke
- `mcpServers`: a map of MCP server configurations the agent should use
- Environment variables, workspace context, and other session metadata

The **agent** (chapter's container) receives this configuration and is expected to connect to the listed MCP servers for tool access.

### 5.2 MCP Server Matching

The ACP proxy intercepts the client's `mcpServers` map and matches each entry against chapter's declared Apps by comparing:

1. **Server name** against app short names (e.g., `github` matches `@clawmasons/app-github`)
2. **Command/args** against app `command`/`args` fields (for stdio apps)
3. **URL** against app `url` fields (for remote apps)

A match means the ACP client wants the agent to use a server that chapter already governs. The proxy rewrites that entry to point at the chapter proxy endpoint instead.

### 5.3 MCP Server Rewriting

For each matched server, the proxy replaces the client's MCP server config with a single chapter proxy entry:

**Before (from ACP client):**
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_..." }
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-slack"],
      "env": { "SLACK_TOKEN": "xoxb-..." }
    },
    "personal-notes": {
      "command": "node",
      "args": ["~/my-mcp-server/index.js"]
    }
  }
}
```

**After (rewritten for container agent):**
```json
{
  "mcpServers": {
    "chapter": {
      "url": "http://proxy:3000/mcp",
      "headers": { "Authorization": "Bearer <session-token>" }
    }
  }
}
```

- `github` and `slack` matched chapter Apps → routed through proxy (tools appear as `github_*`, `slack_*`)
- `personal-notes` did not match → dropped with warning

### 5.4 Unmatched Server Handling

Unmatched MCP servers are **warned and dropped**. The agent only gets chapter-governed tools. The warning is:
1. Logged to stderr of the `chapter acp-proxy` process
2. Returned to the ACP client in the session initialization response (if the ACP protocol supports diagnostic messages)
3. Written to the audit log in `chapter.db` with status `dropped`

---

## 6. Requirements

### P0 — Must-Have

**REQ-001: `chapter acp-proxy` CLI Command**

A new CLI command `chapter acp-proxy` starts an ACP-compliant endpoint. It coexists with the existing `chapter proxy` command. The command resolves the agent, starts the Docker session (proxy + credential-service + agent containers), and bridges ACP traffic to the containerized agent.

CLI options:
- `--agent <name>` — agent package name (auto-detects if only one)
- `--role <name>` — role to use for the session
- `--port <number>` — ACP endpoint port (default 3001)
- `--proxy-port <number>` — internal chapter proxy port (default 3000)

Acceptance criteria:
- Given a chapter workspace with a valid agent, when `chapter acp-proxy --agent myagent --role myrole` is run, then an ACP endpoint starts on port 3001.
- Given the ACP endpoint is running, when an ACP client connects, then the session is bridged to the Docker-isolated agent.

**REQ-002: MCP Server Matching**

The ACP proxy matches each entry in the client's `mcpServers` against the agent's resolved Apps. Matching uses app short name (from `getAppShortName()`) as the primary key, with command/URL as secondary confirmation.

Matching rules:
1. **Name match:** `mcpServers` key matches an app's short name (case-insensitive)
2. **Command match (stdio):** `mcpServers[name].command` + `args` matches app's `command` + `args`
3. **URL match (remote):** `mcpServers[name].url` matches app's `url`

A name match alone is sufficient. Command/URL matching is used as a secondary signal for disambiguation when multiple apps could match.

Acceptance criteria:
- Given app `@clawmasons/app-github` (short name `github`) and mcpServers contains key `github`, then the server is matched.
- Given mcpServers contains key `my-custom-github` that doesn't match any app short name, then it is unmatched.
- Given two apps with similar names, when the mcpServers key matches one by name and the other by command, then the name match takes precedence.

**REQ-003: MCP Server Rewriting**

Matched MCP servers are removed from the client's mcpServers config and replaced with a single `chapter` entry pointing to the chapter proxy's streamable-http endpoint inside the Docker network.

The rewritten config is materialized into the agent container's workspace during Docker session startup, following the same pattern as the existing Claude Code and pi-coding-agent materializers (`.mcp.json` or `.pi/mcp.json`).

Acceptance criteria:
- Given 3 mcpServers where 2 match chapter Apps, when the agent container starts, then its MCP config contains only the single `chapter` proxy entry.
- Given the agent calls `tools/list` through the chapter proxy, then it receives the prefixed, role-filtered tools from the 2 matched apps.

**REQ-004: Unmatched MCP Server Warning**

Unmatched MCP servers produce warnings. The agent does not get access to unmatched servers — it only receives chapter-governed tools.

Warning output:
```
[chapter acp-proxy] WARNING: Dropping unmatched MCP server "personal-notes"
  → No chapter App matches server name, command, or URL
  → Agent will not have access to tools from this server
  → To govern this server, create a chapter App package for it
```

Acceptance criteria:
- Given mcpServers contains `personal-notes` which matches no chapter App, then a warning is logged to stderr.
- Given mcpServers contains `personal-notes`, then the agent container has no access to `personal-notes` tools.
- Given all mcpServers match chapter Apps, then no warnings are emitted.

**REQ-005: Docker Session Lifecycle**

The ACP proxy manages the same three-container Docker session as `chapter run-agent`:

1. **proxy container** — runs `chapter proxy --agent <name>` with upstream MCP clients for matched apps
2. **credential-service container** — resolves credentials from host env/keychain/.env
3. **agent container** — runs the agent runtime as an ACP agent (see REQ-006)

The ACP proxy starts and tears down this session in response to ACP client connect/disconnect events.

Acceptance criteria:
- Given an ACP client connects, then the Docker session starts (proxy → credential-service → agent).
- Given the ACP client disconnects, then all containers are torn down.
- Given the agent container exits, then the ACP proxy reports the exit to the client and tears down remaining containers.

**REQ-006: Container ACP Agents**

Materializers generate agent containers that run their runtimes as ACP agents. Each runtime has an ACP-compatible invocation:

| Runtime | ACP Agent Command | Container Image Base |
|---------|------------------|---------------------|
| Claude Code | `claude-agent-acp` | `node:22-slim` + `@anthropic-ai/claude-code` |
| pi-coding-agent | `pi-agent-acp` | `node:22-slim` + `@mariozechner/pi-coding-agent` |
| mcp-test | `node src/index.js --acp` | `node:22-slim` |

The ACP agent inside the container:
1. Bootstraps via `agent-entry` (same as today: connect-agent → request credentials → launch runtime)
2. Runs the runtime in ACP agent mode (listens for ACP connections from the proxy)
3. The ACP proxy on the host bridges external ACP client traffic to the container's ACP agent

Acceptance criteria:
- Given a Claude Code agent, when the ACP session starts, then the agent container runs `claude-agent-acp` with the materialized workspace.
- Given a pi-coding-agent agent, when the ACP session starts, then the agent container runs `pi-agent-acp` with the materialized workspace.
- Given the mcp-test agent, when the ACP session starts, then the container runs with `--acp` flag.

**REQ-007: Credential Flow Preservation**

The ACP proxy strips credentials from the client's mcpServers config (the `env` fields containing tokens).  And passes them to CredentService as session credentials.

Credentials are resolved exclusively through chapter's credential-service pipeline:

1. Client sends mcpServers with embedded credentials (e.g., `GITHUB_TOKEN` in env)
2. ACP proxy extracts credential keys and passes them to Credential-service as session credentials which will be used if any tool requests that credential
3. Credential-service resolves values from host env/keychain/.env if there are not session credential override
4. Agent receives credentials via `credential_request` tool through the proxy relay

This ensures secrets never appear in the agent container's environment or filesystem.

Acceptance criteria:
- Given mcpServers contains `"env": {"GITHUB_TOKEN": "ghp_abc123"}`, then `ghp_abc123` is never written to any container filesystem or environment variable.
- Given the agent needs `GITHUB_TOKEN`, then it obtains it via the `credential_request` MCP tool through the proxy.
- If the client passes in a `GITHUB_TOKEN` it will override any environment variables for the session.

**REQ-008: Audit Logging for ACP Sessions**

All tool calls in ACP sessions are audited identically to direct proxy sessions. Additionally, the audit log captures:
- `session_type: "acp"` to distinguish from direct proxy sessions
- `acp_client: "<editor-name>"` when available from the ACP handshake
- Dropped MCP server events logged with status `dropped`

Acceptance criteria:
- Given an ACP session, when a tool call is made, then it appears in `audit_log` with the same schema as direct proxy calls.
- Given unmatched MCP servers are dropped, then each dropped server is logged to `audit_log` with status `dropped`.

### P1 — Nice-to-Have

**REQ-009: MCP Server Matching by Tool Inventory**

When name-based matching is ambiguous, the ACP proxy can start a temporary MCP client to the candidate server, call `tools/list`, and match the returned tool names against chapter App tool declarations.

Acceptance criteria:
- Given mcpServers contains `custom-github` with tools matching `@clawmasons/app-github`'s declared tools, then the server is matched despite the name mismatch.

The agent should always have the role's  mcp servers.  this matching is mostly useful for debugging and figuring how to get the chapter's mcp servers to match standard mcp server names so
skill's etc will work

Also useful for getting any credentials provided by the ACP client to get loaded by the MCP proxy for the session

**REQ-010: ACP Session Persistence**

The ACP proxy supports session reconnection. If the ACP client disconnects and reconnects within a configurable TTL (default 5 minutes), the existing Docker session is reused instead of torn down and recreated.

Acceptance criteria:
- Given an ACP client disconnects, when it reconnects within 5 minutes, then the same containers and session state are reused.
- Given an ACP client disconnects, when 5 minutes elapse without reconnection, then the Docker session is torn down.

**REQ-011: Multiple Simultaneous ACP Sessions**

The ACP proxy supports multiple concurrent sessions for different agent/role combinations, each with its own Docker session.

Acceptance criteria:
- Given two ACP clients connect requesting different agents, then two independent Docker sessions run concurrently.



---

## 7. Architecture

### 7.1 High-Level Architecture

```
 ACP Client                  chapter acp-proxy (host)              Docker Session
 (Zed, JetBrains,      ┌────────────────────────────┐     ┌──────────────────────────┐
  acpx, neovim)         │                            │     │                          │
       │                │  1. Receive mcpServers      │     │  proxy container         │
       │   ACP          │  2. Match against Apps      │     │  ┌────────────────────┐  │
       ├───────────────►│  3. Use credentials for session │     │  │  chapter proxy      │  │
       │                │  4. Start Docker session     │     │  │  (MCP governance)   │  │
       │                │  5. Bridge ACP ↔ container   │     │  └────────┬───────────┘  │
       │                │                            │     │           │              │
       │                │  ┌──────────────────────┐  │     │  credential-service      │
       │                │  │  ACP ↔ Agent Bridge   │──┼─────┼──────────────────────┐  │
       │                │  │  (bidirectional)      │  │     │                      │  │
       │                │  └──────────────────────┘  │     │  agent container      │  │
       │                │                            │     │  ┌────────────────────┤  │
       │◄───────────────┤  6. Relay agent responses  │     │  │  agent-entry        │  │
       │   ACP          │                            │     │  │  → claude-agent-acp │  │
       │                └────────────────────────────┘     │  │  (ACP agent mode)   │  │
       │                                                   │  └─────────────────────┘  │
       │                                                   └──────────────────────────┘
```

### 7.2 MCP Server Matching Flow

```
ACP client sends mcpServers:
  { "github": {...}, "slack": {...}, "personal-notes": {...} }
           │
           ▼
┌──────────────────────────────────┐
│  Load resolved agent Apps:       │
│  - @clawmasons/app-github       │
│    (short name: "github")        │
│  - @clawmasons/app-slack        │
│    (short name: "slack")         │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  For each mcpServers entry:      │
│                                  │
│  "github"         → MATCH        │
│    (name == app short name)      │
│                                  │
│  "slack"          → MATCH        │
│    (name == app short name)      │
│                                  │
│  "personal-notes" → NO MATCH    │
│    → WARN & DROP                 │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Result:                         │
│  matched:   [github, slack]      │
│  dropped:   [personal-notes]     │
│  warnings:  1 unmatched server   │
└──────────────────────────────────┘
```

### 7.3 Startup Sequence

```
chapter acp-proxy --agent myagent --role myrole
  │
  ├─1─ Discover packages in workspace
  ├─2─ Resolve agent dependency graph → ResolvedAgent
  ├─3─ Compute tool filters (union of role permissions)
  ├─4─ Start ACP endpoint on configured port (default 3001)
  ├─5─ Log "chapter acp-proxy ready — waiting for ACP client"
  │
  │  ◄── ACP client connects with mcpServers config ──►
  │
  ├─6─ Match mcpServers against resolved Apps
  │      ├── For each entry: getAppShortName() comparison
  │      ├── Matched servers: record for proxy routing
  │      └── Unmatched servers: warn and drop
  │      └── provide any credentials to Credential-service as session overrids
  ├─7─ Generate Docker session tokens (proxyToken, credentialProxyToken)
  ├─8─ Generate docker-compose.yml
  │      ├── proxy container: chapter proxy with matched apps only
  │      ├── credential-service container
  │      └── agent container: runtime in ACP agent mode
  ├─9─ Materialize agent workspace
  │      ├── .mcp.json / .pi/mcp.json → single chapter proxy entry
  │      ├── AGENTS.md, slash commands, skills (existing materializer output)
  │      └── ACP agent config (runtime-specific)
  ├─10─ Start Docker session (proxy → credential-service → agent)
  ├─11─ Establish ACP bridge: host ACP endpoint ↔ container ACP agent
  └─12─ Log matched/dropped summary, bridge active
```

### 7.4 ACP Session Tool Call Flow

```
ACP Client (Zed) → chapter acp-proxy (host) → agent container (ACP agent)
      │                    │                          │
      │  "use github       │                          │
      │   to create PR"    │                          │
      │───────────────────►│                          │
      │                    │  bridge ACP message       │
      │                    │─────────────────────────►│
      │                    │                          │
      │                    │         agent calls tools/call("github_create_pr")
      │                    │                          │──── MCP ────►┐
      │                    │                          │              │
      │                    │                    chapter proxy        │
      │                    │                    ┌─────┴──────┐       │
      │                    │                    │ audit pre   │       │
      │                    │                    │ approval?   │       │
      │                    │                    │ route to    │       │
      │                    │                    │ upstream    │       │
      │                    │                    │ github app  │       │
      │                    │                    │ audit post  │       │
      │                    │                    └─────┬──────┘       │
      │                    │                          │◄─── MCP ────┘
      │                    │  bridge ACP response      │
      │                    │◄─────────────────────────│
      │◄───────────────────│                          │
      │  agent response    │                          │
```

### 7.5 Integration with Existing Codebase

The ACP proxy reuses chapter's existing infrastructure and adds a thin ACP bridging layer:

| Existing Module | Reuse in ACP Proxy |
|----------------|-------------------|
| `resolver/discover.ts` | Package discovery from workspace |
| `resolver/resolve.ts` | Dependency graph resolution → `ResolvedAgent` |
| `generator/toolfilter.ts` | `computeToolFilters()` for role-permission unions |
| `generator/toolfilter.ts` | `getAppShortName()` for MCP server matching |
| `proxy/server.ts` | `ChapterProxyServer` runs inside proxy container (unchanged) |
| `proxy/upstream.ts` | `UpstreamManager` connects to matched app servers |
| `proxy/router.ts` | `ToolRouter`, `ResourceRouter`, `PromptRouter` |
| `proxy/hooks/audit.ts` | Audit logging for all tool calls |
| `proxy/hooks/approval.ts` | Approval workflow for constrained tools |
| `proxy/handlers/credential-relay.ts` | Credential request relay to credential-service |
| `proxy/handlers/connect-agent.ts` | Session management with risk-based locking |
| `materializer/claude-code-agent.ts` | Workspace materialization (`.mcp.json`, `AGENTS.md`, etc.) |
| `materializer/pi-coding-agent.ts` | PI workspace materialization |
| `generator/proxy-dockerfile.ts` | Proxy container Dockerfile |
| `generator/agent-dockerfile.ts` | Agent container Dockerfile (extended for ACP mode) |
| `generator/credential-service-dockerfile.ts` | Credential service Dockerfile |
| `cli/commands/run-agent.ts` | Docker Compose session orchestration (adapted) |
| `agent-entry/src/index.ts` | Container bootstrap (connect → credentials → launch) |
| `credential-service/` | Host-side credential resolution |
| `schemas/app.ts` | `appChapterFieldSchema` for App type validation |
| `schemas/agent.ts` | `agentChapterFieldSchema` for agent resolution |
| `schemas/role.ts` | `roleChapterFieldSchema` for role permissions |

New modules to create:

| Module | Purpose |
|--------|---------|
| `cli/commands/acp-proxy.ts` | `chapter acp-proxy` CLI command |
| `acp/bridge.ts` | ACP ↔ container agent bidirectional bridge |
| `acp/matcher.ts` | MCP server matching logic (client mcpServers → chapter Apps) |
| `acp/rewriter.ts` | MCP server config rewriting (replace matched entries with proxy) |
| `acp/warnings.ts` | Unmatched server warning generation and logging |
| `generator/agent-dockerfile.ts` | Extended to support ACP agent mode entrypoints |
| `materializer/claude-code-agent.ts` | Extended to produce ACP agent config |
| `materializer/pi-coding-agent.ts` | Extended to produce ACP agent config |

### 7.6 Agent Schema Extension

The agent schema gains an optional `acp` field for ACP-specific configuration:

```typescript
// Added to agentChapterFieldSchema
acp: z.object({
  port: z.number().int().positive().optional().default(3002),  // ACP listen port inside container
}).optional()
```

The `runtimes` array continues to declare which runtimes the agent supports. The ACP proxy infers the ACP agent command from the runtime name:

```typescript
const ACP_RUNTIME_COMMANDS: Record<string, string> = {
  "claude-code-agent": "claude-agent-acp",
  "pi-coding-agent": "pi-agent-acp",
  "node": "node src/index.js --acp",
};
```

### 7.7 Materializer Changes

Both the Claude Code and pi-coding-agent materializers are extended to support ACP agent mode:

**Claude Code materializer** (`materializer/claude-code-agent.ts`):
- Existing: generates `.mcp.json` pointing to `{proxyEndpoint}/mcp`
- ACP mode: additionally generates ACP agent config so `claude-agent-acp` knows to listen for incoming ACP connections

**Pi Coding Agent materializer** (`materializer/pi-coding-agent.ts`):
- Existing: generates `.pi/mcp.json` pointing to proxy
- ACP mode: additionally generates ACP agent config for `pi-agent-acp`


**MCP ACP Agent materializer** (`materializer/mcp-agent.ts`):
- materializes using new mcp-agent package that will respond to ACP requests, and allow for manually calling mcp tools with very exact prompts that must match the tool call
- if users types a command that does not match any tool, then they should see a help message with all the available cools
- add agent implementation to packages/mcp-agent/
- should be packaged up and used as binary in the docker image

Change the existing mcp-test agent and tests to use this agent.  This agent will be useful for more than just testing, so let's formally package it up


The materialized workspace is identical in both modes — the only difference is the container entrypoint command (direct runtime vs. ACP agent wrapper).

---

## 8. Use Cases

### UC-1: Zed + Claude Code + Chapter Governance

A developer opens Zed with ACP configured to use a chapter agent. Their Zed ACP config includes `github` and `linear` MCP servers.

1. Zed connects to `chapter acp-proxy` on port 3001
2. ACP proxy matches `github` → `@clawmasons/app-github`, `linear` → `@clawmasons/app-linear`
3. Docker session starts: proxy (with github + linear upstreams), credential-service, agent (claude-agent-acp)
4. Agent bootstraps: connects to proxy, requests credentials, launches Claude Code in ACP agent mode
5. Developer asks agent to create a PR — agent calls `github_create_pr` through the governed proxy
6. Tool call is audited, approval checked (if configured), then forwarded to upstream github server

### UC-2: Editor with Unmatched MCP Servers

A developer's ACP config includes `github`, `slack`, and `my-local-notes` servers. The chapter workspace only has `app-github` and `app-slack`.

1. ACP proxy matches `github` and `slack`, drops `my-local-notes`
2. Warning printed: `Dropping unmatched MCP server "my-local-notes"`
3. Agent container gets tools from github and slack only — no access to `my-local-notes`
4. Developer sees the warning and can choose to create a chapter App for their local notes server

### UC-3: End-to-End Testing with mcp Agent

An operator wants to validate the ACP pipeline works before deploying production agents.

1. `chapter acp-proxy --agent mcp --role role-mcp-test`
2. ACP endpoint starts, test ACP client connects
3. mcp agent bootstraps in container with `--acp` flag
4. Test client sends tool calls through ACP → proxy → upstream
5. All calls audited, credential pipeline validated with `TEST_TOKEN`

---

## 9. Open Questions

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| Q1 | What is the exact ACP wire protocol for session initialization? Do we need to implement the full ACP spec or can we use a subset? | Engineering | Yes |
| Q2 | Do `claude-agent-acp` and `pi-agent-acp` exist as published packages, or do we need to build ACP agent wrappers around the existing CLI tools? | Engineering | Yes |
| Q3 | Should the ACP proxy support hot-reloading the agent's App set if the chapter workspace changes while a session is active? | Product | No |
| Q4 | How should the ACP proxy handle ACP clients that send updated mcpServers mid-session (e.g., user installs a new extension)? | Engineering | No |
| Q5 | Should unmatched MCP server warnings be surfaced as ACP diagnostic events, or is stderr logging sufficient for v1? | Product | logging and ACP diagnostic events |

---

## 10. Timeline Considerations

### Phase 1: Core ACP Proxy (P0)
- `chapter acp-proxy` CLI command
- MCP server matching engine (`getAppShortName()` comparison)
- MCP server rewriting (matched → proxy, unmatched → warn & drop)
- Docker session lifecycle (start on connect, teardown on disconnect)
- Claude Code materializer ACP agent mode
- pi-coding-agent materializer ACP agent mode
- mcpp agent ACP mode (`--acp` flag)
- Audit logging for ACP sessions

### Phase 2: Enhanced Matching & Sessions (P1)
- Tool-inventory-based matching for ambiguous servers
- Session persistence across reconnects
- Multiple concurrent ACP sessions

