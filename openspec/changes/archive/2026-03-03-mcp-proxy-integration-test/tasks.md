## 1. Integration Test Script

- [x] 1.1 Create `tests/integration/mcp-proxy.sh` — shell script that builds forge, runs install from example dir, starts mcp-proxy via docker compose, sends MCP protocol requests via curl, and asserts correct responses
- [x] 1.2 Implement retry/backoff loop for proxy readiness (poll until responding, max 30s)
- [x] 1.3 Implement cleanup via trap handler (docker compose down on exit)
- [x] 1.4 Test tools/list response contains expected filesystem tools
- [x] 1.5 Test tools/call for list_directory executes and returns a result
- [x] 1.6 Test unauthenticated request is rejected

## 2. Validation & Fixes

- [x] 2.1 Run the integration test end-to-end and fix any issues with forge install, proxy config, or docker-compose generation
- [x] 2.2 Ensure the test passes cleanly and can be re-run idempotently
