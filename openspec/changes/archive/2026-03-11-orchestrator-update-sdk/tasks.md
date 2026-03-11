## 1. Update imports and types in run-acp-agent.ts

- [x] 1.1 Replace `AcpBridge, AcpBridgeConfig` import with `AcpSdkBridge, AcpSdkBridgeConfig`
- [x] 1.2 Remove `StdioBridge` import
- [x] 1.3 Add `Readable, Writable` import from `node:stream`
- [x] 1.4 Remove `port` and `transport` from `RunAcpAgentOptions`
- [x] 1.5 Update `createBridgeFn` in `RunAcpAgentDeps` to use `AcpSdkBridgeConfig` / `AcpSdkBridge`

## 2. Update commander registration

- [x] 2.1 Remove `--port` option
- [x] 2.2 Remove `--transport` option
- [x] 2.3 Remove `port` and `transport` from action handler parsing

## 3. Update main orchestrator function

- [x] 3.1 Remove `port`, `acpAgentPort`, `transport` variables
- [x] 3.2 Remove `stdioBridge` variable
- [x] 3.3 Remove `"--port", String(acpAgentPort)` from `acpCommand` construction
- [x] 3.4 Remove `acpPort` from session config
- [x] 3.5 Replace bridge creation: use `AcpSdkBridge` with `onSessionNew` callback
- [x] 3.6 In `onSessionNew` callback: create `.clawmasons/`, ensure `.gitignore`, call `session.startAgentProcess(cwd)`, return child process
- [x] 3.7 Remove `bridge.onClientConnect`, `onClientDisconnect`, `onAgentError`, `onSessionNew` assignments
- [x] 3.8 Replace `bridge.start()` with `bridge.start(editorInput, editorOutput)` using Web Streams from process stdin/stdout
- [x] 3.9 Remove Step 8 (stdio transport layer / `StdioBridge` creation)
- [x] 3.10 Use `await bridge.closed` to keep process alive
- [x] 3.11 Simplify ready message (remove transport-specific info)
- [x] 3.12 Update shutdown handler: remove `stdioBridge.stop()`, keep `bridge.stop()` and `session.stop()`
- [x] 3.13 Update error cleanup: remove `stdioBridge` cleanup
- [x] 3.14 Fix pre-existing lint errors: replace non-null assertions with local variable capture

## 4. Update help text

- [x] 4.1 Remove "Transport Modes" section from `RUN_ACP_AGENT_HELP_EPILOG`
- [x] 4.2 Remove HTTP transport example from ACP Client Configuration
- [x] 4.3 Update log file documentation (remove "regardless of transport mode")

## 5. Update tests

- [x] 5.1 Update imports: remove `AcpBridge`/`AcpBridgeConfig` type imports, add `AcpSdkBridge`/`AcpSdkBridgeConfig`
- [x] 5.2 Update `MockBridgeType` to match `AcpSdkBridge` API (start, stop, closed)
- [x] 5.3 Update `makeMockBridge()` to return SDK-compatible mock with `closed` promise
- [x] 5.4 Update `makeMockSession()` to include `startAgentProcess` mock
- [x] 5.5 Update `makeDeps()` to use new `createBridgeFn` signature and capture config
- [x] 5.6 Remove test "starts the bridge on the configured port" (no port config)
- [x] 5.7 Remove test "uses default port 3001 when not specified" (no port)
- [x] 5.8 Replace "logs ready message with port info" with "logs ready message with deferred mode" (no port)
- [x] 5.9 Replace "starts bridge but does NOT connect to agent" with "starts bridge on startup" (no `connectToAgent`)
- [x] 5.10 Remove `onClientConnect`, `onClientDisconnect`, `onAgentError`, `onSessionNew` callback tests
- [x] 5.11 Add test "creates bridge with onSessionNew callback" verifying config
- [x] 5.12 Update "onSessionNew callback starts agent and connects bridge" to test `startAgentProcess` and child return
- [x] 5.13 Remove "onClientDisconnect stops agent" test (bridge handles internally)
- [x] 5.14 Add test "does not pass acpPort to session config"
- [x] 5.15 Add test "constructs acpCommand without --port"
- [x] 5.16 Add tests "rejects --transport as unknown option" and "rejects --port as unknown option"
- [x] 5.17 Add tests for help text: no --transport, no --port, no HTTP references

## 6. Verify

- [x] 6.1 TypeScript compilation passes (only pre-existing session.test.ts pid error remains)
- [x] 6.2 Linting passes for changed files
- [x] 6.3 All 66 orchestrator tests pass
- [x] 6.4 All 800 CLI tests pass across 41 files
- [x] 6.5 No remaining references to `StdioBridge`, `AcpBridge`, `--transport`, `containerHost`, `containerPort`, `connectRetries`, `acpAgentPort` in run-acp-agent.ts
