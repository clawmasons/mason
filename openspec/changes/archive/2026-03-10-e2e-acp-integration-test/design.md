# Design: End-to-End ACP Integration Test

**Date:** 2026-03-10
**Change:** #11

## Architecture

The E2E test validates the full ACP proxy pipeline at the integration level, using the real proxy Docker container with audit logging, and programmatic MCP client connections. The test follows the same infrastructure pattern as `docker-init-full.test.ts`.

### Test Strategy

Rather than spinning up the full three-container ACP session (which requires the agent to be running in ACP mode inside Docker), we test the ACP pipeline at the component integration level:

1. **Unit integration tests** (in `packages/cli/tests/acp/`): Test the ACP modules (matcher, rewriter, warnings) working together with realistic fixtures
2. **Proxy integration test** (new `e2e/tests/acp-proxy.test.ts`): Test the proxy container with ACP session metadata (session_type, acp_client), audit logging of ACP-specific entries, and dropped server logging

### Test Flow

```
1. Copy fixture workspace to temp dir
2. Pack & docker-init
3. Generate docker-compose with ACP session env vars
4. Build & start proxy container
5. Connect MCP client with auth token
6. List tools -> verify governed tools available
7. Call a tool -> verify it executes
8. Verify audit log has ACP session metadata
9. Verify dropped server audit entries
10. Tear down
```

### ACP-Specific Test Scenarios

1. **Proxy with ACP session metadata**: Proxy container gets `CHAPTER_SESSION_TYPE=acp` and `CHAPTER_ACP_CLIENT=test-client` env vars. Verify these flow through to audit log entries.

2. **MCP server matching**: Programmatic test using matcher + rewriter + warnings together with the test fixture's apps.

3. **Dropped server audit logging**: Use the audit hook's `logDroppedServers` with an in-memory DB and verify entries.

4. **Tool call through governed proxy**: Connect MCP client, call a tool, verify audit entry has `session_type: "acp"`.

5. **Auth enforcement**: Verify unauthorized requests are rejected (same as existing test).

6. **Graceful proxy behavior**: Health endpoint responds, tools list works, tool calls succeed.

## Files

| File | Purpose |
|------|---------|
| `e2e/tests/acp-proxy.test.ts` | Main E2E integration test |

## Dependencies

- Existing fixture: `e2e/fixtures/test-chapter/` (mcp-test agent, filesystem app, mcp-test role)
- Existing infrastructure: `docker-init-full.test.ts` patterns (copyDirRecursive, chapter pack, docker-init)
- ACP modules: matcher, rewriter, warnings (for unit integration scenarios)
- Proxy: db.ts, hooks/audit.ts (for audit verification)
