# Relay Server Spec

**Module:** `packages/proxy/src/relay/server.ts`
**Test:** `packages/proxy/tests/relay/server.test.ts`

## Overview

Docker-side WebSocket server for the relay protocol. Accepts a single connection from the host proxy at `/ws/relay`, authenticates with bearer token, dispatches incoming messages to registered handlers by type, and supports correlated request/response with configurable timeouts.

## Exports

### `RelayServerConfig` (interface)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `token` | `string` | (required) | Bearer token for authentication |
| `defaultTimeoutMs` | `number?` | `30000` | Default timeout for `request()` calls |

### `RelayServer` (class)

#### `constructor(config: RelayServerConfig)`

Creates a relay server with a `WebSocketServer({ noServer: true })`. Does not listen on any port — the HTTP server routes upgrades to `handleUpgrade()`.

#### `handleUpgrade(req, socket, head)`

Authenticates the WebSocket upgrade request using bearer token from the `Authorization` header. Rejects with HTTP 401 if missing, wrong scheme, or wrong token. On success, accepts the WebSocket and calls `acceptConnection()`.

#### `registerHandler(type: string, handler: (msg: RelayMessage) => void)`

Registers a handler for a specific relay message type. Only one handler per type — later registrations replace earlier ones.

#### `send(message: RelayMessage): void`

Sends a JSON-serialized message to the connected host proxy. Throws `"Relay not connected"` if no WebSocket is active.

#### `request(message: RelayMessage, timeoutMs?: number): Promise<RelayMessage>`

Sends a message and returns a promise that resolves when a response with the same `id` arrives. Rejects immediately if not connected. Rejects with timeout error after `timeoutMs` (or `defaultTimeoutMs`). Pending requests are checked BEFORE handler dispatch, so responses always reach `request()` callers.

#### `isConnected(): boolean`

Returns `true` if a WebSocket is connected and in OPEN state.

#### `shutdown(): void`

Rejects all pending requests with `"Relay shutting down"`, closes the WebSocket connection, and closes the underlying `WebSocketServer`.

## Message Flow

1. Incoming message received as WebSocket data
2. JSON parse — invalid JSON is silently ignored
3. `parseRelayMessage()` validation — invalid messages silently ignored
4. Check `pendingRequests` map by `id` — if match, resolve the promise and return
5. Dispatch to registered handler by `type` — if no handler, silently ignore

## Integration with ProxyServer

- `ProxyServerConfig` has `relayToken?: string`
- If `relayToken` is set, `ProxyServer` creates a `RelayServer` instance
- The HTTP `upgrade` event routes `/ws/relay` to `RelayServer.handleUpgrade()` and `/ws/credentials` to `CredentialRelay.handleUpgrade()` (both active during migration)
- `ProxyServer.stop()` calls `RelayServer.shutdown()`
- `ProxyServer.getRelayServer()` returns the instance for external handler registration

## Test Coverage (22 tests)

- Authentication: valid token, invalid token, no header, non-Bearer scheme
- Connection: initial state, connected state, disconnect, reconnection replaces old
- Dispatch: handler by type, unregistered type, invalid JSON, invalid message
- send(): delivers message, throws when not connected
- request(): correlated response, timeout, not connected, priority over handlers, concurrent requests
- shutdown(): closes connection, rejects pending, isConnected false
