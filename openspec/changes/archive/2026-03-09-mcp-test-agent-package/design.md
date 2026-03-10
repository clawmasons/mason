## Context

Changes 1-8 of the credential-service PRD have built the infrastructure: schema changes (credentials/risk fields), credential resolver, credential service (SDK + WS), proxy credential relay, agent-entry bootstrap, docker-init Dockerfile generation, and run-agent integration. What's missing is a concrete test agent that exercises the full pipeline end-to-end.

The `mcp-test` agent is a simple Node.js interactive CLI. It expects `TEST_TOKEN` to be injected via the credential pipeline. On boot, it verifies the token was received. Then it enters a REPL loop for listing and calling MCP tools via the proxy.

## Goals / Non-Goals

**Goals:**
- Agent package declaring `TEST_TOKEN` credential and `node` runtime
- Role package with `LOW` risk and wildcard permissions (`"*": { "allow": ["*"] }`)
- Interactive REPL: `list` shows tools, `<tool> <json>` calls tool, `exit` quits
- Agent connects to proxy via MCP Streamable HTTP using the lightweight mcp-client from agent-entry
- Integration test proving credential retrieval works (SDK mode, no Docker)

**Non-Goals:**
- Docker deployment (covered by e2e tests in future changes)
- Full MCP session management -- uses the simple mcp-client from agent-entry
- Testing macOS Keychain integration

## Decisions

### Decision 1: Place agent/role in e2e fixtures

**Choice**: Place `mcp-test` agent and role packages in `e2e/fixtures/test-chapter/agents/mcp-test/` and `e2e/fixtures/test-chapter/roles/mcp-test/` respectively.

**Rationale**: The IMPLEMENTATION.md references `chapter-core/` which does not exist in the project. The existing test chapter at `e2e/fixtures/test-chapter/` already contains agent and role packages (`test-note-taker`, `writer`). Placing mcp-test alongside them is consistent and makes them available for e2e testing without creating a new top-level directory.

### Decision 2: Reuse mcp-client from agent-entry

**Choice**: The mcp-test agent imports `initializeMcpSession` and `callTool` from `@clawmasons/agent-entry` for MCP communication.

**Rationale**: agent-entry already has a lightweight MCP client that uses fetch + Streamable HTTP. Rather than duplicating this code, the mcp-test agent reuses it. This is valid because mcp-test runs on Node.js which has built-in fetch.

### Decision 3: Integration test uses in-process proxy + credential service

**Choice**: The integration test starts a real `ChapterProxyServer` and `CredentialService` in-process, then exercises the credential flow programmatically (no Docker, no child processes).

**Rationale**: SDK mode testing is faster, more reliable, and doesn't require Docker. It exercises the same code paths: proxy connect-agent -> credential relay -> credential service -> resolver. The test sets `TEST_TOKEN` in `process.env` and verifies it flows through the pipeline.

### Decision 4: Agent reads proxy URL from environment

**Choice**: The agent reads `MCP_PROXY_URL` (default `http://localhost:9090`) and `MCP_PROXY_TOKEN` from environment, matching the agent-entry pattern.

**Rationale**: In the Docker scenario, agent-entry sets these before launching the runtime. For direct testing, they can be set manually. The REPL agent also reads `TEST_TOKEN` from env to verify credential injection worked.

## Risks / Trade-offs

- [Risk] The mcp-test agent depends on `@clawmasons/agent-entry` for its MCP client -- if agent-entry changes its API, mcp-test breaks. Mitigated by both being in the same monorepo with shared TypeScript compilation.
- [Trade-off] Placing packages in e2e fixtures vs a dedicated `chapter-core/` directory -- chosen for consistency with existing patterns, can be moved later if needed.
