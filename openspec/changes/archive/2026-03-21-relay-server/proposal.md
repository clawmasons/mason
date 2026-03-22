## Why

The current Docker proxy has a single-purpose `/ws/credentials` endpoint (`CredentialRelay`) that only handles credential requests. The host-proxy PRD requires a generic relay WebSocket (`/ws/relay`) that dispatches messages by type — credentials, approvals, audit events, and host MCP tool calls all flow over a single multiplexed connection. Before the relay client, credential migration, or any other relay consumer can be built, the Docker-side relay server must exist with authentication, message dispatch, and request/response correlation.

## What Changes

- New `packages/proxy/src/relay/server.ts` — `RelayServer` class that manages a single WebSocket connection from the host proxy, authenticates with bearer token, dispatches incoming messages to registered handlers by type, and supports `request()` with correlated responses and configurable timeouts.
- Modify `packages/proxy/src/server.ts` — add `/ws/relay` upgrade path using `RelayServer` alongside the existing `/ws/credentials` (both active during migration).
- New `packages/proxy/tests/relay/server.test.ts` — auth tests, message dispatch, request/response correlation, timeout handling, reconnection.

## Capabilities

### New Capabilities
- `relay-server`: Docker-side WebSocket server that authenticates host proxy connections, dispatches incoming messages to type-based handlers, and supports correlated request/response with timeouts.

### Modified Capabilities
- `proxy-server`: Add `/ws/relay` WebSocket upgrade path alongside existing `/ws/credentials`.

## Impact

- **New file:** `packages/proxy/src/relay/server.ts`
- **Modified file:** `packages/proxy/src/server.ts` — add relay server instantiation and `/ws/relay` upgrade
- **Modified file:** `packages/proxy/src/index.ts` — export `RelayServer`
- **New test:** `packages/proxy/tests/relay/server.test.ts`
- **Dependencies:** Uses existing `ws` package (already in proxy deps)
- **Depends on:** CHANGE 1 (relay message types in `relay/messages.ts`)
- **No breaking changes** — `/ws/credentials` remains active during migration
