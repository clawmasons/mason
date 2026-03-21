## Context

The Docker proxy currently uses `CredentialRelay` (in `handlers/credential-relay.ts`) — a single-purpose WebSocket server that:
- Authenticates via bearer token
- Accepts one connection at a time (replacing previous)
- Forwards credential requests and awaits correlated responses by `id`
- Has configurable timeouts on pending requests

The new `RelayServer` generalizes this pattern: same auth model, same single-connection approach, but with type-based message dispatch and support for any relay message type (defined in CHANGE 1's `relay/messages.ts`).

The existing `CredentialRelay` is NOT deleted in this change — both `/ws/credentials` and `/ws/relay` are active during migration. `CredentialRelay` is deleted in CHANGE 5 when credential requests are wired through the relay.

## Goals / Non-Goals

**Goals:**
- `RelayServer` class with bearer token authentication on WebSocket upgrade
- Single-connection model: new connections replace the previous one
- Type-based message dispatch via `registerHandler(type, handler)`
- `send(message)` for fire-and-forget outgoing messages
- `request(message, timeout?)` for correlated request/response (match by `id`)
- Configurable default timeout for `request()`, overridable per call
- `isConnected()` and `shutdown()` lifecycle methods
- Integration with `ProxyServer` via `/ws/relay` upgrade path
- Comprehensive tests for auth, dispatch, correlation, timeouts, reconnection

**Non-Goals:**
- Relay client (CHANGE 3)
- Credential request routing through relay (CHANGE 5)
- Deletion of `CredentialRelay` or `/ws/credentials` (CHANGE 5)
- Any message handler implementations (future changes register handlers)

## Decisions

### D1: Reuse `ws` WebSocketServer with `noServer: true`

**Choice:** Same pattern as `CredentialRelay` — create `WebSocketServer({ noServer: true })` and handle upgrades manually.

**Rationale:** This is the established pattern in the codebase. The relay server doesn't own the HTTP server; `ProxyServer` routes upgrades to it by path.

### D2: Parse incoming messages with `parseRelayMessage()`

**Choice:** All incoming WebSocket messages are parsed through `parseRelayMessage()` from CHANGE 1. Invalid messages are logged and ignored.

**Rationale:** Centralizes validation. Handlers receive typed, validated messages. Unknown or malformed messages don't crash the server.

### D3: Response correlation via pending request map

**Choice:** `request()` stores a `{ resolve, reject, timer }` entry keyed by message `id`. When an incoming message's `id` matches a pending entry, it resolves the promise and clears the timer. If no handler matches but a pending request does, the response is routed to `request()`.

**Rationale:** Same pattern as `CredentialRelay.pendingRequests` but generalized. Responses are checked against the pending map BEFORE handler dispatch — this ensures correlated responses always reach the `request()` caller.

### D4: Handler dispatch order — pending requests first, then handlers

**Choice:** On incoming message: (1) check pending requests by `id`, (2) if no pending match, dispatch to registered handler by `type`.

**Rationale:** A response to `request()` should always resolve the promise, even if a handler is also registered for that type. This prevents handlers from consuming responses meant for `request()` callers.

### D5: `RelayServer` config uses `token` (not `credentialProxyToken`)

**Choice:** Config field is `token: string` — generic naming for the relay.

**Rationale:** The relay serves all message types, not just credentials. The environment variable is `RELAY_TOKEN` per PRD. The old `credentialProxyToken` naming stays with `CredentialRelay`.

### D6: `send()` throws if not connected

**Choice:** `send()` throws an error if no WebSocket is connected. `request()` also rejects immediately if not connected.

**Rationale:** Callers need to know if messages can't be delivered. Silent drops would cause hard-to-debug issues. The caller can check `isConnected()` first if they want to handle gracefully.

## Module Structure

```
packages/proxy/src/relay/server.ts
├── RelayServerConfig { token: string; defaultTimeoutMs?: number }
├── RelayServer
│   ├── constructor(config: RelayServerConfig)
│   ├── handleUpgrade(req, socket, head) — bearer token auth, WS accept
│   ├── registerHandler(type: string, handler: (msg: RelayMessage) => void)
│   ├── send(message: RelayMessage): void — send to connected client
│   ├── request(message: RelayMessage, timeoutMs?: number): Promise<RelayMessage>
│   ├── isConnected(): boolean
│   └── shutdown(): void
│
│   Private:
│   ├── wss: WebSocketServer (noServer: true)
│   ├── ws: WebSocket | null (current connection)
│   ├── handlers: Map<string, (msg: RelayMessage) => void>
│   ├── pendingRequests: Map<string, { resolve, reject, timer }>
│   ├── acceptConnection(ws: WebSocket)
│   └── handleMessage(data: unknown)
```

## Integration with ProxyServer

In `packages/proxy/src/server.ts`:
- Add optional `relayToken?: string` to `ProxyServerConfig` (separate from `credentialProxyToken`)
- If `relayToken` is set, create a `RelayServer` instance
- In the `upgrade` event handler, route `/ws/relay` to `RelayServer.handleUpgrade()`
- Keep `/ws/credentials` routing to `CredentialRelay` (both active)
- On `stop()`, call `RelayServer.shutdown()` if it exists
- Expose `getRelayServer()` accessor for future changes to register handlers

## Test Coverage

```
packages/proxy/tests/relay/server.test.ts
├── Authentication
│   ├── accepts WebSocket with valid bearer token
│   ├── rejects WebSocket with invalid bearer token (401)
│   ├── rejects WebSocket with no authorization header (401)
│   ├── rejects WebSocket with non-Bearer scheme (401)
├── Connection management
│   ├── isConnected() returns false initially
│   ├── isConnected() returns true after connection
│   ├── isConnected() returns false after disconnect
│   ├── new connection replaces previous (old connection closed)
├── Message dispatch
│   ├── incoming message dispatched to registered handler by type
│   ├── unregistered type: message ignored (no crash)
│   ├── invalid JSON: ignored (no crash)
│   ├── invalid message (fails parseRelayMessage): ignored
├── send()
│   ├── delivers message to connected client
│   ├── throws when not connected
├── request()
│   ├── sends message and resolves when correlated response arrives
│   ├── rejects after timeout
│   ├── rejects immediately when not connected
│   ├── response routed to request() even if handler registered for type
│   ├── multiple concurrent requests resolved independently
├── shutdown()
│   ├── closes WebSocket connection
│   ├── rejects pending requests
│   ├── isConnected() returns false after shutdown
```
