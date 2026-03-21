## Tasks: Move Credential Service into Proxy Package

### Implementation Tasks

- [ ] Rename `packages/proxy/src/credentials.ts` to `packages/proxy/src/env-utils.ts` and update all internal imports
- [ ] Create `packages/proxy/src/credentials/` directory
- [ ] Copy `resolver.ts` from credential-service (unchanged)
- [ ] Copy `keychain.ts` from credential-service (unchanged)
- [ ] Copy `env-file.ts` from credential-service (unchanged)
- [ ] Copy `schemas.ts` from credential-service (unchanged)
- [ ] Copy `ws-client.ts` from credential-service (unchanged)
- [ ] Adapt `audit.ts` — add AuditEmitter callback pattern, keep SQLite functions temporarily
- [ ] Adapt `service.ts` — accept optional AuditEmitter, default to SQLite-backed emitter
- [ ] Create `credentials/index.ts` barrel exports
- [ ] Update `packages/proxy/src/index.ts` to export credentials module
- [ ] Update `packages/proxy/package.json` — add `@clawmasons/shared` dep if not present (for CLI_NAME_LOWERCASE in audit.ts)

### Import Migration Tasks

- [ ] Update `packages/cli/src/cli/commands/run-agent.ts` — change import from `@clawmasons/credential-service` to `@clawmasons/proxy`
- [ ] Update `packages/cli/tests/integration/credential-flow.test.ts` — change import
- [ ] Remove `@clawmasons/credential-service` from `packages/cli/package.json` dependencies

### Monorepo Cleanup Tasks

- [ ] Remove `@clawmasons/credential-service` path mapping from root `tsconfig.json`
- [ ] Remove credential-service includes from root `tsconfig.json`
- [ ] Remove `@clawmasons/credential-service` alias from root `vitest.config.ts`
- [ ] Remove `@clawmasons/credential-service` from `.changeset/config.json` fixed group
- [ ] Remove `@clawmasons/credential-service` from `scripts/bump-and-publish-all.sh`
- [ ] Remove `@clawmasons/credential-service` from `packages/cli/src/materializer/proxy-dependencies.ts`

### Delete Tasks

- [ ] Delete `packages/credential-service/` directory

### Test Migration Tasks

- [ ] Migrate `resolver.test.ts` to `packages/proxy/tests/credentials/`
- [ ] Migrate `service.test.ts` to `packages/proxy/tests/credentials/`
- [ ] Migrate `session-overrides.test.ts` to `packages/proxy/tests/credentials/`
- [ ] Migrate `audit.test.ts` to `packages/proxy/tests/credentials/`
- [ ] Migrate `ws-client.test.ts` to `packages/proxy/tests/credentials/`

### Verification Tasks

- [ ] Run `npm install` to update lockfile
- [ ] Run `npx tsc --noEmit` — no TypeScript errors
- [ ] Run `npx vitest run packages/proxy/tests/` — all tests pass
- [ ] Run `npx eslint packages/proxy/src/ packages/cli/src/` — no lint errors
- [ ] Verify `packages/credential-service/` no longer exists
