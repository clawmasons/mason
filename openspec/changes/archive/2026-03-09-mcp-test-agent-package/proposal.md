## Why

The credential service, agent-entry, and proxy credential infrastructure are all implemented, but there is no end-to-end test agent that exercises the full pipeline: agent-entry bootstrap -> credential retrieval -> MCP tool listing -> tool invocation. Without a concrete test agent, we cannot verify the credential pipeline works in integration. The `mcp-test` agent provides a simple interactive CLI that proves the entire flow.

## What Changes

- Create `e2e/fixtures/test-chapter/agents/mcp-test/package.json` -- agent package declaring `credentials: ["TEST_TOKEN"]`, runtime `node`
- Create `e2e/fixtures/test-chapter/agents/mcp-test/src/index.ts` -- interactive REPL: verifies `TEST_TOKEN` received, then accepts `list`, `<tool> <json>`, and `exit` commands
- Create `e2e/fixtures/test-chapter/roles/mcp-test/package.json` -- role with `risk: "LOW"`, wildcard permissions
- Create `packages/cli/tests/integration/credential-flow.test.ts` -- integration test using SDK mode (no Docker)

### New Capabilities
- `mcp-test-agent`: Interactive CLI agent for testing the credential and MCP tool pipeline
- `mcp-test-role`: LOW risk role with wildcard permissions for testing

### Modified Capabilities
- None (entirely new packages and test)

## Impact

- New: `e2e/fixtures/test-chapter/agents/mcp-test/package.json`
- New: `e2e/fixtures/test-chapter/agents/mcp-test/src/index.ts`
- New: `e2e/fixtures/test-chapter/roles/mcp-test/package.json`
- New: `packages/cli/tests/integration/credential-flow.test.ts`
