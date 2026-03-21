## 1. HostProxy Class — Core Implementation

- [x] 1.1 Create `packages/proxy/src/host-proxy.ts` with `HostProxyConfig` interface and `HostProxy` class
- [x] 1.2 Implement `start()` — create all services, wire handlers, connect relay
- [x] 1.3 Implement `stop()` — disconnect relay, close services, null references (idempotent)
- [x] 1.4 Implement `isConnected()` — delegate to relay client

## 2. Exports — Update Index

- [x] 2.1 Modify `packages/proxy/src/index.ts` — add `HostProxy` and `HostProxyConfig` exports

## 3. Tests — Lifecycle and Handler Wiring

- [x] 3.1 Create `packages/proxy/tests/host-proxy.test.ts` with mock WS server
- [x] 3.2 Lifecycle tests: start connects, stop disconnects, stop is idempotent, isConnected reflects state
- [x] 3.3 Handler registration tests: credential_request handled, approval_request handled (mock dialog), audit_event written
- [x] 3.4 Shutdown cleanup tests: all services closed after stop

## 4. Verification

- [x] 4.1 Run `npx tsc --noEmit` — compiles without errors
- [x] 4.2 Run `npx vitest run packages/proxy/tests/` — all tests pass
