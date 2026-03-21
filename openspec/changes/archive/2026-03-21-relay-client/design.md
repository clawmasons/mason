## Context

The Docker proxy has a `RelayServer` (CHANGE 2) that:
- Authenticates via bearer token on WebSocket upgrade
- Accepts one connection at a time (replacing previous)
- Dispatches incoming messages to registered handlers by type
- Supports `send()` for outgoing messages and `request()` for correlated request/response
- Uses `parseRelayMessage()` from `relay/messages.ts` (CHANGE 1) for message validation

The `RelayClient` mirrors this design from the host side: it connects to `ws://<host>:<port>/ws/relay` as a WebSocket client (not server), passes the bearer token via `Authorization` header, and provides the same handler dispatch and request/response correlation interface. The symmetry between `RelayServer` and `RelayClient` means downstream consumers (credential handler, approval handler, audit writer, host MCP orchestrator) use an identical `registerHandler` / `send` / `request` API regardless of which side they run on.

## Goals / Non-Goals

**Goals:**
- `RelayClient` class with bearer token auth via WebSocket `Authorization` header
- `connect(): Promise<void>` — establishes WebSocket connection, resolves on open, rejects on auth failure or connection error
- `registerHandler(type, handler)` — type-based message dispatch (same API as `RelayServer`)
- `send(message)` — fire-and-forget outgoing messages (throws if not connected)
- `request(message, timeout?)` — correlated request/response (match by `id`, configurable timeout)
- `disconnect()` — close WebSocket cleanly
- `isConnected()` — connection state check
- Comprehensive tests using a mock WS server (reuse `RelayServer` as the test peer)
- Export from `packages/proxy/src/index.ts`

**Non-Goals:**
- Automatic reconnection with backoff (CHANGE 14 / REQ-014)
- Any message handler implementations (future changes register handlers)
- Host proxy orchestrator (CHANGE 8)
- SSL/TLS support (relay runs over localhost or Docker network)

## Decisions

### D1: Use `ws` WebSocket client (not `WebSocketServer`)

**Choice:** `new WebSocket(url, { headers: { Authorization: "Bearer <token>" } })` from the `ws` package.

**Rationale:** The `ws` package is already a dependency of the proxy package. It supports custom headers on the client side, which is how bearer token auth is passed. No additional dependencies needed.

### D2: `connect()` returns a Promise

**Choice:** `connect()` creates the WebSocket and returns a Promise that resolves on `open` and rejects on `error` (including auth rejection). This is the client-side equivalent of `handleUpgrade()` on the server.

**Rationale:** Connection is async — the caller needs to know when the connection is ready or if it failed. Promise-based API is idiomatic for async initialization.

### D3: Same message handling pattern as `RelayServer`

**Choice:** Incoming messages are: (1) JSON-parsed, (2) validated with `parseRelayMessage()`, (3) checked against `pendingRequests` by `id`, (4) dispatched to handler by `type`. Invalid messages are silently ignored.

**Rationale:** Symmetric design with `RelayServer`. Code reviewers and future maintainers see the same pattern on both sides. The handler dispatch priority (pending requests first, then type handlers) prevents response messages from being consumed by type handlers.

### D4: `send()` throws if not connected (same as `RelayServer`)

**Choice:** `send()` throws `"Relay client not connected"`. `request()` rejects immediately.

**Rationale:** Consistent with `RelayServer.send()` behavior. Callers need to know if messages can't be delivered.

### D5: `disconnect()` is synchronous (WebSocket.close() is fire-and-forget)

**Choice:** `disconnect()` calls `ws.close(1000, "Client disconnecting")` and sets `ws = null`. It doesn't wait for the close handshake.

**Rationale:** Clean shutdown doesn't need to await the close handshake. The server handles the `close` event. Pending requests are rejected on disconnect.

### D6: Pending requests rejected on disconnect

**Choice:** When `disconnect()` is called or the WebSocket closes unexpectedly, all pending `request()` promises are rejected with `"Relay client disconnected"`.

**Rationale:** Prevents promise leaks. Callers get a clear signal that the connection was lost.

## Module Structure

```
packages/proxy/src/relay/client.ts
├── RelayClientConfig { url: string; token: string; defaultTimeoutMs?: number }
├── RelayClient
│   ├── constructor(config: RelayClientConfig)
│   ├── connect(): Promise<void> — WebSocket connection with auth header
│   ├── registerHandler(type: string, handler: (msg: RelayMessage) => void)
│   ├── send(message: RelayMessage): void — send to Docker proxy
│   ├── request(message: RelayMessage, timeoutMs?: number): Promise<RelayMessage>
│   ├── disconnect(): void
│   └── isConnected(): boolean
│
│   Private:
│   ├── ws: WebSocket | null (current connection)
│   ├── handlers: Map<string, (msg: RelayMessage) => void>
│   ├── pendingRequests: Map<string, { resolve, reject, timer }>
│   ├── handleMessage(data: unknown)
│   └── rejectAllPending(reason: string)
```

## Test Coverage

```
packages/proxy/tests/relay/client.test.ts
├── Connection
│   ├── connect() resolves on successful connection with valid token
│   ├── connect() rejects on invalid token (auth failure)
│   ├── connect() rejects on connection error (server not running)
│   ├── isConnected() returns false before connect
│   ├── isConnected() returns true after connect
│   ├── isConnected() returns false after disconnect
├── Message dispatch
│   ├── incoming message dispatched to registered handler by type
│   ├── unregistered type: message ignored (no crash)
│   ├── invalid JSON from server: ignored (no crash)
│   ├── invalid message (fails parseRelayMessage): ignored
├── send()
│   ├── delivers message to server
│   ├── throws when not connected
├── request()
│   ├── sends message and resolves when correlated response arrives
│   ├── rejects after timeout
│   ├── rejects immediately when not connected
│   ├── response routed to request() even if handler registered for type
│   ├── multiple concurrent requests resolved independently
├── disconnect()
│   ├── closes WebSocket connection
│   ├── rejects pending requests
│   ├── isConnected() returns false after disconnect
│   ├── calling disconnect() when not connected is a no-op
```

Test approach: Each test spins up a temporary HTTP server + `RelayServer` as the peer. The `RelayClient` connects to it. This validates the real WS handshake and auth flow end-to-end, rather than mocking WebSocket internals.
