## Design: Credential Requests via Relay

### Overview

This change replaces the `CredentialRelay` WebSocket handler with the generic relay protocol for credential requests. Two sides are affected:

1. **Docker side (server.ts):** The `credential_request` MCP tool handler sends a `credential_request` relay message via `RelayServer.request()` and awaits a `credential_response`.
2. **Host side (relay-handler.ts):** A new `CredentialRelayHandler` registers a `credential_request` handler on the `RelayClient`, processes requests through `CredentialService.handleRequest()`, and sends back `credential_response` messages.

### Docker Side: server.ts Changes

#### credential_request Tool Availability

Currently, the `credential_request` tool is added to `listTools` when `this.credentialRelay` exists. After this change, it will be added when `this.relayServer` exists and is connected.

#### credential_request Tool Handler

Current flow:
```
agent calls credential_request tool
  -> CredentialRelay.handleCredentialRequest(sessionStore, key, sessionToken, declaredCredentials)
  -> CredentialRelay forwards to credential service WS
  -> Returns CredentialToolResult
```

New flow:
```
agent calls credential_request tool
  -> Validate session token via sessionStore
  -> Create credential_request relay message (createRelayMessage)
  -> RelayServer.request(message, timeoutMs)
  -> Parse credential_response
  -> Return result to agent
```

The session token validation stays in server.ts (same as before). The relay message includes the session details (agentId, role, sessionId, declaredCredentials) so the host side can pass them to `CredentialService.handleRequest()`.

#### /ws/credentials Removal

The `httpServer.on("upgrade", ...)` handler will no longer check for `/ws/credentials`. The `credentialRelay` field, `CredentialRelay` import, and `getCredentialRelay()` method are removed from `ProxyServer`.

#### credentialProxyToken Removal

The `credentialProxyToken` config field is removed from `ProxyServerConfig`. The relay uses `relayToken` instead.

### Host Side: CredentialRelayHandler

New file: `packages/proxy/src/credentials/relay-handler.ts`

```typescript
export class CredentialRelayHandler {
  constructor(
    private readonly relayClient: RelayClient,
    private readonly credentialService: CredentialService,
  )

  register(): void
    // Registers a handler for "credential_request" on the relayClient
    // On incoming message:
    //   1. Extract fields from CredentialRequestMessage
    //   2. Build a CredentialRequest for CredentialService.handleRequest()
    //   3. Call handleRequest()
    //   4. Send credential_response back via relayClient.send()
    //     (using same id as the incoming request for correlation)
}
```

The handler converts between relay message format and the `CredentialService` request/response format. The response uses the same `id` as the incoming request so `RelayServer.request()` can correlate it.

### Config Changes

`ProxyServerConfig` changes:
- Remove: `credentialProxyToken`
- Keep: `relayToken` (already exists)
- Keep: `credentialRequestTimeoutMs` (used for relay request timeout)
- Keep: `declaredCredentials` (included in relay message)
- Keep: `roleName` (included in relay message)

### Error Handling

- If relay is not connected when credential_request tool is called: return error "Relay not connected"
- If relay request times out: return error "Credential request timed out" (same behavior as before)
- If host side returns credential_response with error: return error to agent (same behavior)
- If relay message parsing fails on host side: send credential_response with error

### Test Coverage

1. **`packages/proxy/tests/credentials/relay-handler.test.ts`** (new):
   - Handler registration on RelayClient
   - Incoming credential_request -> CredentialService called with correct params
   - credential_response sent back with resolved credential
   - credential_response sent back with error on access denied
   - credential_response sent back with error on not found
   - Response id matches request id

2. **`packages/proxy/tests/server.test.ts`** (modified):
   - Tests using `credentialProxyToken` updated to use `relayToken`
   - credential_request tool listed when relayToken is set
   - credential_request tool call sends relay message

3. **`packages/proxy/tests/handlers/credential-relay.test.ts`** (deleted):
   - All tests replaced by relay-handler.test.ts and server.test.ts updates

### Migration Notes

- The CLI (`packages/cli/src/cli/commands/run-agent.ts`) still references `credentialProxyToken` and `CredentialWSClient`. Those will be updated in CHANGE 9 (CLI Integration). For now, this change only modifies the proxy package.
- The CLI integration test at `packages/cli/tests/integration/credential-flow.test.ts` references `credentialRelay`. This will also be updated in CHANGE 9.

### Future Changes Compatibility

- **CHANGE 6 (Audit via Relay):** No conflict. Audit hooks are independent of credential flow.
- **CHANGE 7 (Approvals via Relay):** No conflict. Approval hooks will use same `RelayServer.request()` pattern.
- **CHANGE 8 (Host Proxy Orchestrator):** `CredentialRelayHandler` will be instantiated by the `HostProxy` class. The handler's constructor signature is designed for this.
- **CHANGE 9 (CLI Integration):** CLI will start `HostProxy` which creates `CredentialRelayHandler`. The `credentialProxyToken` config and `CredentialWSClient` are removed from CLI.
