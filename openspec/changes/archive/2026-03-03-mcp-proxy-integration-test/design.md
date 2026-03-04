## Context

PAM generates mcp-proxy config, docker-compose.yml, and .env files during `pam install`. The `pam run` command starts the proxy via Docker. Currently, all tests are unit tests that mock filesystem and child_process — no test actually starts Docker or verifies the proxy responds to MCP protocol requests. The example workspace exists but has never been validated end-to-end.

## Goals / Non-Goals

**Goals:**
- Validate the full pipeline: build → install → docker compose up → MCP protocol works
- Catch regressions in proxy config generation, docker-compose generation, and env setup
- Use standard networking tools (curl/fetch) to simulate agent MCP requests
- Test runs as a shell script that can be invoked manually or in CI

**Non-Goals:**
- Running an actual AI agent against the proxy
- Testing the Claude Code materializer or Dockerfile build
- Performance/load testing
- Testing remote MCP transports (only stdio apps via proxy)

## Decisions

### 1. Shell script integration test (not vitest)
The integration test will be a standalone shell script (`tests/integration/mcp-proxy.sh`) rather than a vitest test. Rationale: it requires Docker, takes 30+ seconds, and should not run during normal `npm test`. A shell script is simpler, can use curl directly, and is easy to run in CI as a separate step.

### 2. Use MCP Streamable HTTP protocol via curl
The mcp-proxy supports SSE and streamable-http. We'll use the streamable-http endpoint (`/mcp`) with curl for request/response, which is simpler than SSE streaming for testing purposes. We'll send JSON-RPC requests (initialize, tools/list, tools/call) as POST requests with the auth token in the Authorization header.

### 3. Build before test
The script will run `npm run build` from the project root before invoking `node ../bin/pam.js install`. This ensures the dist/ is up-to-date.

### 4. Retry with backoff for proxy readiness
Docker containers take a few seconds to start. The script will poll the proxy endpoint with a retry loop (up to 30 seconds, 1-second intervals) before running assertions.

### 5. Cleanup in trap handler
Use `trap` to ensure `docker compose down` runs on exit regardless of success/failure.

## Risks / Trade-offs

- **Docker required** → Tests won't run in environments without Docker. Mitigated by keeping this separate from `npm test`.
- **Port conflicts** → The proxy uses port 9090 by default. If another service uses that port, the test will fail. Mitigated by using a random high port via PAM_PROXY_PORT override.
- **Network timing** → Container startup time varies. Mitigated by retry loop with timeout.
- **mcp-proxy image pull** → First run may be slow due to image download. Acceptable for integration tests.
