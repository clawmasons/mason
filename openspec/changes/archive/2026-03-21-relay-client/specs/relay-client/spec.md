# Relay Client Spec

**Module:** `packages/proxy/src/relay/client.ts`
**Test:** `packages/proxy/tests/relay/client.test.ts`

## Overview

Host-side WebSocket client for the relay protocol. Connects to the Docker proxy's `/ws/relay` endpoint with bearer token authentication, dispatches incoming messages to registered handlers by type, and supports correlated request/response with configurable timeouts. This is the mirror of `RelayServer` — they share the same handler dispatch and request/response correlation pattern.

## Exports

### `RelayClientConfig` (interface)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | `string` | (required) | WebSocket URL (e.g. `ws://localhost:9090/ws/relay`) |
| `token` | `string` | (required) | Bearer token for authentication |
| `defaultTimeoutMs` | `number?` | `30000` | Default timeout for `request()` calls |

### `RelayClient` (class)

#### `constructor(config: RelayClientConfig)`

Stores configuration. Does not connect — call `connect()` to establish the WebSocket.

#### `connect(): Promise<void>`

Creates a WebSocket to `config.url` with `Authorization: Bearer <token>` header. Returns a Promise that resolves when the connection is open, or rejects on auth failure / connection error. Sets up message, close, and error handlers on the WebSocket.

#### `registerHandler(type: string, handler: (msg: RelayMessage) => void)`

Registers a handler for a specific relay message type. Only one handler per type — later registrations replace earlier ones.

#### `send(message: RelayMessage): void`

Sends a JSON-serialized message to the Docker proxy. Throws `"Relay client not connected"` if no WebSocket is active.

#### `request(message: RelayMessage, timeoutMs?: number): Promise<RelayMessage>`

Sends a message and returns a promise that resolves when a response with the same `id` arrives. Rejects immediately if not connected. Rejects with timeout error after `timeoutMs` (or `defaultTimeoutMs`). Pending requests are checked BEFORE handler dispatch, so responses always reach `request()` callers.

#### `disconnect(): void`

Rejects all pending requests with `"Relay client disconnected"`, closes the WebSocket with code 1000, and sets the internal reference to null. No-op if not connected.

#### `isConnected(): boolean`

Returns `true` if a WebSocket is connected and in OPEN state.

## Message Flow

1. Incoming message received as WebSocket data
2. JSON parse — invalid JSON is silently ignored
3. `parseRelayMessage()` validation — invalid messages silently ignored
4. Check `pendingRequests` map by `id` — if match, resolve the promise and return
5. Dispatch to registered handler by `type` — if no handler, silently ignore

## Test Coverage (20 tests)

- Connection: connect resolves (valid token), connect rejects (invalid token), connect rejects (server not running), isConnected states
- Dispatch: handler by type, unregistered type, invalid JSON, invalid message
- send(): delivers message, throws when not connected
- request(): correlated response, timeout, not connected, priority over handlers, concurrent requests
- disconnect(): closes connection, rejects pending, isConnected false, no-op when not connected
