## Why

The credential service currently lives in its own `packages/credential-service` package. The host-proxy PRD (CHANGE 4) requires absorbing it into `packages/proxy/src/credentials/` so that the proxy package owns credential resolution, validation, and audit -- a prerequisite for wiring credential requests through the relay (CHANGE 5) and removing SQLite (CHANGE 6). Eliminating the standalone package also reduces monorepo complexity and package count.

## What Changes

- New `packages/proxy/src/credentials/` directory with files copied from `packages/credential-service/src/`: `resolver.ts`, `service.ts`, `keychain.ts`, `env-file.ts`, `schemas.ts`, and an adapted `audit.ts` that emits audit entries via a callback instead of writing to SQLite directly.
- New `packages/proxy/src/credentials/index.ts` barrel exporting all credential types and classes.
- Modified `packages/proxy/src/index.ts` to re-export the credentials module.
- Updated imports in `packages/cli/src/cli/commands/run-agent.ts` and `packages/cli/tests/integration/credential-flow.test.ts` from `@clawmasons/credential-service` to `@clawmasons/proxy`.
- Removed `@clawmasons/credential-service` from CLI's `package.json` dependencies.
- Removed `@clawmasons/credential-service` from `proxy-dependencies.ts` framework packages list.
- Removed credential-service references from root `tsconfig.json`, `vitest.config.ts`, `.changeset/config.json`, `scripts/bump-and-publish-all.sh`.
- Deleted `packages/credential-service/` entirely.
- Migrated tests to `packages/proxy/tests/credentials/`.

## Capabilities

### New Capabilities
- `credential-service-in-proxy`: CredentialResolver, CredentialService, CredentialWSClient, and credential schemas available from `@clawmasons/proxy` instead of `@clawmasons/credential-service`.
- `audit-callback-pattern`: audit.ts uses an `AuditEmitter` callback interface instead of direct SQLite writes, preparing for relay-based audit in CHANGE 6.

### Modified Capabilities
- `proxy-exports`: `packages/proxy/src/index.ts` now exports credential types alongside existing proxy exports.

## Impact

- **New directory:** `packages/proxy/src/credentials/` (7 files)
- **New test directory:** `packages/proxy/tests/credentials/` (4 test files)
- **Modified:** `packages/proxy/src/index.ts`, `packages/proxy/package.json`
- **Modified:** `packages/cli/src/cli/commands/run-agent.ts`, `packages/cli/tests/integration/credential-flow.test.ts`, `packages/cli/package.json`, `packages/cli/src/materializer/proxy-dependencies.ts`
- **Modified:** root `tsconfig.json`, `vitest.config.ts`, `.changeset/config.json`, `scripts/bump-and-publish-all.sh`
- **Deleted:** `packages/credential-service/` (entire directory)
- **No breaking changes** to public API -- same exports, different package origin.
