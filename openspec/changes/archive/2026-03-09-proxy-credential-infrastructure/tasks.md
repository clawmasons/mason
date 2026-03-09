## 1. Dependencies

- [x] 1.1 Add `ws` dependency to `packages/proxy/package.json`
- [x] 1.2 Run `npm install` to link the dependency

## 2. Connect-Agent Handler

- [x] 2.1 Create `packages/proxy/src/handlers/connect-agent.ts` with `SessionStore` class and `handleConnectAgent` function
- [x] 2.2 Create `packages/proxy/tests/handlers/connect-agent.test.ts` with unit tests

## 3. Credential Relay Handler

- [x] 3.1 Create `packages/proxy/src/handlers/credential-relay.ts` with `CredentialRelay` class
- [x] 3.2 Create `packages/proxy/tests/handlers/credential-relay.test.ts` with unit tests

## 4. Server Integration

- [x] 4.1 Modify `packages/proxy/src/server.ts` to wire up connect-agent route, WebSocket endpoint, and credential_request tool
- [x] 4.2 Update `packages/proxy/src/index.ts` barrel exports

## 5. Verification

- [x] 5.1 `npx tsc --noEmit` compiles
- [x] 5.2 `npx eslint` passes
- [x] 5.3 `npx vitest run` passes
