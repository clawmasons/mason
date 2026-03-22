## Tasks: Credential Requests via Relay

### Task 1: Create CredentialRelayHandler (host-side)

Create `packages/proxy/src/credentials/relay-handler.ts`:

- [ ] Create `CredentialRelayHandler` class with constructor taking `RelayClient` and `CredentialService`
- [ ] Implement `register()` method that registers a `credential_request` handler on the relay client
- [ ] Handler converts incoming `CredentialRequestMessage` to `CredentialRequest` for `CredentialService.handleRequest()`
- [ ] Handler sends `credential_response` back via `relayClient.send()` with same `id` for correlation
- [ ] Handle errors: if `handleRequest()` throws, send error response

### Task 2: Create relay-handler tests

Create `packages/proxy/tests/credentials/relay-handler.test.ts`:

- [ ] Test handler registration on relay client
- [ ] Test successful credential resolution flow
- [ ] Test access denied error flow
- [ ] Test credential not found error flow
- [ ] Test response id matches request id
- [ ] Test error handling when service throws

### Task 3: Modify server.ts -- credential_request via relay

- [ ] Remove `CredentialRelay` import and `credentialRelay` field
- [ ] Remove `credentialProxyToken` from `ProxyServerConfig`
- [ ] Remove `getCredentialRelay()` method
- [ ] Update `credential_request` tool availability: check `relayServer` instead of `credentialRelay`
- [ ] Update `credential_request` tool handler: validate session, create relay message, use `relayServer.request()`
- [ ] Remove `/ws/credentials` from WebSocket upgrade handler
- [ ] Simplify upgrade handler (only `/ws/relay` now)

### Task 4: Modify index.ts -- remove CredentialRelay export

- [ ] Remove `CredentialRelay` export
- [ ] Remove `CredentialRelayConfig` and `CredentialToolResult` type exports
- [ ] Add `CredentialRelayHandler` export

### Task 5: Delete credential-relay.ts and its test

- [ ] Delete `packages/proxy/src/handlers/credential-relay.ts`
- [ ] Delete `packages/proxy/tests/handlers/credential-relay.test.ts`

### Task 6: Update server.test.ts

- [ ] Change `credentialProxyToken` to `relayToken` in tests that check credential_request tool availability
- [ ] Verify credential_request tool is listed when relayToken is set
- [ ] Verify credential_request tool count is correct

### Task 7: Verify

- [ ] `npx tsc --noEmit` compiles
- [ ] `npx vitest run packages/proxy/tests/` passes
- [ ] No remaining references to `CredentialRelay` in proxy package source
- [ ] No remaining references to `/ws/credentials` in proxy package source
