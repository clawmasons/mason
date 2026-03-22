## Why

The Docker proxy has a `RelayServer` (CHANGE 2) that accepts a WebSocket connection from the host proxy at `/ws/relay`. But nothing on the host side connects to it yet. The host-proxy PRD requires a `RelayClient` — the mirror of `RelayServer` — that runs on the host machine, connects to the Docker proxy's `/ws/relay` endpoint with bearer token auth, parses incoming messages, and dispatches them to registered handlers. Without the relay client, none of the host-side functionality (credential resolution, approvals, audit writing, host MCP servers) can receive messages from the Docker proxy. This is a prerequisite for CHANGE 4 (credential service migration), CHANGE 5 (credential requests via relay), CHANGE 7 (approvals), and CHANGE 8 (host proxy orchestrator).

## What Changes

- New `packages/proxy/src/relay/client.ts` — `RelayClient` class that connects to the Docker proxy's `/ws/relay` WebSocket endpoint with bearer token auth, dispatches incoming messages to registered handlers by type, supports `send()` for fire-and-forget messages, and `request()` for correlated request/response with configurable timeouts.
- New `packages/proxy/tests/relay/client.test.ts` — connection, auth rejection, message dispatch, send, request/response correlation, timeout, disconnect.
- Modified `packages/proxy/src/index.ts` — export `RelayClient` and `RelayClientConfig`.

## Capabilities

### New Capabilities
- `relay-client`: Host-side WebSocket client that connects to the Docker proxy's relay server, dispatches incoming messages to type-based handlers, and supports correlated request/response with timeouts.

### Modified Capabilities
- None. This is a standalone new module.

## Impact

- **New file:** `packages/proxy/src/relay/client.ts`
- **New test:** `packages/proxy/tests/relay/client.test.ts`
- **Modified file:** `packages/proxy/src/index.ts` — export `RelayClient`
- **Dependencies:** Uses existing `ws` package (already in proxy deps)
- **Depends on:** CHANGE 1 (relay message types), CHANGE 2 (relay server for testing)
- **No breaking changes** — purely additive
