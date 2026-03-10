## 1. SessionStore Changes

- [x] 1.1 Add `riskLevel` property to `SessionStore` (set at construction, defaults to `"LOW"`)
- [x] 1.2 Add `agentConnectionCount` tracking to `SessionStore`
- [x] 1.3 Add `isLocked()` method: returns true if risk is HIGH/MEDIUM and agentConnectionCount > 0

## 2. Handler Changes

- [x] 2.1 Add `riskLevel` parameter to `handleConnectAgent` function signature
- [x] 2.2 Add lock check before session creation: if `store.isLocked()`, return 403
- [x] 2.3 Increment `agentConnectionCount` on successful connection

## 3. Server Integration

- [x] 3.1 Add `riskLevel` to `ChapterProxyServerConfig` interface
- [x] 3.2 Pass `riskLevel` to `SessionStore` constructor in `ChapterProxyServer`
- [x] 3.3 Pass `riskLevel` context to `handleConnectAgent` call

## 4. Tests

- [x] 4.1 SessionStore: `isLocked()` returns false for LOW risk with connections
- [x] 4.2 SessionStore: `isLocked()` returns true for HIGH risk after first connection
- [x] 4.3 SessionStore: `isLocked()` returns true for MEDIUM risk after first connection
- [x] 4.4 Handler: HIGH risk first connect → 200
- [x] 4.5 Handler: HIGH risk second connect → 403
- [x] 4.6 Handler: MEDIUM risk first connect → 200
- [x] 4.7 Handler: MEDIUM risk second connect → 403
- [x] 4.8 Handler: LOW risk first connect → 200, second connect → 200
- [x] 4.9 Handler: default (no risk level) → LOW behavior (unlimited connections)

## 5. Verification

- [x] 5.1 `npx tsc --noEmit` compiles
- [x] 5.2 `npx eslint` passes
- [x] 5.3 `npx vitest run` passes
