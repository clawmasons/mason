## 1. RelayClient Class

- [x] 1.1 Create `packages/proxy/src/relay/client.ts` with `RelayClientConfig` interface and `RelayClient` class skeleton
- [x] 1.2 Implement `connect()` — create WebSocket with bearer token auth header, return Promise that resolves on open, rejects on error
- [x] 1.3 Implement `registerHandler()` — store handler in `Map<string, handler>`
- [x] 1.4 Implement `handleMessage()` — parse with `parseRelayMessage()`, check pending requests by `id` first, then dispatch to handler by `type`
- [x] 1.5 Implement `send()` — serialize and send, throw if not connected
- [x] 1.6 Implement `request()` — send message, store pending entry with timer, resolve/reject on response or timeout
- [x] 1.7 Implement `disconnect()` — close WebSocket, reject all pending requests, set ws to null
- [x] 1.8 Implement `isConnected()` — check ws exists and readyState is OPEN
- [x] 1.9 Implement `rejectAllPending()` — helper to reject all pending requests with a reason

## 2. Exports

- [x] 2.1 Export `RelayClient` and `RelayClientConfig` from `packages/proxy/src/index.ts`

## 3. Tests

- [x] 3.1 Create `packages/proxy/tests/relay/client.test.ts` with test helpers (mock server setup/teardown, port management)
- [x] 3.2 Test connection: connect resolves with valid token, rejects with invalid token, rejects when server not running
- [x] 3.3 Test isConnected: false before connect, true after connect, false after disconnect
- [x] 3.4 Test message dispatch: handler called by type, unregistered type ignored, invalid JSON ignored, invalid message ignored
- [x] 3.5 Test send(): delivers message to server, throws when not connected
- [x] 3.6 Test request(): correlated response resolves, timeout rejects, not connected rejects, priority over handlers, concurrent requests
- [x] 3.7 Test disconnect(): closes connection, rejects pending, isConnected false, no-op when not connected

## 4. Verification

- [x] 4.1 `npx tsc --noEmit` compiles (pre-existing unrelated error in CLI test)
- [x] 4.2 `npx vitest run packages/proxy/tests/` passes all tests (308 tests, 21 new)
