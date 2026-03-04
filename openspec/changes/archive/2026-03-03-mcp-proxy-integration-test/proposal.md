## Why

After installing the example agent with `pam install`, the MCP proxy does not work correctly when started via Docker. There is no integration test that validates the full pipeline: install → docker compose up → proxy responds to MCP protocol requests. Without this, regressions in proxy config generation, docker-compose generation, or environment setup go undetected until a user tries to run an agent.

## What Changes

- Add an MCP proxy integration test that:
  1. Runs `pam install @example/agent-note-taker` against the example workspace
  2. Starts the mcp-proxy service via `docker compose up`
  3. Sends MCP protocol requests (tools/list, tools/call) to the proxy endpoint using HTTP/curl
  4. Verifies the proxy responds correctly with expected tools and results
  5. Loops/retries until the proxy is healthy, simulating what an agent client would do
  6. Tears down the docker stack on completion
- Fix any issues discovered during integration test development

## Capabilities

### New Capabilities
- `mcp-proxy-integration-test`: End-to-end integration test validating the full pam install → docker mcp-proxy → MCP protocol request cycle

### Modified Capabilities

## Impact

- **Code**: New integration test file(s) in `tests/integration/` or similar
- **Dependencies**: Requires Docker to be available in the test environment
- **Systems**: Uses Docker Compose to spin up mcp-proxy container during tests
