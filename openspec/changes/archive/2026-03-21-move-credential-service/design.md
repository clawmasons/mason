## Design: Move Credential Service into Proxy Package

### Overview

This change absorbs `packages/credential-service` into `packages/proxy/src/credentials/`. The credential resolver, service, schemas, keychain, env-file, and WS client code are copied with minimal changes. The audit module is adapted to use an emitter callback instead of direct SQLite writes.

### Architecture

```
packages/proxy/src/credentials/
  index.ts       — barrel exports
  resolver.ts    — CredentialResolver (unchanged)
  service.ts     — CredentialService (adapted: accepts AuditEmitter instead of DB)
  keychain.ts    — queryKeychain, queryKeychainByService (unchanged)
  env-file.ts    — loadEnvFile (unchanged)
  schemas.ts     — Zod schemas for credential request/response (unchanged)
  audit.ts       — AuditEmitter type + in-memory default implementation
  ws-client.ts   — CredentialWSClient (unchanged)
```

### Key Design Decisions

#### 1. Audit Adapter Pattern

The original `audit.ts` uses `better-sqlite3` to write to SQLite. Since CHANGE 6 will remove SQLite entirely and switch to relay-based audit, we adapt now:

- Define an `AuditEmitter` interface: `(entry: CredentialAuditEntry) => void`
- `CredentialService` accepts an optional `auditEmitter` in its constructor
- Default emitter: in-memory array (for testing) or no-op
- The service calls `this.auditEmitter(entry)` instead of `insertCredentialAudit(db, entry)`
- SQLite functions (`openCredentialDatabase`, `insertCredentialAudit`, `queryCredentialAudit`) are kept temporarily in `audit.ts` for backward compat with existing integration tests, but marked as deprecated

This approach means:
- Existing tests can still use `:memory:` SQLite for audit verification
- CHANGE 6 can swap the emitter to a relay sender with zero changes to service.ts
- No breaking API change for CLI consumers

#### 2. Import Migration Strategy

All imports from `@clawmasons/credential-service` are updated to `@clawmasons/proxy`:
- `packages/cli/src/cli/commands/run-agent.ts`
- `packages/cli/tests/integration/credential-flow.test.ts`

The proxy's `index.ts` re-exports everything the credential-service's `index.ts` exported.

#### 3. Proxy credentials.ts Coexistence

The existing `packages/proxy/src/credentials.ts` file exports `loadEnvFile` and `resolveEnvVars`. The new `packages/proxy/src/credentials/env-file.ts` also exports `loadEnvFile`. To avoid conflict:
- Keep the existing `credentials.ts` since it also has `resolveEnvVars` used by the proxy
- The credentials directory `index.ts` re-exports from its own `env-file.ts`
- Both coexist — TypeScript distinguishes `./credentials.js` (file) from `./credentials/index.js` (directory)

Actually, this would cause a module resolution conflict. Instead:
- Rename `packages/proxy/src/credentials.ts` to `packages/proxy/src/env-utils.ts`
- Update the proxy's `index.ts` to import from `./env-utils.js`
- The `credentials/` directory can then use the `credentials` namespace cleanly

#### 4. Package Cleanup

Remove `@clawmasons/credential-service` from:
- `packages/cli/package.json` dependencies
- `packages/cli/src/materializer/proxy-dependencies.ts` FRAMEWORK_PACKAGES
- Root `tsconfig.json` paths and includes
- Root `vitest.config.ts` aliases
- `.changeset/config.json` fixed group
- `scripts/bump-and-publish-all.sh` PACKAGES list

### Test Coverage

All existing credential-service tests are migrated:
- `packages/proxy/tests/credentials/resolver.test.ts` — from `packages/credential-service/tests/resolver.test.ts`
- `packages/proxy/tests/credentials/service.test.ts` — from `packages/credential-service/tests/service.test.ts`
- `packages/proxy/tests/credentials/session-overrides.test.ts` — from `packages/credential-service/tests/session-overrides.test.ts`
- `packages/proxy/tests/credentials/ws-client.test.ts` — from `packages/credential-service/tests/ws-client.test.ts`

The audit.test.ts tests that exercise SQLite directly remain functional since we keep the SQLite functions temporarily.
- `packages/proxy/tests/credentials/audit.test.ts` — from `packages/credential-service/tests/audit.test.ts`

The CLI integration test (`credential-flow.test.ts`) continues to work with updated imports.

### Compatibility with Future Changes

- **CHANGE 5** (Credential Requests via Relay): Will import CredentialService from `@clawmasons/proxy` (already the case after this change).
- **CHANGE 6** (Remove SQLite): Will delete the SQLite functions from audit.ts and remove `better-sqlite3` from proxy's package.json. The audit emitter pattern makes this straightforward.
- **CHANGE 8** (Host Proxy Orchestrator): Will use CredentialService from the same package.
- **CHANGE 9** (CLI Integration): Import path already updated by this change.
