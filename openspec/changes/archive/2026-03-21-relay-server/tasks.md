## 1. RelayServer Class

- [x] 1.1 Create `packages/proxy/src/relay/server.ts` with `RelayServerConfig` interface and `RelayServer` class skeleton
- [x] 1.2 Implement `handleUpgrade()` — bearer token auth, WebSocket accept via `wss.handleUpgrade()`
- [x] 1.3 Implement `acceptConnection()` — close previous connection, set up message/close/error handlers
- [x] 1.4 Implement `registerHandler()` — store handler in `Map<string, handler>`
- [x] 1.5 Implement `handleMessage()` — parse with `parseRelayMessage()`, check pending requests by `id` first, then dispatch to handler by `type`
- [x] 1.6 Implement `send()` — serialize and send, throw if not connected
- [x] 1.7 Implement `request()` — send message, store pending entry with timer, resolve/reject on response or timeout
- [x] 1.8 Implement `isConnected()` and `shutdown()`

## 2. ProxyServer Integration

- [x] 2.1 Add `relayToken?: string` to `ProxyServerConfig`
- [x] 2.2 Create `RelayServer` instance in `ProxyServer` constructor when `relayToken` is set
- [x] 2.3 Add `/ws/relay` upgrade path in the `upgrade` event handler (alongside `/ws/credentials`)
- [x] 2.4 Call `RelayServer.shutdown()` in `ProxyServer.stop()`
- [x] 2.5 Add `getRelayServer()` accessor to `ProxyServer`

## 3. Exports

- [x] 3.1 Export `RelayServer` and `RelayServerConfig` from `packages/proxy/src/index.ts`

## 4. Tests

- [x] 4.1 Create `packages/proxy/tests/relay/server.test.ts`
- [x] 4.2 Test authentication: valid token accepted, invalid token rejected (401), no header rejected, non-Bearer scheme rejected
- [x] 4.3 Test connection management: isConnected states, reconnection replaces old connection
- [x] 4.4 Test message dispatch: handler called by type, unregistered type ignored, invalid JSON/message ignored
- [x] 4.5 Test send(): delivers message, throws when not connected
- [x] 4.6 Test request(): correlated response resolves, timeout rejects, not connected rejects, pending requests > handler dispatch priority, concurrent requests
- [x] 4.7 Test shutdown(): closes connection, rejects pending requests, isConnected returns false

## 5. Verification

- [x] 5.1 `npx tsc --noEmit` compiles (pre-existing unrelated error in CLI test)
- [x] 5.2 `npx vitest run packages/proxy/tests/` passes all tests (287 tests, 22 new)
