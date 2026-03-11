## Why

The orchestrator (`run-acp-agent.ts`) still uses the old HTTP-based bridge architecture: it imports `AcpBridge` and `StdioBridge`, creates an HTTP bridge server, connects to the container agent via HTTP health checks, and exposes `--transport` and `--port` CLI options. Changes 1-3 replaced the container agent, session module, and bridge with SDK-based implementations. The orchestrator must be updated to wire the new `AcpSdkBridge` from `bridge.ts` and remove all HTTP transport vestiges.

## What Changes

- `packages/cli/src/cli/commands/run-acp-agent.ts`:
  - Remove `--transport` and `--port` CLI options from commander registration
  - Remove `StdioBridge` import and usage (file already deleted in Change 3)
  - Replace `AcpBridge` / `AcpBridgeConfig` imports with `AcpSdkBridge` / `AcpSdkBridgeConfig`
  - Remove `acpAgentPort` constant and port-related logic
  - Remove `"--port", String(acpAgentPort)` from `acpCommand` construction
  - Wire `AcpSdkBridge` with `onSessionNew` callback that calls `session.startAgentProcess(cwd)` and returns the child process
  - Remove `containerHost` / `containerPort` / `connectRetries` / `bridgePort` configuration
  - Remove `bridge.connectToAgent()` call
  - Simplify shutdown: no `stdioBridge.stop()`, no HTTP server close
  - Start bridge with process stdin/stdout Web Streams
  - Keep process alive via `bridge.closed` promise instead of HTTP server
  - Remove `transport` from ready message logic
- Update `RunAcpAgentOptions`: remove `port`, `transport` fields
- Update `RunAcpAgentDeps`: replace `createBridgeFn` signature for `AcpSdkBridge`
- Remove `RUN_ACP_AGENT_HELP_EPILOG` references to `--transport http` and HTTP examples
- `packages/cli/tests/cli/run-acp-agent.test.ts`:
  - Remove tests referencing `--transport`, `--port`, `StdioBridge`, `AcpBridge`
  - Update mock bridge to match `AcpSdkBridge` API
  - Update `acpCommand` assertions to verify no `--port` arg
  - Update bridge wiring tests for SDK bridge

## Capabilities

### Modified Capabilities
- `acp-orchestrator`: Uses `AcpSdkBridge` with `onSessionNew` callback, stdio-only transport

### Removed Capabilities
- `--transport` CLI option: stdio is now the only transport mode
- `--port` CLI option: no HTTP bridge port
- `StdioBridge` usage: replaced by SDK bridge's native ndjson on process stdio
- HTTP bridge internals: `containerHost`, `containerPort`, `connectRetries`, `bridgePort`

## Impact

- **Modified file:** `packages/cli/src/cli/commands/run-acp-agent.ts` -- orchestrator wiring
- **Modified test:** `packages/cli/tests/cli/run-acp-agent.test.ts` -- updated for SDK bridge
- **PRD refs:** REQ-SDK-006
