## 1. Audit Hooks — Replace SQLite with Relay

- [ ] 1.1 Modify `packages/proxy/src/hooks/audit.ts` — replace DB imports with relay imports, update `auditPostHook` and `logDroppedServers` signatures
- [ ] 1.2 Modify `packages/proxy/src/hooks/approval.ts` — replace DB imports with relay imports, update `requestApproval` to use `relay.request()`

## 2. AuditWriter — Host-side JSONL Writer

- [ ] 2.1 Create `packages/proxy/src/audit/writer.ts` with `AuditWriter` class

## 3. Server — Remove DB from ProxyServerConfig

- [ ] 3.1 Modify `packages/proxy/src/server.ts` — remove `db` field, pass relay to hooks
- [ ] 3.2 Modify `packages/proxy/src/index.ts` — remove DB exports, add `AuditWriter` export

## 4. Credential Service — Remove SQLite Dependency

- [ ] 4.1 Modify `packages/proxy/src/credentials/audit.ts` — remove SQLite operations, keep types
- [ ] 4.2 Modify `packages/proxy/src/credentials/service.ts` — remove DB dependency
- [ ] 4.3 Modify `packages/proxy/src/credentials/index.ts` — update exports

## 5. Remove SQLite from Package

- [ ] 5.1 Delete `packages/proxy/src/db.ts`
- [ ] 5.2 Remove `better-sqlite3` from `packages/proxy/package.json`
- [ ] 5.3 Run `npm install` to update lockfile

## 6. CLI — Remove DB Usage

- [ ] 6.1 Modify `packages/cli/src/cli/commands/proxy.ts` — remove openDatabase/db usage
- [ ] 6.2 Modify `packages/cli/tests/cli/proxy.test.ts` — remove openDatabase mock

## 7. Tests

- [ ] 7.1 Create `packages/proxy/tests/audit/writer.test.ts`
- [ ] 7.2 Rewrite `packages/proxy/tests/hooks/audit.test.ts` — use relay mock
- [ ] 7.3 Rewrite `packages/proxy/tests/hooks/approval.test.ts` — use relay mock
- [ ] 7.4 Update `packages/proxy/tests/server.test.ts` — remove DB references
- [ ] 7.5 Update `packages/proxy/tests/integration-proxy.test.ts` — remove DB references
- [ ] 7.6 Update `packages/proxy/tests/credentials/audit.test.ts` — remove SQLite tests
- [ ] 7.7 Delete `packages/proxy/tests/db.test.ts`

## 8. Verification

- [ ] 8.1 `npx tsc --noEmit` compiles
- [ ] 8.2 `npx vitest run packages/proxy/tests/` passes
- [ ] 8.3 `npx vitest run packages/cli/tests/` passes
- [ ] 8.4 `better-sqlite3` not in `packages/proxy/package.json`
- [ ] 8.5 `packages/proxy/src/db.ts` does not exist
- [ ] 8.6 `ProxyServerConfig` has no `db` field
