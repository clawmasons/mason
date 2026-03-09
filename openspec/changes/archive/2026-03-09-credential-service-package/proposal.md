## Why

The credential service package has a resolver (CHANGE 2) but no way to actually serve credential requests. Agents need a service that validates access, resolves credentials, logs audit trails, and communicates over WebSocket with the proxy. Without this, the credential pipeline is incomplete.

## What Changes

- Add Zod schemas for credential requests/responses (from PRD Appendix B)
- Add `CredentialService` class (SDK mode) with access validation and audit logging
- Add WebSocket client connecting to proxy with reconnect logic
- Add `credential_audit` SQLite table and audit functions
- Add CLI entrypoint for standalone Docker deployment
- Update barrel exports for SDK API

### New Capabilities
- `credential-service-ws`: WebSocket client connecting to proxy for credential request relay
- `credential-service-core`: CredentialService class with access validation and audit logging
- `credential-audit`: SQLite audit logging for all credential operations

### Modified Capabilities
- `credential-resolver`: Existing resolver is consumed by the new CredentialService class

## Impact

- New: `packages/credential-service/src/schemas.ts`
- New: `packages/credential-service/src/service.ts`
- New: `packages/credential-service/src/ws-client.ts`
- New: `packages/credential-service/src/audit.ts`
- New: `packages/credential-service/src/cli.ts`
- Modified: `packages/credential-service/src/index.ts` (expanded exports)
- Modified: `packages/credential-service/package.json` (add ws, better-sqlite3 deps)
- New: `packages/credential-service/tests/service.test.ts`
- New: `packages/credential-service/tests/audit.test.ts`
- New: `packages/credential-service/tests/ws-client.test.ts`
