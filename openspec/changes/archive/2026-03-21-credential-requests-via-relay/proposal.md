## Why

The Docker proxy currently uses a single-purpose `CredentialRelay` class and `/ws/credentials` WebSocket endpoint to handle credential requests from agents. Changes 1-3 introduced a generic relay protocol with `RelayServer` and `RelayClient` over `/ws/relay`. Change 4 moved the `CredentialService` into the proxy package. Now the credential request flow needs to be migrated from the old `CredentialRelay` to the new relay protocol, completing the first phase of the relay migration.

The old `CredentialRelay` class, `/ws/credentials` endpoint, and `credential-relay.ts` handler are redundant once this change is complete -- the relay server already supports the same semantics (send request, await correlated response with timeout) in a generic, type-safe way.

## What Changes

- Modify `packages/proxy/src/server.ts` -- the `credential_request` tool handler uses `RelayServer.request()` with a `credential_request` relay message instead of `CredentialRelay.handleCredentialRequest()`. The `credentialRelay` property and `/ws/credentials` upgrade path are removed. The `credential_request` tool is now available when `relayServer` is present (instead of when `credentialRelay` is present).
- Delete `packages/proxy/src/handlers/credential-relay.ts` -- fully replaced by the relay protocol.
- Modify `packages/proxy/src/index.ts` -- remove `CredentialRelay` export.
- New `packages/proxy/src/credentials/relay-handler.ts` -- host-side handler that registers a `credential_request` handler on the `RelayClient`, calls `CredentialService.handleRequest()`, and sends back a `credential_response`.
- Delete `packages/proxy/tests/handlers/credential-relay.test.ts` -- replaced by relay-based tests.
- New/modify credential flow tests to verify end-to-end relay-based credential resolution.

## Capabilities

### New Capabilities
- `credential-relay-handler`: Host-side handler that bridges `RelayClient` incoming `credential_request` messages to `CredentialService.handleRequest()` and sends back `credential_response` messages.

### Modified Capabilities
- `proxy-server`: `credential_request` tool now uses `RelayServer.request()` instead of `CredentialRelay`. `/ws/credentials` endpoint removed.

### Removed Capabilities
- `credential-relay`: The `CredentialRelay` class and `/ws/credentials` endpoint are deleted.

## Impact

- **Deleted file:** `packages/proxy/src/handlers/credential-relay.ts`
- **Deleted test:** `packages/proxy/tests/handlers/credential-relay.test.ts`
- **Modified file:** `packages/proxy/src/server.ts` -- credential_request via relay, remove /ws/credentials
- **Modified file:** `packages/proxy/src/index.ts` -- remove CredentialRelay export
- **New file:** `packages/proxy/src/credentials/relay-handler.ts`
- **New test:** `packages/proxy/tests/credentials/relay-handler.test.ts`
- **Modified test:** `packages/proxy/tests/server.test.ts` -- update credential tests to use relayToken
- **Dependencies:** No new dependencies
- **Depends on:** CHANGE 1 (relay messages), CHANGE 2 (relay server), CHANGE 3 (relay client), CHANGE 4 (credential service in proxy)
- **Breaking:** CLI code that references `CredentialRelay` or `/ws/credentials` will need updating (done in CHANGE 9)
