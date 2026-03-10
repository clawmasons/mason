# Tasks: End-to-End ACP Integration Test

**Date:** 2026-03-10
**Change:** #11

## Tasks

- [x] Create `e2e/tests/acp-proxy.test.ts` with test infrastructure (fixture copy, pack, docker-init)
- [x] Add ACP unit integration tests: matcher + rewriter + warnings working together
- [x] Add proxy Docker test with ACP session metadata env vars
- [x] Add MCP client connection test with tool listing through ACP-configured proxy
- [x] Add tool call test verifying governed pipeline works end-to-end
- [x] Add dropped server audit logging tests using `logDroppedServers`
- [x] Add auth enforcement tests (reject no-token, wrong-token)
- [x] Verify all tests pass (16/16)
