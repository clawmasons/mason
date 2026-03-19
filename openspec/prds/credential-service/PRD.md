# Credential Service — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** Clawmasons, Inc.
**Depends on:** chapter-monorepo PRD (monorepo structure, Docker workflow, agent/role/app schemas)

---

## 1. Executive Summary

Today, agents receive credentials (API keys, tokens, secrets) via environment variables injected into Docker containers through `docker-compose.yml`. This approach is insecure — credentials are visible in container inspection (`docker inspect`), compose files on disk, process listings (`/proc/*/environ`), and shell history. It is also inflexible: every credential must be known at container launch time, and there is no access control over which agents can access which credentials.

This PRD defines four changes:

- **Credential service** (`@clawmasons/credential-service`): A new package that securely resolves, validates, and distributes credentials to agents on demand via the MCP proxy, with full audit logging.
- **Agent entry** (`@clawmasons/agent-entry`): A standalone binary that bootstraps agent containers — connecting to the proxy, requesting credentials, and launching the agent process with credentials injected into its environment.
- **Artifact schema changes:** New `credentials` field on agent and app packages, new `risk` field on role packages, enabling declarative credential requirements and risk-based access control.
- **CLI changes:** Updates to `docker-init` and `run-agent` to orchestrate the credential service lifecycle.

---

## 2. Design Principles

- **No credentials in environment variables or compose files.** Credentials must never appear in `docker-compose.yml`, Dockerfiles, or container environment variable lists. They are delivered at runtime through authenticated channels only.
- **Least-privilege credential access.** Agents receive only the credentials declared in their artifact schemas. The credential service validates every request against the agent's role and declared needs.
- **Audit all credential operations.** Every credential request, grant, and denial is logged with agent identity, credential key, timestamp, and outcome.
- **Defense in depth.** Cryptographic request signing (phase 2) provides an additional layer beyond token-based auth. Phase 1 uses token auth only, with signing infrastructure pre-positioned for enablement.
- **Declarative credentials.** Credential requirements are declared in `chapter.json` alongside other package metadata — visible at `docker-init` time, before any container runs.

---

## 3. New Packages

### 3.1 `packages/credential-service` — `@clawmasons/credential-service`

The credential service resolves credentials from the host environment and distributes them to authorized agents through the MCP proxy.

#### 3.1.1 Modes of Operation

| Mode | Description | Use Case |
|------|-------------|----------|
| CLI | Standalone process, connects to proxy via WebSocket | Production Docker deployments |
| SDK | In-process, imported by proxy or test harness | Testing, local development |

#### 3.1.2 Credential Resolution

The credential service resolves credential values from multiple sources, checked in priority order:

| Priority | Source | Description |
|----------|--------|-------------|
| 1 | Process environment variables | `process.env[KEY]` on the host running the service |
| 2 | macOS Keychain | Via `security find-generic-password` (macOS only) |
| 3 | `.env` file | Project-root `.env` file (existing `loadEnvFile` from proxy) |

If a credential cannot be resolved from any source, the request fails with a clear error identifying the missing key and sources attempted.

#### 3.1.3 WebSocket Protocol

The credential service connects to the MCP proxy via WebSocket (not MCP protocol). The proxy acts as the relay — agents request credentials through the proxy's credential tool, and the proxy forwards those requests to the credential service over the WebSocket connection.

```
Agent Container                  Proxy Container              Credential Service
     │                                │                              │
     ├─ MCP tool call ───────────────>│                              │
     │  credential_request            │                              │
     │  {key, session_token}          ├─ WS message ───────────────>│
     │                                │  {key, agent_id, role,       │
     │                                │   session_id}                │
     │                                │                              ├─ validate access
     │                                │                              ├─ resolve credential
     │                                │                              ├─ audit log
     │                                │<─ WS response ──────────────┤
     │                                │  {key, value} or {error}     │
     │<─ MCP tool result ────────────┤                              │
     │  {key, value}                  │                              │
```

#### 3.1.4 Access Validation

Before resolving a credential, the service validates:

1. The requesting agent's role is authorized for the credential (role risk level permits it).
2. The credential key is declared in the agent's or app's `credentials` field.
3. The session is active and the session token is valid.

#### 3.1.5 Audit Logging

All credential operations are logged to the existing `chapter.db` SQLite database (new `credential_audit` table):

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Auto-increment primary key |
| `timestamp` | TEXT | ISO 8601 timestamp |
| `agent_id` | TEXT | Agent slug |
| `role` | TEXT | Role slug |
| `session_id` | TEXT | Session identifier |
| `credential_key` | TEXT | Requested credential key |
| `outcome` | TEXT | `granted` / `denied` / `error` |
| `deny_reason` | TEXT | Reason for denial (null if granted) |
| `source` | TEXT | Resolution source (`env` / `keychain` / `dotenv`) |

### 3.2 `packages/agent-entry` — `@clawmasons/agent-entry`

Agent entry is a standalone binary that serves as the entrypoint for all agent Docker containers. It replaces the current pattern where agent containers launch the runtime directly.

#### 3.2.1 Build

- Bundled with esbuild into a single executable
- No runtime npm dependencies required inside the container
- Target: `node22` (matches current Docker base image)

#### 3.2.2 Bootstrap Flow

```
agent-entry starts
  │
  ├─1─ Read MCP_PROXY_TOKEN from environment (the only env var credential)
  ├─2─ Connect to proxy at connect-agent endpoint
  │      ├── Send: MCP_PROXY_TOKEN
  │      └── Receive: AGENT_SESSION_TOKEN + session_id
  ├─3─ Request credentials via proxy credential tool
  │      ├── For each key in agent's credentials list:
  │      │     └── MCP tool call: credential_request {key, session_token}
  │      └── Collect resolved {key: value} pairs
  ├─4─ Launch agent runtime process
  │      ├── Set credentials as env vars on the child process only
  │      ├── Redirect child stdin/stdout to container stdin/stdout
  │      └── Redirect child stderr to container stderr
  └─5─ Wait for child process exit → propagate exit code
```

#### 3.2.3 Credential Injection

Credentials are set as environment variables on the child process only — they never appear in the container's own environment. This means:

- `docker inspect` does not show credentials
- `/proc/1/environ` does not contain credentials
- Only the agent runtime process (and its children) can access them

#### 3.2.4 Error Handling

| Condition | Behavior |
|-----------|----------|
| Proxy unreachable | Retry 3 times with 1s backoff, then exit 1 with error message |
| Invalid MCP_PROXY_TOKEN | Exit 1 with "authentication failed" message |
| Credential request denied | Exit 1 listing denied credentials and reasons |
| Credential not found | Exit 1 listing missing credentials and sources attempted |
| Agent runtime crashes | Propagate the child process exit code |

---

## 4. Artifact Schema Changes

### 4.1 Agent: `credentials` Field

Agents declare the credentials they require. This is a top-level list — the union of all credentials the agent needs across all its apps and direct usage.

```json
{
  "name": "@lodge.chapter/agent-researcher",
  "version": "1.0.0",
  "chapter": {
    "type": "agent",
    "name": "Researcher",
    "slug": "researcher",
    "runtimes": ["claude-code-agent"],
    "roles": ["@lodge.chapter/role-web-research"],
    "credentials": ["SERP_API_KEY", "OPENAI_API_KEY"],
    "llm": {
      "provider": "openai",
      "model": "gpt-4o"
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `credentials` | string[] | No | Credential keys this agent requires. Defaults to `[]`. |

### 4.2 App: `credentials` Field

Apps declare credentials they need to function. When an agent uses an app, the app's credentials are included in the agent's credential requests.

```json
{
  "name": "@lodge.chapter/app-web-search",
  "version": "1.0.0",
  "chapter": {
    "type": "app",
    "transport": "stdio",
    "command": "node",
    "args": ["dist/index.js"],
    "tools": ["search_web", "fetch_page"],
    "capabilities": ["web-search"],
    "credentials": ["SERP_API_KEY"]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `credentials` | string[] | No | Credential keys this app requires. Defaults to `[]`. |

### 4.3 Role: `risk` Field

Roles declare a risk level that controls credential access and proxy connection behavior.

```json
{
  "name": "@lodge.chapter/role-web-research",
  "version": "1.0.0",
  "chapter": {
    "type": "role",
    "risk": "MEDIUM",
    "permissions": {
      "web-search": { "allow": ["search_web", "fetch_page"] }
    }
  }
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `risk` | `"HIGH"` \| `"MEDIUM"` \| `"LOW"` | No | `"LOW"` | Risk classification for the role. |

#### 4.3.1 Risk Level Behavior

| Risk | Credential Access | Additional Agent Connections | Use Case |
|------|-------------------|------------------------------|----------|
| `LOW` | Allowed | Allowed | Read-only tools, no sensitive data |
| `MEDIUM` | Allowed | Disallowed | Write access, API keys with limited scope |
| `HIGH` | Allowed | Disallowed | Broad API access, financial operations, PII handling |

When a role is `HIGH` or `MEDIUM` risk, the proxy rejects additional agent connections to the same proxy instance after the first agent connects. This prevents a compromised agent from spawning sub-agents that inherit elevated access.

---

## 5. Architecture & Use Cases

### UC-1: Agent Credential Retrieval

The primary flow — an agent container starts and retrieves its credentials.

```
Host                          Docker Network
┌─────────────┐    ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐
│  run-agent   │───>│  credential  │    │   proxy          │    │  agent        │
│  (CLI)       │    │  service     │    │   container      │    │  container    │
└──────┬───────┘    └──────┬───────┘    └──────┬───────────┘    └──────┬────────┘
       │                   │                   │                       │
       ├─ start proxy ────────────────────────>│                       │
       ├─ start cred svc ─>│                   │                       │
       │                   ├─ WS connect ─────>│                       │
       ├─ start agent ────────────────────────────────────────────────>│
       │                   │                   │                       │
       │                   │                   │     agent-entry boots  │
       │                   │                   │<── connect-agent ─────┤
       │                   │                   │── session token ─────>│
       │                   │                   │                       │
       │                   │                   │<── credential_request ┤
       │                   │<── WS forward ────┤    {key, token}       │
       │                   ├── validate ───────│                       │
       │                   ├── resolve ────────│                       │
       │                   ├── audit log ──────│                       │
       │                   ├── WS response ───>│                       │
       │                   │                   │── tool result ───────>│
       │                   │                   │                       │
       │                   │                   │     credentials set   │
       │                   │                   │     launch runtime    │
       │                   │                   │<── stdio ────────────>│
```

### UC-2: Risk-Based Access Control

When a HIGH or MEDIUM risk role is active, the proxy enforces connection limits.

```
Proxy receives connect-agent request:
  │
  ├─ Look up role for this session
  ├─ Check role.risk
  │
  ├─ risk == LOW:
  │    └─ Allow connection (no limit on concurrent agents)
  │
  └─ risk == HIGH or MEDIUM:
       ├─ Check: is this the first agent connection for this session?
       │    ├─ Yes: Allow connection, mark session as locked
       │    └─ No:  Reject with 403 "session locked for high/medium risk role"
       └─ Log the decision to audit table
```

### UC-3: Cryptographic Signing (Phase 2 — Disabled by Default)

In phase 2, each agent container generates a key pair at build time. The public key is distributed to the credential service. Credential requests are signed with the private key, providing non-repudiation and preventing token theft attacks.

```
Phase 2 (future):
  docker-init generates key pair per agent container
    ├── Private key → baked into agent image
    └── Public key → distributed to credential service config

  credential_request includes:
    {key, session_token, signature, timestamp}

  credential service validates:
    1. session_token is valid
    2. signature matches public key for agent_id
    3. timestamp is within 30s window (replay protection)
```

Phase 1 implementation pre-positions the infrastructure:
- `docker-init` generates key pairs but does not enforce signing
- Credential service accepts but does not require signatures
- A configuration flag (`requireSigning: false`) controls enforcement

### UC-4: Credential Declaration in Artifacts

Credentials are declared statically in package metadata, enabling validation before any container runs.

```
chapter validate
  │
  ├─ For each agent:
  │    ├─ Collect agent.credentials
  │    ├─ For each role the agent uses:
  │    │    └─ For each app in the role:
  │    │         └─ Collect app.credentials
  │    ├─ Union all collected credentials → required set
  │    └─ Verify: agent.credentials ⊇ app credentials
  │         (agent must declare at least what its apps need)
  └─ Report any undeclared app credentials as warnings
```

### UC-5: Credential Visibility at Runtime

Before launching containers, `run-agent` displays the credentials that will be requested, giving the operator visibility into what the session needs.

```
$ chapter run-agent researcher web-research

  Chapter: acme.research
  Agent:   researcher
  Role:    web-research (MEDIUM risk)

  Required credentials:
    SERP_API_KEY      (declared by: agent, app-web-search)
    OPENAI_API_KEY    (declared by: agent)

  Starting proxy...        ✓
  Starting credential service... ✓
  Starting agent...

  [agent stdio begins]
```

### UC-6: `mcp-test` Agent

A test agent for integration and end-to-end testing of the credential and MCP tool pipeline.

```
mcp-test starts via agent-entry
  │
  ├─ Requests TEST_TOKEN credential
  ├─ Enters interactive loop:
  │    ├─ "list" → prints available MCP tools
  │    ├─ "<tool_name> <json_args>" → calls tool verbatim, prints result
  │    └─ "exit" → exits
  └─ Used in:
       ├─ Integration tests (credential flow verification)
       └─ E2E tests (full Docker pipeline)
```

---

## 6. `docker-init` Changes

### 6.1 Credential Service Dockerfile

`docker-init` generates an additional Dockerfile for the credential service container.

#### Generated Structure (Updated)

```
docker/
├── package.json
├── node_modules/
├── credential-service/
│   └── Dockerfile               # NEW — credential service image
├── proxy/
│   ├── writer/
│   │   └── Dockerfile
│   └── reviewer/
│       └── Dockerfile
└── agent/
    └── researcher/
        └── web-research/
            └── Dockerfile
```

#### Credential Service Dockerfile Behavior

- Installs `@clawmasons/credential-service` package
- Runs as `mason` user
- Connects to proxy via WebSocket on startup
- Expects `CREDENTIAL_PROXY_TOKEN` environment variable for WebSocket auth
- Mounts host `.env` file read-only (if credential source includes dotenv)

### 6.2 Key Pair Generation (Phase 2 Pre-positioning)

For each agent container Dockerfile, `docker-init` generates an RSA key pair:

- Private key: embedded in the agent image at `/home/mason/.chapter/keys/private.pem`
- Public key: collected into `docker/keys/<agent>/<role>/public.pem`

The credential service Dockerfile copies all public keys into its image.

In phase 1, these keys exist but are not used for validation (signing is disabled).

---

## 7. `run-agent` Changes

### 7.1 Updated Launch Sequence

```
chapter run-agent <agent> <role> [<task>]
  │
  ├─1─ Read .mason/chapter.json
  ├─2─ Generate session ID
  ├─3─ Resolve required credentials (from agent + apps)
  ├─4─ Display required credentials to operator (UC-5)
  ├─5─ Generate CHAPTER_PROXY_TOKEN (existing — proxy ↔ agent auth)
  ├─6─ Generate CREDENTIAL_PROXY_TOKEN (new — proxy ↔ credential-service auth)
  ├─7─ Generate docker-compose.yml (updated — see 7.2)
  ├─8─ Start proxy container (detached)
  ├─9─ Start credential service container (detached)      # NEW
  ├─10─ Start agent container (interactive, stdio attached)
  ├─11─ On agent exit: docker compose down (all containers)
  └─12─ Session directory retained for debugging
```

### 7.2 Updated Docker Compose Generation

The generated `docker-compose.yml` adds a credential service:

```yaml
services:
  proxy-web-research:
    build:
      context: /path/to/docker
      dockerfile: proxy/web-research/Dockerfile
    environment:
      - CHAPTER_PROXY_TOKEN=${CHAPTER_PROXY_TOKEN}
      - CREDENTIAL_PROXY_TOKEN=${CREDENTIAL_PROXY_TOKEN}

  credential-service:                          # NEW
    build:
      context: /path/to/docker
      dockerfile: credential-service/Dockerfile
    environment:
      - CREDENTIAL_PROXY_TOKEN=${CREDENTIAL_PROXY_TOKEN}
    env_file:
      - ${HOME}/.env                           # credential source
    depends_on:
      - proxy-web-research

  agent-researcher-web-research:
    build:
      context: /path/to/docker
      dockerfile: agent/researcher/web-research/Dockerfile
    environment:
      - MCP_PROXY_TOKEN=${CHAPTER_PROXY_TOKEN}
      # NOTE: No API keys, no secrets — only the proxy token
    depends_on:
      - proxy-web-research
      - credential-service
    stdin_open: true
    tty: true
```

Key change: The agent container no longer receives any API keys or secrets via environment variables. Only `MCP_PROXY_TOKEN` (for proxy authentication) is passed. All other credentials flow through the credential service at runtime.

### 7.3 Token Summary

| Token | Generated By | Used By | Purpose |
|-------|-------------|---------|---------|
| `CHAPTER_PROXY_TOKEN` | `run-agent` | proxy, agent-entry | Agent ↔ proxy MCP authentication |
| `CREDENTIAL_PROXY_TOKEN` | `run-agent` | proxy, credential-service | Credential service ↔ proxy WebSocket auth |
| `AGENT_SESSION_TOKEN` | proxy (at connect-agent) | agent-entry | Per-session agent identity, passed with credential requests |

---

## 8. `mcp-test` Agent Package

A test agent for verifying the credential and MCP tool pipeline.

### 8.1 Package Definition

```json
{
  "name": "@clawmasons/agent-mcp-test",
  "version": "1.0.0",
  "chapter": {
    "type": "agent",
    "name": "MCP Test",
    "slug": "mcp-test",
    "runtimes": ["node"],
    "roles": ["@clawmasons/role-mcp-test"],
    "credentials": ["TEST_TOKEN"]
  }
}
```

### 8.2 Behavior

The `mcp-test` agent is a simple interactive CLI:

```
$ chapter run-agent mcp-test mcp-test-role

  [mcp-test] Connected. TEST_TOKEN received.
  [mcp-test] Type "list" for available tools, "<tool> <json>" to call, "exit" to quit.

  > list
  Available tools:
    - web-search_search_web
    - web-search_fetch_page

  > web-search_search_web {"query": "mason"}
  Result: { "results": [...] }

  > exit
```

### 8.3 Test Role

```json
{
  "name": "@clawmasons/role-mcp-test",
  "version": "1.0.0",
  "chapter": {
    "type": "role",
    "risk": "LOW",
    "permissions": {
      "*": { "allow": ["*"] }
    }
  }
}
```

The test role has `LOW` risk and allows all tools — it's for testing only.

---

## 9. Requirements

### P0 — Must-Have

**REQ-001: Credential Service Package**

Create `packages/credential-service` (`@clawmasons/credential-service`) as a new monorepo package.

Acceptance criteria:
- Given the monorepo, when `npm install` is run, then `@clawmasons/credential-service` is linked.
- Given the package, when imported, then it exports both CLI entrypoint and SDK API.

**REQ-002: Credential Resolution — Environment Variables**

The credential service resolves credentials from host environment variables.

Acceptance criteria:
- Given `SERP_API_KEY=abc123` in the process environment, when credential `SERP_API_KEY` is requested, then the value `abc123` is returned.
- Given a credential key not present in any source, when requested, then the response is an error identifying the missing key.

**REQ-003: Credential Resolution — `.env` File**

The credential service resolves credentials from `.env` files using the existing `loadEnvFile` utility.

Acceptance criteria:
- Given `SERP_API_KEY=abc123` in the `.env` file and not in process env, when credential `SERP_API_KEY` is requested, then the value `abc123` is returned.
- Given a credential present in both process env and `.env` file, when requested, then the process env value takes priority.

**REQ-004: Credential Resolution — macOS Keychain**

The credential service resolves credentials from macOS Keychain.

Acceptance criteria:
- Given a credential stored in macOS Keychain under service `mason` and not in process env or `.env`, when requested, then the Keychain value is returned.
- Given a non-macOS system, when Keychain resolution is attempted, then it is silently skipped.

**REQ-005: WebSocket Connection to Proxy**

The credential service connects to the MCP proxy via WebSocket, authenticated with `CREDENTIAL_PROXY_TOKEN`.

Acceptance criteria:
- Given a running proxy, when the credential service starts, then it establishes a WebSocket connection.
- Given an invalid `CREDENTIAL_PROXY_TOKEN`, when the credential service attempts to connect, then the proxy rejects the connection.

**REQ-006: Credential Access Validation**

The credential service validates that the requesting agent is authorized to access the requested credential.

Acceptance criteria:
- Given agent `researcher` with `credentials: ["SERP_API_KEY"]`, when `SERP_API_KEY` is requested, then it is granted.
- Given agent `researcher` with `credentials: ["SERP_API_KEY"]`, when `GITHUB_TOKEN` is requested (not declared), then it is denied.

**REQ-007: Credential Audit Logging**

All credential requests are logged to the `credential_audit` table in `chapter.db`.

Acceptance criteria:
- Given a successful credential request, when the audit log is queried, then an entry exists with `outcome: "granted"`.
- Given a denied credential request, when the audit log is queried, then an entry exists with `outcome: "denied"` and a `deny_reason`.

**REQ-008: Agent Entry Package**

Create `packages/agent-entry` (`@clawmasons/agent-entry`) as a standalone esbuild-bundled binary.

Acceptance criteria:
- Given the package, when built, then it produces a single bundled JavaScript file.
- Given the bundled file, when executed with Node.js, then it does not require any `node_modules`.

**REQ-009: Agent Entry — Proxy Connection**

Agent entry connects to the proxy's `connect-agent` endpoint with `MCP_PROXY_TOKEN` and receives an `AGENT_SESSION_TOKEN`.

Acceptance criteria:
- Given a running proxy and valid `MCP_PROXY_TOKEN`, when agent-entry starts, then it receives an `AGENT_SESSION_TOKEN`.
- Given an invalid `MCP_PROXY_TOKEN`, when agent-entry starts, then it exits with code 1 and an "authentication failed" message.

**REQ-010: Agent Entry — Credential Retrieval**

Agent entry requests all declared credentials via the proxy's credential tool.

Acceptance criteria:
- Given an agent declaring `credentials: ["SERP_API_KEY", "OPENAI_API_KEY"]`, when agent-entry runs, then it requests both credentials before launching the runtime.
- Given all credentials resolved successfully, when the runtime launches, then both credentials are available as environment variables in the child process.

**REQ-011: Agent Entry — Child Process Isolation**

Credentials are set only on the child process, not on the agent-entry process itself.

Acceptance criteria:
- Given agent-entry has retrieved credentials, when the container is inspected (`docker inspect`), then no credential values appear in the environment.
- Given agent-entry has launched the runtime, when the runtime reads `process.env.SERP_API_KEY`, then the value is available.

**REQ-012: Agent Entry — Stdio Redirection**

Agent entry redirects the child process stdio to the container stdio.

Acceptance criteria:
- Given the runtime is launched, when the runtime writes to stdout, then it appears on the container's stdout.
- Given the container's stdin receives input, when read by the runtime, then it receives the input.

**REQ-013: Agent `credentials` Schema Field**

Add `credentials` field to the agent chapter schema.

Acceptance criteria:
- Given `"credentials": ["KEY_A", "KEY_B"]` in an agent's chapter field, when validated, then it passes.
- Given `"credentials": [123]` in an agent's chapter field, when validated, then it fails (must be strings).
- Given no `credentials` field, when validated, then it passes (defaults to `[]`).

**REQ-014: App `credentials` Schema Field**

Add `credentials` field to the app chapter schema.

Acceptance criteria:
- Given `"credentials": ["API_KEY"]` in an app's chapter field, when validated, then it passes.
- Given no `credentials` field, when validated, then it passes (defaults to `[]`).

**REQ-015: Role `risk` Schema Field**

Add `risk` field to the role chapter schema.

Acceptance criteria:
- Given `"risk": "HIGH"` in a role's chapter field, when validated, then it passes.
- Given `"risk": "INVALID"` in a role's chapter field, when validated, then it fails.
- Given no `risk` field, when validated, then it passes (defaults to `"LOW"`).

**REQ-016: Risk-Based Connection Limits**

HIGH and MEDIUM risk roles prevent additional agent connections to the proxy.

Acceptance criteria:
- Given a session with a `HIGH` risk role and one connected agent, when a second agent attempts to connect, then the proxy rejects it with 403.
- Given a session with a `LOW` risk role and one connected agent, when a second agent attempts to connect, then the proxy allows it.

**REQ-017: `docker-init` — Credential Service Dockerfile**

`docker-init` generates a Dockerfile for the credential service.

Acceptance criteria:
- Given `docker-init` is run, then `docker/credential-service/Dockerfile` exists.
- Given the Dockerfile, when built, then the resulting image runs `@clawmasons/credential-service`.
- Given the image, then the user is `mason`.

**REQ-018: `run-agent` — Credential Display**

`run-agent` displays required credentials before launching containers.

Acceptance criteria:
- Given agent `researcher` with credentials `["SERP_API_KEY", "OPENAI_API_KEY"]`, when `run-agent` is invoked, then both credential keys are displayed with their declaring packages.
- Given the display, then the role's risk level is shown.

**REQ-019: `run-agent` — Credential Service Lifecycle**

`run-agent` starts the credential service container after the proxy and before the agent.

Acceptance criteria:
- Given `run-agent` is invoked, then the generated `docker-compose.yml` includes a `credential-service` service.
- Given the compose services, then the credential service depends on the proxy and the agent depends on the credential service.
- Given `docker compose down`, then all three containers (proxy, credential-service, agent) are stopped.

**REQ-020: `run-agent` — Token Generation**

`run-agent` generates both `CHAPTER_PROXY_TOKEN` and `CREDENTIAL_PROXY_TOKEN`.

Acceptance criteria:
- Given `run-agent` is invoked, then both tokens are generated as random 32-byte hex strings.
- Given the tokens, then `CHAPTER_PROXY_TOKEN` is passed to proxy and agent, and `CREDENTIAL_PROXY_TOKEN` is passed to proxy and credential service.

**REQ-021: `run-agent` — No API Keys in Agent Container**

The agent container environment in docker-compose must not contain any API keys or secrets.

Acceptance criteria:
- Given the generated `docker-compose.yml`, when the agent service environment is inspected, then only `MCP_PROXY_TOKEN` is present (no `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.).

### P1 — Should-Have

**REQ-022: `mcp-test` Agent**

Create the `mcp-test` agent and role packages for integration testing.

Acceptance criteria:
- Given `mcp-test` is run via `run-agent`, when "list" is entered, then available MCP tools are displayed.
- Given a tool name and JSON args, when entered, then the tool is called and results displayed.
- Given `mcp-test` requests `TEST_TOKEN`, when the credential service has it, then it is received.

**REQ-023: `chapter validate` — Credential Validation**

`chapter validate` checks that agents declare all credentials their apps need.

Acceptance criteria:
- Given an agent using an app that declares `credentials: ["API_KEY"]` but the agent does not declare `API_KEY`, when `validate` is run, then a warning is emitted.
- Given all app credentials are covered by agent declarations, when `validate` is run, then no credential warnings are emitted.

### P2 — Nice-to-Have

**REQ-024: Key Pair Generation**

`docker-init` generates RSA key pairs for each agent container.

Acceptance criteria:
- Given `docker-init` is run, then `docker/keys/<agent>/<role>/public.pem` exists for each agent × role.
- Given agent images, then private keys are embedded at `/home/mason/.chapter/keys/private.pem`.

**REQ-025: Cryptographic Request Signing**

Credential requests can be cryptographically signed with agent private keys.

Acceptance criteria:
- Given `requireSigning: true` in credential service config, when an unsigned request arrives, then it is denied.
- Given `requireSigning: false` (default), when an unsigned request arrives, then it is processed normally.
- Given a signed request, when the signature is verified against the agent's public key, then the credential is granted.

---

## 10. Open Questions

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| Q1 | Should the credential service run as a sidecar in the proxy container rather than a separate container? A sidecar reduces network hops but increases proxy image size. | Engineering | No |
| Q2 | Should macOS Keychain integration use a specific service name (e.g., `mason`) or allow configuration? | Engineering | No |
| Q3 | How should credential rotation be handled? If a credential value changes while an agent is running, should the agent be notified or must it restart? | Product | No |
| Q4 | Should the `connect-agent` endpoint be a new endpoint or extend the existing SSE/Streamable-HTTP connection flow? | Engineering | Yes |
| Q5 | Should the credential service support credential caching (e.g., Keychain lookups are slow) or resolve fresh each time? | Engineering | No |
| Q6 | For the `.env` file source, should the credential service read the project `.env` or a dedicated `.env.credentials` file? | Product | No |

---

## 11. Out of Scope

- Credential rotation / dynamic refresh during an active session
- External secret management services (HashiCorp Vault, AWS Secrets Manager, etc.)
- Multi-tenant credential isolation (one credential service per chapter)
- Credential encryption at rest (relies on host OS protections)
- GUI or web UI for credential management
- Windows Credential Manager or Linux Secret Service integration (macOS Keychain only for phase 1)
- Remote/cloud credential service deployment
- Agent-to-agent credential sharing

---

## Appendix A: Updated `chapter` Field JSON Schema Reference

| Property | app | skill | task | role | agent |
|----------|-----|-------|------|------|-------|
| `type` | Y | Y | Y | Y | Y |
| `name` | — | — | — | — | Y |
| `slug` | — | — | — | — | Y |
| `description` | Y | Y | Y | Y | Y |
| `transport` | Y | — | — | — | — |
| `command` | Y | — | — | — | — |
| `args` | Y | — | — | — | — |
| `url` | Y | — | — | — | — |
| `env` | Y | — | — | — | — |
| `tools` | Y | — | — | — | — |
| `capabilities` | Y | — | — | — | — |
| `credentials` | **Y** | — | — | — | **Y** |
| `artifacts` | — | Y | — | — | — |
| `taskType` | — | — | Y | — | — |
| `prompt` | — | — | Y | — | — |
| `requires` | — | — | Y | — | — |
| `timeout` | — | — | Y | — | — |
| `approval` | — | — | Y | — | — |
| `tasks` | — | — | — | Y | — |
| `permissions` | — | — | — | Y | — |
| `constraints` | — | — | — | Y | — |
| `risk` | — | — | — | **Y** | — |
| `runtimes` | — | — | — | — | Y |
| `roles` | — | — | — | — | Y |
| `resources` | — | — | — | — | Y |
| `proxy` | — | — | — | — | Y |
| `llm` | — | — | — | — | Y |

**Bold** = new in this PRD.

## Appendix B: Credential Service Zod Schema

```typescript
// packages/credential-service/src/schemas.ts

const credentialRequestSchema = z.object({
  key: z.string(),
  agentId: z.string(),
  role: z.string(),
  sessionId: z.string(),
  sessionToken: z.string(),
  signature: z.string().optional(),   // Phase 2
  timestamp: z.string().optional(),   // Phase 2
});

const credentialResponseSchema = z.union([
  z.object({
    key: z.string(),
    value: z.string(),
    source: z.enum(["env", "keychain", "dotenv"]),
  }),
  z.object({
    key: z.string(),
    error: z.string(),
    code: z.enum(["NOT_FOUND", "ACCESS_DENIED", "INVALID_SESSION"]),
  }),
]);

const credentialServiceConfigSchema = z.object({
  proxyUrl: z.string().url(),
  credentialProxyToken: z.string(),
  envFilePath: z.string().optional(),
  requireSigning: z.boolean().default(false),
  keychainService: z.string().default("mason"),
});
```
