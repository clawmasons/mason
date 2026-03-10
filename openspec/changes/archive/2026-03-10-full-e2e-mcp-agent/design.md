## Context

Current e2e tests verify the build pipeline and proxy connectivity but cannot test the full agent flow (build → run → tool calls) because existing agents (`test-note-taker`) require LLM tokens. The `mcp-agent` package already exists as a lightweight tool-calling agent that needs no LLM. However, it's not registered as a recognized runtime in the Dockerfile generator or materializer system, so `chapter build` cannot produce correct Docker artifacts for it.

Additionally, `run-agent` uses `docker compose up` for the agent service, which streams logs but doesn't properly attach stdin/stdout, making interactive agents unresponsive.

## Goals / Non-Goals

**Goals:**
- Enable `mcp-agent` as a first-class runtime: materializer registration, Dockerfile generation, ACP command mapping
- Fix `run-agent` interactive mode by switching to `docker compose run`
- Create a complete e2e test that exercises: build → proxy tool calls and build → ACP agent tool calls via acpx
- Test all 4 filesystem tools (`read_file`, `write_file`, `list_directory`, `create_directory`) through the governed proxy

**Non-Goals:**
- Creating a new acpx package (use existing https://github.com/openclaw/acpx)
- Modifying the mcp-agent package itself
- Adding LLM-dependent tests
- Changing the ACP bridge implementation

## Decisions

### D1: Use `mcp-agent` as runtime name (not `node`)
The existing `mcp-test` fixture uses `"node"` runtime, which maps to a generic `ENTRYPOINT ["npx", "node"]` — this starts a Node REPL, not the agent. Instead, register `"mcp-agent"` as a named runtime with proper entrypoint `["npx", "mcp-agent"]`. The `@clawmasons/mcp-agent` package already declares `bin: { "mcp-agent": "./dist/mcp-agent.js" }`, so `npx mcp-agent` works when the package is in node_modules.

### D2: Create new fixture rather than modifying existing ones
Cannot modify `test-note-taker` (uses `pi-coding-agent` runtime, other tests depend on it) or `mcp-test` (uses `@test/role-mcp-test` with wildcard `"*"` permissions that docker-init doesn't support). Create `mcp-note-taker` fixture that combines `mcp-agent` runtime with `@test/role-writer` (scoped filesystem permissions).

### D3: Test proxy directly + ACP via acpx (two suites)
Suite A tests the proxy tool pipeline by connecting an MCP SDK client directly to the proxy — this verifies build output and governed tool access without needing interactive stdin. Suite B starts the agent in ACP mode and uses acpx to exercise the full ACP protocol flow, verifying the agent correctly connects to the proxy and calls tools.

### D4: `docker compose run --rm --service-ports` for interactive agents
`docker compose run` properly allocates a TTY and attaches stdin/stdout. `--rm` auto-removes the container. `--service-ports` maps any port declarations from the compose file. This matches Docker's intended pattern for interactive services.

## Risks / Trade-offs

- [Port conflicts] Using ports 19600-19702 for new tests → Mitigation: These don't overlap with existing tests (19400, 19500)
- [acpx compatibility] acpx is an external dependency that may change → Mitigation: Pin version in package.json
- [MCP_PROXY_URL in containers] mcp-agent reads `MCP_PROXY_URL` env var, default `localhost:9090` won't work in Docker network → Mitigation: Set `MCP_PROXY_URL=http://proxy-writer:9090` in compose environment
- [TEST_TOKEN credential] mcp-agent requires `TEST_TOKEN` → Mitigation: Pass directly via compose environment (`TEST_TOKEN=e2e-test-token`) for testing
