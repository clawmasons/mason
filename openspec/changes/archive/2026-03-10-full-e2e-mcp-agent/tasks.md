## 1. Runtime Support

- [x] 1.1 Add `"mcp-agent"` case to `getBaseRuntimeConfig()` in `packages/cli/src/generator/agent-dockerfile.ts` with entrypoint `["npx", "mcp-agent"]`
- [x] 1.2 Add `"mcp-agent": "npx mcp-agent --acp"` to `ACP_RUNTIME_COMMANDS` in `packages/cli/src/materializer/common.ts`
- [x] 1.3 Register `mcpAgentMaterializer` for `"mcp-agent"` runtime in `getMaterializer()` in `packages/cli/src/cli/commands/docker-init.ts`

## 2. Bug Fix

- [x] 2.1 Change `run-agent` agent startup from `["up", agentServiceName]` to `["run", "--rm", "--service-ports", agentServiceName]` in `packages/cli/src/cli/commands/run-agent.ts`

## 3. Test Fixture

- [x] 3.1 Create `e2e/fixtures/test-chapter/agents/mcp-note-taker/package.json` with `mcp-agent` runtime, `@test/role-writer`, and `TEST_TOKEN` credential
- [x] 3.2 Create `e2e/fixtures/test-chapter/agents/mcp-note-taker/src/index.ts` delegating to `@clawmasons/mcp-agent`

## 4. E2E Test

- [x] 4.1 Add `acpx` as dev dependency in `e2e/package.json`
- [x] 4.2 Create `e2e/tests/test-note-taker-mcp.test.ts` Suite A: proxy tool pipeline (build, start proxy, MCP client tool calls)
- [x] 4.3 Create `e2e/tests/test-note-taker-mcp.test.ts` Suite B: ACP agent mode (start agent with --acp, exercise tools via HTTP POST)

## 5. Verification

- [x] 5.1 Run typecheck (`npx tsc --noEmit`) — passed
- [x] 5.2 Run linter — pre-existing error only (line 167, non-null assertion)
- [x] 5.3 Run unit tests (`npx vitest run`) — 1035 passed (fixed 2 tests affected by changes)
- [x] 5.4 Run new e2e test (`cd e2e && npx vitest run tests/test-note-taker-mcp.test.ts`) — 21/21 passed
