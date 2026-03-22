## 1. Setup

- [x] 1.1 Add `zod` to `packages/proxy/package.json` dependencies
- [x] 1.2 Create `packages/proxy/src/relay/` directory

## 2. Base Schema and Message Types

- [x] 2.1 Create `packages/proxy/src/relay/messages.ts` with per-type schemas (base schema inlined into each variant for discriminated union)
- [x] 2.2 Implement `CredentialRequestSchema` and `CredentialResponseSchema`
- [x] 2.3 Implement `ApprovalRequestSchema` and `ApprovalResponseSchema`
- [x] 2.4 Implement `McpToolCallSchema` and `McpToolResultSchema`
- [x] 2.5 Implement `McpToolsRegisterSchema` and `McpToolsRegisteredSchema`
- [x] 2.6 Implement `AuditEventSchema`

## 3. Discriminated Union and Helpers

- [x] 3.1 Create `RelayMessageSchema` as `z.discriminatedUnion("type", [...all schemas])`
- [x] 3.2 Implement `parseRelayMessage(data: unknown)` using `safeParse()`
- [x] 3.3 Implement `createRelayMessage(type, fields)` using `crypto.randomUUID()`
- [x] 3.4 Export all types (inferred from schemas), schemas, and helper functions

## 4. Tests

- [x] 4.1 Create `packages/proxy/tests/relay/messages.test.ts`
- [x] 4.2 Test `parseRelayMessage()` with valid messages for all 9 types
- [x] 4.3 Test `parseRelayMessage()` with unknown type, empty object, missing fields, invalid UUID
- [x] 4.4 Test `createRelayMessage()` generates valid UUID and correct type/fields
- [x] 4.5 Test individual schemas reject wrong type discriminators and invalid field types

## 5. Verification

- [x] 5.1 `npx tsc --noEmit` compiles without errors (pre-existing unrelated error in CLI test)
- [x] 5.2 `npx vitest run packages/proxy/tests/` passes all tests (265 tests, 41 new)
