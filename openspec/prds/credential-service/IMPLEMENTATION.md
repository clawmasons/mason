# Credential Service — Implementation Plan

**PRD:** [openspec/prds/credential-service/PRD.md](./PRD.md)
**Phase:** P0 (Core Credential Service) + P1 (Testing & Validation)

---

## Implementation Steps

### CHANGE 1: Schema Changes — `credentials` and `risk` Fields

Add `credentials` field to agent and app Zod schemas, add `risk` field to role Zod schema, and update resolved types.

**PRD refs:** REQ-013 (Agent `credentials` Schema Field), REQ-014 (App `credentials` Schema Field), REQ-015 (Role `risk` Schema Field)

**Summary:** This is the foundational schema change — all subsequent credential-service code depends on packages being able to declare their credential requirements and risk levels. Add `credentials: z.array(z.string()).optional().default([])` to the agent and app schemas in `packages/shared/src/schemas/`. Add `risk: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().default("LOW")` to the role schema. Update the resolved types in `packages/shared/src/types.ts` to include `credentials` on `ResolvedAgent` and `ResolvedApp`, and `risk` on `ResolvedRole`. Update the resolver in `packages/cli/src/resolver/resolve.ts` to propagate the new fields during resolution. Update the Appendix A schema reference table in the PRD.

**User Story:** As a chapter package author, when I add `"credentials": ["OPENAI_API_KEY"]` to my agent's chapter field, the schema validates it. When I add `"risk": "HIGH"` to my role's chapter field, the schema validates it. If I omit these fields, they default to `[]` and `"LOW"` respectively.

**Scope:**
- Modify: `packages/shared/src/schemas/agent.ts` — add `credentials` field
- Modify: `packages/shared/src/schemas/app.ts` — add `credentials` field
- Modify: `packages/shared/src/schemas/role.ts` — add `risk` field
- Modify: `packages/shared/src/types.ts` — add `credentials` to `ResolvedAgent`, `ResolvedApp`; add `risk` to `ResolvedRole`
- Modify: `packages/cli/src/resolver/resolve.ts` — propagate `credentials` and `risk` during resolution
- New tests: schema validation tests for `credentials` (valid array, invalid types, default) and `risk` (valid enum, invalid value, default)
- Update existing tests that construct `ResolvedAgent`, `ResolvedApp`, `ResolvedRole` objects

**Testable output:** Schema validates `{ "type": "agent", ..., "credentials": ["KEY_A"] }`. Schema rejects `{ "credentials": [123] }`. Schema validates `{ "type": "role", ..., "risk": "HIGH" }`. Schema rejects `{ "risk": "INVALID" }`. Omitting `credentials` defaults to `[]`. Omitting `risk` defaults to `"LOW"`. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Implemented** — [spec](../../specs/schema-credentials-risk/spec.md)

---

### CHANGE 2: Credential Resolver

Create the credential resolution engine that resolves credential values from multiple sources in priority order: environment variables → macOS Keychain → `.env` file.

**PRD refs:** REQ-002 (Credential Resolution — Environment Variables), REQ-003 (Credential Resolution — `.env` File), REQ-004 (Credential Resolution — macOS Keychain)

**Summary:** Build a standalone, testable credential resolver module at `packages/credential-service/src/resolver.ts`. The resolver takes a credential key and attempts to resolve it from three sources in priority order: (1) process environment variables, (2) macOS Keychain via `security find-generic-password`, (3) `.env` file using the existing `loadEnvFile` utility from `@clawmasons/proxy`. Each resolution attempt returns both the value and the source it came from. If no source has the credential, the resolver returns a structured error listing all sources attempted. The Keychain source is silently skipped on non-macOS systems. This module has no network dependencies — it's pure resolution logic.

**User Story:** As the credential service, when I need to resolve `OPENAI_API_KEY`, I call the resolver and it checks env vars first, then Keychain, then `.env`. I get back `{ value: "sk-...", source: "env" }` or an error explaining what was tried.

**Scope:**
- New package: `packages/credential-service/` — initial package scaffold (`package.json`, `tsconfig.json`, `tsconfig.build.json`)
- New: `packages/credential-service/src/resolver.ts` — `CredentialResolver` class
  - `constructor(config: { envFilePath?: string; keychainService?: string })`
  - `resolve(key: string): Promise<{ value: string; source: "env" | "keychain" | "dotenv" } | { error: string; code: "NOT_FOUND"; sourcesAttempted: string[] }>`
  - Private methods: `resolveFromEnv(key)`, `resolveFromKeychain(key)`, `resolveFromDotenv(key)`
- Reuse: `loadEnvFile()` from `@clawmasons/proxy` (or copy the utility to avoid cross-package dependency)
- New: `packages/credential-service/tests/resolver.test.ts`
- Keychain integration: spawn `security find-generic-password -s <service> -a <key> -w` (macOS only, detected via `process.platform`)

**Testable output:** Unit tests with mocked env/dotenv: resolve from env returns `source: "env"`. Resolve from dotenv (not in env) returns `source: "dotenv"`. Env takes priority over dotenv. Missing key returns error with `sourcesAttempted`. Keychain is skipped on non-macOS (mocked platform check). `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Implemented** — [spec](../../specs/credential-resolver/spec.md)

---

### CHANGE 3: Credential Service Package — WebSocket Client, Access Validation & Audit

Build the credential service core: WebSocket connection to proxy, access validation against agent declarations, and audit logging to SQLite.

**PRD refs:** REQ-001 (Credential Service Package), REQ-005 (WebSocket Connection to Proxy), REQ-006 (Credential Access Validation), REQ-007 (Credential Audit Logging)

**Summary:** Flesh out `packages/credential-service` with: (1) Zod schemas for credential requests/responses (from PRD Appendix B). (2) WebSocket client that connects to the proxy, authenticated with `CREDENTIAL_PROXY_TOKEN`, and handles incoming credential requests from agents relayed by the proxy. (3) Access validation — before resolving a credential, validate that the requested key appears in the agent's declared `credentials` list (passed in the request metadata). (4) Audit logging — extend the existing `chapter.db` with a `credential_audit` table and log every request with outcome (granted/denied/error), agent identity, and source. (5) SDK mode — export a `CredentialService` class that can be instantiated in-process (for testing without WebSocket). (6) CLI entrypoint at `packages/credential-service/src/cli.ts` for standalone Docker deployment.

**User Story:** As the proxy, when an agent requests a credential, I forward the request over WebSocket to the credential service. The service checks if the agent is allowed that credential, resolves it, logs the outcome, and sends back the result. In tests, I instantiate the service directly via SDK mode without needing a running proxy.

**Scope:**
- New: `packages/credential-service/src/schemas.ts` — Zod schemas (`credentialRequestSchema`, `credentialResponseSchema`, `credentialServiceConfigSchema`)
- New: `packages/credential-service/src/service.ts` — `CredentialService` class (SDK mode)
  - `constructor(config: CredentialServiceConfig, resolver: CredentialResolver)`
  - `handleRequest(request: CredentialRequest): Promise<CredentialResponse>` — validate access → resolve → audit → respond
- New: `packages/credential-service/src/ws-client.ts` — WebSocket client connecting to proxy
  - `connect(proxyUrl: string, token: string): Promise<void>`
  - Message handler: parse incoming requests → `service.handleRequest()` → send response
  - Reconnect logic (3 retries, 1s backoff)
- New: `packages/credential-service/src/audit.ts` — `credential_audit` table creation and insert functions
  - `createCredentialAuditTable(db: Database): void`
  - `insertCredentialAudit(db: Database, entry: CredentialAuditEntry): void`
  - `queryCredentialAudit(db: Database, filters?): CredentialAuditEntry[]`
- New: `packages/credential-service/src/cli.ts` — CLI entrypoint (reads config from env, instantiates service, connects WebSocket)
- New: `packages/credential-service/src/index.ts` — barrel export (SDK API)
- New: `packages/credential-service/tests/service.test.ts` — unit tests for access validation
- New: `packages/credential-service/tests/audit.test.ts` — unit tests for audit logging
- Modify: `packages/credential-service/package.json` — add dependencies (`ws`, `better-sqlite3`, `zod`), bin entry

**Testable output:** SDK mode: instantiate `CredentialService` → `handleRequest({ key: "API_KEY", agentId: "test", ... })` returns resolved value when agent declares the credential, returns `ACCESS_DENIED` when not declared. Audit table: after request, query returns entry with correct fields. WebSocket client: unit test with mock WebSocket server verifies connect/auth/request/response cycle. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**

---

### CHANGE 4: Proxy Credential Infrastructure — Connect-Agent, WebSocket Server & Credential Tool

Add three new capabilities to the MCP proxy: (1) a `connect-agent` HTTP endpoint that issues session tokens, (2) a WebSocket server endpoint that accepts the credential service connection, and (3) a `credential_request` MCP tool that agents call to retrieve credentials.

**PRD refs:** REQ-005 (proxy side — WebSocket server for credential service), REQ-009 (Agent Entry — Proxy Connection, proxy side)

**Summary:** Extend `packages/proxy/src/server.ts` with: (1) `POST /connect-agent` endpoint — accepts `MCP_PROXY_TOKEN` in Authorization header, generates and returns an `AGENT_SESSION_TOKEN` + `session_id`. Stores active sessions in memory. (2) `GET /ws/credentials` WebSocket endpoint — accepts credential service connections authenticated with `CREDENTIAL_PROXY_TOKEN`. Only one credential service connection allowed per proxy instance. (3) `credential_request` MCP tool — registered as an internal tool (not from upstream). When an agent calls it with `{ key, session_token }`, the proxy validates the session token, forwards the request over WebSocket to the credential service, and returns the response. This change creates the proxy as the central relay between agents and the credential service.

**User Story:** As agent-entry, I POST to `/connect-agent` with my proxy token and get back a session token. I then call the `credential_request` MCP tool with the credential key and session token. The proxy relays my request to the credential service and returns the resolved value. As the credential service, I connect via WebSocket to the proxy and receive forwarded credential requests.

**Scope:**
- Modify: `packages/proxy/src/server.ts` — add `/connect-agent` route, `/ws/credentials` WebSocket endpoint, register `credential_request` tool
- New: `packages/proxy/src/handlers/connect-agent.ts` — session token generation, session tracking
  - `handleConnectAgent(req, res, proxyToken: string): void`
  - `SessionStore` — in-memory map of session_id → { agentId, role, sessionToken, connectedAt }
- New: `packages/proxy/src/handlers/credential-relay.ts` — WebSocket server + MCP tool handler
  - `CredentialRelay` class
  - `acceptCredentialService(ws: WebSocket, token: string): void` — authenticate and store WS connection
  - `handleCredentialRequest(sessionStore: SessionStore, key: string, sessionToken: string): Promise<CredentialResponse>` — validate session → forward via WS → return response
- New: `packages/proxy/tests/handlers/connect-agent.test.ts`
- New: `packages/proxy/tests/handlers/credential-relay.test.ts`
- Modify: `packages/proxy/package.json` — add `ws` dependency

**Testable output:** POST `/connect-agent` with valid token → 200 with `{ sessionToken, sessionId }`. POST with invalid token → 401. WebSocket connects with valid `CREDENTIAL_PROXY_TOKEN` → accepted. WebSocket with invalid token → rejected. Agent calls `credential_request` tool → proxy relays to credential service WS → agent receives response. Calling `credential_request` with invalid session token → error. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**

---

### CHANGE 5: Risk-Based Connection Limits

Enforce connection limits on the proxy based on the role's `risk` level.

**PRD refs:** REQ-016 (Risk-Based Connection Limits)

**Summary:** Extend the `connect-agent` handler to enforce risk-based connection limits. When an agent connects, look up the role's risk level. If the role is `HIGH` or `MEDIUM`, only allow the first agent connection per proxy session — subsequent connection attempts are rejected with 403. For `LOW` risk roles, allow unlimited connections. The risk level comes from the resolved role metadata passed to the proxy at startup (via the `--agent` flag that resolves the agent's roles). Add session locking state to the `SessionStore` from CHANGE 4.

**User Story:** As an agent operator using a `HIGH` risk role, when my agent connects to the proxy, it works normally. If a compromised agent tries to spawn a sub-agent that connects to the same proxy, the connection is rejected — preventing privilege escalation.

**Scope:**
- Modify: `packages/proxy/src/handlers/connect-agent.ts` — add risk checking and session locking
  - `SessionStore` gains: `locked: boolean`, `riskLevel: "HIGH" | "MEDIUM" | "LOW"`
  - On connect: if risk is HIGH/MEDIUM and session already has an agent → reject 403
- Modify: `packages/proxy/src/server.ts` — pass resolved role risk level to connect-agent handler
- Modify: `packages/proxy/tests/handlers/connect-agent.test.ts` — add risk-based tests

**Testable output:** HIGH risk role: first connect → 200, second connect → 403 with "session locked" message. MEDIUM risk: same behavior. LOW risk: first connect → 200, second connect → 200. Audit log records the rejection. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**

---

### CHANGE 6: Agent Entry Package

Create `packages/agent-entry` — a standalone esbuild-bundled binary that bootstraps agent containers by connecting to the proxy, retrieving credentials, and launching the agent runtime with credentials injected into the child process environment only.

**PRD refs:** REQ-008 (Agent Entry Package), REQ-009 (Agent Entry — Proxy Connection), REQ-010 (Agent Entry — Credential Retrieval), REQ-011 (Agent Entry — Child Process Isolation), REQ-012 (Agent Entry — Stdio Redirection)

**Summary:** Create a new package `packages/agent-entry` that bundles into a single JavaScript file via esbuild. The bootstrap flow: (1) read `MCP_PROXY_TOKEN` from environment, (2) POST to proxy `/connect-agent` → receive `AGENT_SESSION_TOKEN` + `session_id`, (3) for each credential in the agent's `credentials` list, call the proxy's `credential_request` MCP tool, (4) spawn the agent runtime child process with credentials set as env vars on the child only (using `child_process.spawn` with `env` option), (5) pipe container stdin/stdout/stderr to child process, (6) wait for child exit and propagate exit code. The agent's credential list and runtime command are passed via environment variables (`AGENT_CREDENTIALS` as JSON array, `AGENT_RUNTIME_CMD` as the command to run).

**User Story:** As a Docker container entrypoint, agent-entry boots, authenticates with the proxy, retrieves all credentials securely, and launches the actual agent runtime (e.g., claude-code). The runtime has credentials in its env, but the container itself doesn't — so `docker inspect` shows nothing sensitive.

**Scope:**
- New: `packages/agent-entry/package.json` — `@clawmasons/agent-entry`, esbuild build script
- New: `packages/agent-entry/tsconfig.json`
- New: `packages/agent-entry/src/index.ts` — main entrypoint
  - `bootstrap()` — orchestrates the full flow
  - `connectToProxy(proxyUrl: string, token: string): Promise<{ sessionToken: string; sessionId: string }>`
  - `requestCredentials(proxyUrl: string, sessionToken: string, keys: string[]): Promise<Record<string, string>>`
  - `launchRuntime(command: string, args: string[], env: Record<string, string>): Promise<number>` — spawn child with credential env, pipe stdio, return exit code
- New: `packages/agent-entry/src/mcp-client.ts` — lightweight MCP client for calling `credential_request` tool (uses fetch + SSE, no heavy SDK dependency)
- New: `packages/agent-entry/esbuild.config.ts` — bundle to single file, target node22
- New: `packages/agent-entry/tests/index.test.ts` — unit tests with mocked proxy
- New: `packages/agent-entry/tests/launch.test.ts` — child process isolation tests

**Testable output:** `npm run build` in agent-entry produces a single bundled `.js` file. The bundle runs with Node.js and no `node_modules`. Unit test: mock proxy `/connect-agent` → returns session token. Mock `credential_request` tool → returns credentials. Child process launched with credentials in env. Container process env does NOT contain credentials. Stdio forwarding works (child stdout → process stdout). Child exit code propagates. Error cases: proxy unreachable → retries 3x then exits 1. Invalid token → exits 1. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**

---

### CHANGE 7: `docker-init` — Credential Service Dockerfile Generation

Extend `docker-init` to generate a Dockerfile for the credential service container.

**PRD refs:** REQ-017 (`docker-init` — Credential Service Dockerfile)

**Summary:** Modify `packages/cli/src/cli/commands/docker-init.ts` to generate an additional Dockerfile at `docker/credential-service/Dockerfile`. The Dockerfile installs `@clawmasons/credential-service`, runs as the `mason` user, and uses the CLI entrypoint. Create a new generator at `packages/cli/src/generator/credential-service-dockerfile.ts` following the pattern of existing proxy/agent Dockerfile generators. The generated directory structure adds `docker/credential-service/Dockerfile` alongside existing proxy and agent Dockerfiles.

**User Story:** As a chapter author, when I run `chapter docker-init`, I get a credential service Dockerfile in addition to my proxy and agent Dockerfiles. I can build it with `docker build` and it runs the credential service as the `mason` user.

**Scope:**
- New: `packages/cli/src/generator/credential-service-dockerfile.ts` — Dockerfile generation
  - `generateCredentialServiceDockerfile(): string`
- Modify: `packages/cli/src/cli/commands/docker-init.ts` — call generator, write Dockerfile
- New: `packages/cli/tests/generator/credential-service-dockerfile.test.ts`
- Modify: `packages/cli/tests/cli/commands/docker-init.test.ts` — verify credential-service Dockerfile is generated

**Testable output:** After `docker-init`, `docker/credential-service/Dockerfile` exists. Dockerfile contains `USER mason`. Dockerfile installs `@clawmasons/credential-service`. Dockerfile entrypoint runs the CLI. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**

---

### CHANGE 8: `run-agent` — Credential Service Integration

Update `run-agent` to display required credentials, generate the credential proxy token, start the credential service container, update docker-compose to remove API keys from agent containers, and manage the credential service lifecycle.

**PRD refs:** REQ-018 (`run-agent` — Credential Display), REQ-019 (`run-agent` — Credential Service Lifecycle), REQ-020 (`run-agent` — Token Generation), REQ-021 (`run-agent` — No API Keys in Agent Container)

**Summary:** Modify `packages/cli/src/cli/commands/run-agent.ts` with four changes: (1) Before launching containers, resolve the agent's required credentials (union of agent.credentials and all app.credentials from the role) and display them with their declaring packages and the role's risk level. (2) Generate `CREDENTIAL_PROXY_TOKEN` (random 32-byte hex) in addition to the existing `CHAPTER_PROXY_TOKEN`. (3) Update docker-compose generation to include a `credential-service` container that depends on proxy, with `CREDENTIAL_PROXY_TOKEN` in its env and `.env` file mounted read-only. Update the agent container to depend on credential-service. (4) Remove all API keys (`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) from the agent container's environment — only `MCP_PROXY_TOKEN` remains.

**User Story:** As an agent operator, when I run `chapter run-agent researcher web-research`, I see a summary of required credentials and the role's risk level before any containers start. The credential service starts automatically after the proxy. My agent container no longer has API keys in its environment — they flow through the credential service at runtime.

**Scope:**
- Modify: `packages/cli/src/cli/commands/run-agent.ts`
  - Add: credential resolution and display before launch
  - Add: `CREDENTIAL_PROXY_TOKEN` generation
  - Add: `credential-service` service in docker-compose generation
  - Remove: API key environment variables from agent service
- Modify: `packages/cli/tests/cli/commands/run-agent.test.ts`
  - Add: tests for credential display output
  - Add: tests for CREDENTIAL_PROXY_TOKEN generation
  - Add: tests verifying credential-service in compose
  - Add: tests verifying no API keys in agent environment

**Testable output:** Running `run-agent` displays credential keys, declaring packages, and risk level. Generated `docker-compose.yml` has `credential-service` service with `CREDENTIAL_PROXY_TOKEN` and `depends_on: proxy`. Agent service has `depends_on: credential-service`. Agent service environment contains only `MCP_PROXY_TOKEN` (no API keys). Both tokens are unique random hex strings. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**

---

### CHANGE 9: `mcp-test` Agent Package

Create the `mcp-test` agent and role packages for integration and end-to-end testing of the credential and MCP tool pipeline.

**PRD refs:** REQ-022 (`mcp-test` Agent)

**Summary:** Create two chapter packages: `@clawmasons/agent-mcp-test` (agent type, requests `TEST_TOKEN` credential, runtime `node`) and `@clawmasons/role-mcp-test` (role type, `LOW` risk, allows all tools). The agent is a simple Node.js interactive CLI: on boot, it verifies `TEST_TOKEN` was received, then enters a REPL loop where `list` shows available MCP tools, `<tool_name> <json_args>` calls a tool verbatim and prints the result, and `exit` quits. The agent connects to the proxy via MCP (SSE transport) using the `.mcp.json` materialized by agent-entry. This package exercises the full credential pipeline end-to-end.

**User Story:** As a developer, I run `chapter run-agent mcp-test mcp-test-role` and get an interactive shell. I type `list` and see the available tools. I type `some-tool {"arg": "value"}` and see the tool's response. This proves the entire credential → proxy → tool pipeline works.

**Scope:**
- New: `chapter-core/agents/mcp-test/package.json` — agent package with `credentials: ["TEST_TOKEN"]`
- New: `chapter-core/agents/mcp-test/src/index.ts` — interactive REPL agent
- New: `chapter-core/roles/mcp-test/package.json` — role package with `risk: "LOW"`, wildcard permissions
- New: integration test: `tests/integration/credential-flow.test.ts` — test credential retrieval via mcp-test agent (SDK mode, no Docker)

**Testable output:** `mcp-test` agent package validates with `chapter validate`. Agent declares `TEST_TOKEN` credential. Role has `risk: "LOW"` and wildcard permissions. Integration test: start proxy + credential service (SDK mode) → agent-entry bootstraps mcp-test → `TEST_TOKEN` credential received → `list` returns tools → tool call works. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**

---

### CHANGE 10: `chapter validate` — Credential Declaration Validation

Extend the `chapter validate` command to check that agents declare all credentials required by their apps.

**PRD refs:** REQ-023 (`chapter validate` — Credential Validation)

**Summary:** Modify the validate command to add a credential coverage check. For each agent, collect the agent's declared `credentials`. Then, for each role the agent uses, collect all apps' `credentials`. Check that the agent's credentials list is a superset of all app credentials (`agent.credentials ⊇ union(app.credentials)`). Emit a warning for any app credential not declared by the agent — this isn't an error (the agent can still run) but signals a likely misconfiguration.

**User Story:** As a chapter author, when I run `chapter validate` and my agent uses an app that needs `SERP_API_KEY` but my agent doesn't declare it, I get a warning: "Agent 'researcher' does not declare credential 'SERP_API_KEY' required by app 'web-search'". This catches misconfiguration before I try to run the agent.

**Scope:**
- Modify: `packages/cli/src/cli/commands/validate.ts` (or `packages/cli/src/validator/validate.ts`) — add credential coverage validation
- New: helper function `validateCredentialCoverage(agent: ResolvedAgent): Warning[]`
- Modify: existing validate tests — add credential coverage test cases

**Testable output:** Agent declaring all app credentials → no warnings. Agent missing an app credential → warning emitted naming the agent, missing key, and declaring app. Agent with no credentials and apps with no credentials → no warnings. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**
