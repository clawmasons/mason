## 1. Add SDK dependency

- [x] 1.1 Add `@agentclientprotocol/sdk` to `packages/mcp-agent/package.json` dependencies
- [x] 1.2 Run `npm install` to update lockfile

## 2. Create ACP Agent implementation

- [x] 2.1 Create `packages/mcp-agent/src/acp-agent.ts` with `AcpAgent` class implementing the SDK `Agent` interface
- [x] 2.2 Implement `initialize` handler returning protocol version and agent info
- [x] 2.3 Implement `newSession` handler that triggers credential resolution + proxy connection via `onSessionSetup` callback, returns session ID
- [x] 2.4 Implement `prompt` handler that lists tools via `ToolCaller` and returns them as a session update + `end_turn` response
- [x] 2.5 Implement `cancel` handler (no-op for now since prompt handler is synchronous)
- [x] 2.6 Implement `authenticate` handler (returns empty object)
- [x] 2.7 Export `createAcpAgentFactory` for use with `AgentSideConnection` constructor

## 3. Modify index.ts for ACP mode

- [x] 3.1 Add stdout protection: redirect `console.log` to `console.error` when `--acp` is specified (REQ-SDK-012)
- [x] 3.2 Remove `--port` flag from `CliArgs` interface and `parseArgs` function (REQ-SDK-008)
- [x] 3.3 Replace `startAcpServer()` call with `AgentSideConnection` + `ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin))`
- [x] 3.4 Remove `acp-server.ts` import
- [x] 3.5 Update shutdown handler for ACP mode (no HTTP server to close)
- [x] 3.6 Changed all `console.log` calls in ACP-reachable code paths to `console.error`
- [x] 3.7 Deferred credential/proxy setup moved to `onSessionSetup` callback (called from `newSession`)
- [x] 3.8 Keep process alive via `await connection.closed`

## 4. Remove acp-server.ts

- [x] 4.1 Delete `packages/mcp-agent/src/acp-server.ts`

## 5. Tests

- [x] 5.1 Create `packages/mcp-agent/tests/acp-agent.test.ts` unit test for the `AcpAgent` class (10 tests)
- [x] 5.2 Test `initialize` returns correct protocol version and agent info
- [x] 5.3 Test `newSession` returns a session ID (32-char hex string)
- [x] 5.4 Test `newSession` calls `onSessionSetup` when provided
- [x] 5.5 Test `newSession` generates unique session IDs
- [x] 5.6 Test `prompt` returns tool list as end_turn response with session update
- [x] 5.7 Test `prompt` handles empty tool list
- [x] 5.8 Test `cancel` does not throw
- [x] 5.9 Test `authenticate` returns empty object
- [x] 5.10 Test `createAcpAgentFactory` returns valid factory function

## 6. Verify

- [x] 6.1 TypeScript compilation passes (`npx tsc --noEmit`)
- [x] 6.2 All 1139 tests pass across 60 test files (`npx vitest run`)
- [x] 6.3 No remaining references to `acp-server.ts`, `startAcpServer`, or `--port` in mcp-agent package
