## 1. Add SDK dependency to cli package

- [x] 1.1 Add `@agentclientprotocol/sdk` to `packages/cli/package.json` dependencies
- [x] 1.2 Run `npm install` to update lockfile

## 2. Rewrite bridge.ts

- [x] 2.1 Remove all HTTP-related imports and code (`createServer`, `httpRequest`, `IncomingMessage`, `ServerResponse`)
- [x] 2.2 Remove `AcpBridgeConfig` interface and `AcpBridge` class
- [x] 2.3 Remove `parseRequestBody` and `extractCwdFromBody` functions
- [x] 2.4 Remove `HOP_BY_HOP_HEADERS`, `respondWithStub`, `delay` helpers
- [x] 2.5 Create `AcpSdkBridgeConfig` interface with `onSessionNew` callback and `logger`
- [x] 2.6 Create `AcpSdkBridge` class with constructor accepting config
- [x] 2.7 Implement `start(editorInput, editorOutput)` that creates `AgentSideConnection` with `ndJsonStream`
- [x] 2.8 Implement `Agent.initialize` handler returning local capabilities without starting container
- [x] 2.9 Implement `Agent.newSession` handler: call `onSessionNew(cwd)`, create `ClientSideConnection`, forward `initialize` + `session/new`, return response
- [x] 2.10 Implement `Agent.prompt` handler: forward to container `ClientSideConnection`, return response
- [x] 2.11 Implement `Agent.cancel` handler: forward cancel notification to container
- [x] 2.12 Implement `Agent.authenticate` handler: forward to container if connected
- [x] 2.13 Set up bidirectional notification forwarding (container -> editor, editor -> container)
- [x] 2.14 Implement container crash detection: listen for child `exit`/`error`, `ClientSideConnection.closed`
- [x] 2.15 Implement `stop()` method: kill child process, clean up connections
- [x] 2.16 Implement `closed` getter: returns editor connection's closed promise
- [x] 2.17 Store `initializeParams` from editor's `initialize` call for forwarding to container
- [x] 2.18 Forward all Client interface methods (requestPermission, readTextFile, writeTextFile, createTerminal, terminal operations)

## 3. Remove stdio-bridge.ts

- [x] 3.1 Delete `packages/cli/src/acp/stdio-bridge.ts`

## 4. Rewrite bridge.test.ts

- [x] 4.1 Remove all HTTP-based test helpers (`createMockAgent`, `closeServer`, `httpGet`, `httpPost`)
- [x] 4.2 Remove `parseRequestBody` and `extractCwdFromBody` test suites
- [x] 4.3 Create mock stream helpers for testing (TransformStream pairs, mock ChildProcess)
- [x] 4.4 Test `initialize` returns capabilities without starting container
- [x] 4.5 Test `session/new` triggers `onSessionNew` callback with correct cwd
- [x] 4.6 Test `session/new` creates `ClientSideConnection` and forwards `initialize` + `session/new`
- [x] 4.7 Test `prompt` forwarding and response
- [x] 4.8 Test prompt without session throws error
- [x] 4.9 Test container crash detection and recovery (child exit triggers cleanup, new session works)
- [x] 4.10 Test notification forwarding: container -> editor (`sessionUpdate`)
- [x] 4.11 Test connection lifecycle (`closed` resolves when editor disconnects)
- [x] 4.12 Test `stop()` kills child process and cleans up
- [x] 4.13 Test `stop()` is idempotent

## 5. Verify

- [x] 5.1 TypeScript compilation passes for bridge module (only errors are in run-acp-agent.ts from old imports, expected for Change 4)
- [x] 5.2 Bridge tests pass: 9 tests in `packages/cli/tests/acp/bridge.test.ts`
- [x] 5.3 All 97 ACP module tests pass across 5 files
- [x] 5.4 No remaining references to `AcpBridge`, `StdioBridge`, `parseRequestBody`, `extractCwdFromBody` in bridge.ts

## Known Expected Failures

The following test suites fail because `run-acp-agent.ts` still imports removed `StdioBridge` and `AcpBridge`. These will be fixed in Change 4 (Orchestrator Update):
- `packages/cli/tests/cli/run-acp-agent.test.ts`
- All other CLI command test files (they share a module graph with `run-acp-agent.ts`)
