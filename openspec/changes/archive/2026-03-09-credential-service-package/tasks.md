## 1. Dependencies & Package Setup

- [x] 1.1 Install `ws`, `@types/ws`, `better-sqlite3` dependencies in credential-service package
- [x] 1.2 Add bin entry to package.json for CLI entrypoint

## 2. Schemas

- [x] 2.1 Create `packages/credential-service/src/schemas.ts` with Zod schemas for credential request, response, and service config

## 3. Audit Module

- [x] 3.1 Create `packages/credential-service/src/audit.ts` with `credential_audit` table schema, insert, and query functions
- [x] 3.2 Create `packages/credential-service/tests/audit.test.ts` with unit tests

## 4. Credential Service Core

- [x] 4.1 Create `packages/credential-service/src/service.ts` with `CredentialService` class
- [x] 4.2 Implement `handleRequest` with access validation -> resolve -> audit -> respond
- [x] 4.3 Create `packages/credential-service/tests/service.test.ts` with unit tests for access validation (granted/denied/error)

## 5. WebSocket Client

- [x] 5.1 Create `packages/credential-service/src/ws-client.ts` with WebSocket client
- [x] 5.2 Implement connect, message handling, and reconnect logic
- [x] 5.3 Create `packages/credential-service/tests/ws-client.test.ts` with mock WS server tests

## 6. CLI & Barrel Export

- [x] 6.1 Create `packages/credential-service/src/cli.ts` CLI entrypoint
- [x] 6.2 Update `packages/credential-service/src/index.ts` barrel export

## 7. Verification

- [x] 7.1 `npx tsc --noEmit` compiles
- [x] 7.2 `npx eslint` passes
- [x] 7.3 `npx vitest run` passes (631 tests, 39 test files)
