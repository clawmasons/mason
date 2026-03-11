## Why

The ACP bridge (`packages/cli/src/acp/bridge.ts`) currently uses a bespoke HTTP relay architecture: `AcpBridge` runs an HTTP server that proxies JSON-RPC messages to the container agent's HTTP endpoint. The `StdioBridge` (`stdio-bridge.ts`) translates stdin/stdout ndjson into HTTP POSTs to this internal server. This creates two HTTP hops, requires port exposure, and implements custom hop-by-hop header stripping, content-length management, and idle timer heuristics for connection lifecycle.

The `@agentclientprotocol/sdk` provides `AgentSideConnection`, `ClientSideConnection`, and `ndJsonStream` -- protocol-compliant, stream-based ACP implementations. By rewriting the bridge to use the SDK's dual-connection architecture, we eliminate the HTTP relay entirely. The bridge presents `AgentSideConnection` to the editor (via process stdin/stdout) and `ClientSideConnection` to the container (via `docker compose run` piped stdio).

## What Changes

- Rewrite `packages/cli/src/acp/bridge.ts`:
  - Replace `AcpBridge` class with `AcpSdkBridge` class
  - Create `AgentSideConnection` with `ndJsonStream()` for editor-facing transport
  - Implement `Agent` interface: `initialize` responds locally, `newSession` triggers container start via callback, creates `ClientSideConnection` for container communication
  - Forward `prompt` and other methods bidirectionally via `ClientSideConnection`
  - Use `connection.signal` / `connection.closed` for lifecycle detection
  - Forward notifications bidirectionally
  - Handle container process crash: detect child exit/error, clean up `ClientSideConnection`
- Remove `packages/cli/src/acp/stdio-bridge.ts` (replaced by SDK's `ndJsonStream`)
- Remove `AcpBridgeConfig`, `parseRequestBody`, `extractCwdFromBody` (no longer needed)
- Rewrite `packages/cli/tests/acp/bridge.test.ts` with SDK stream-based tests

## Capabilities

### New Capabilities
- `acp-sdk-bridge`: Bridge using `AgentSideConnection` + `ClientSideConnection` from the SDK, with deferred startup, bidirectional forwarding, and crash recovery

### Modified Capabilities
- `acp-bridge`: Completely rewritten from HTTP relay to SDK dual-connection architecture

### Removed Capabilities
- `acp-stdio-bridge`: `StdioBridge` class removed -- replaced by SDK's `ndJsonStream` on process stdio
- `acp-bridge-http`: HTTP server, health endpoint, hop-by-hop header relay, idle timer all removed
- `parseRequestBody` / `extractCwdFromBody`: Helper functions removed (no longer parsing raw HTTP bodies)

## Impact

- **Rewritten file:** `packages/cli/src/acp/bridge.ts` -- AcpSdkBridge with dual SDK connections
- **Removed file:** `packages/cli/src/acp/stdio-bridge.ts` -- StdioBridge class
- **Rewritten test:** `packages/cli/tests/acp/bridge.test.ts` -- SDK stream-based tests
- **Downstream:** `packages/cli/src/cli/commands/run-acp-agent.ts` imports `AcpBridge`/`AcpBridgeConfig`/`StdioBridge` from these files (updated in Change 4)
