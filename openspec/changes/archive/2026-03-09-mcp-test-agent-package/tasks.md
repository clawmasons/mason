## 1. Agent Package

- [x] 1.1 Create `e2e/fixtures/test-chapter/agents/mcp-test/package.json` with `credentials: ["TEST_TOKEN"]`, runtime `node`, role `@test/role-mcp-test`
- [x] 1.2 Create `e2e/fixtures/test-chapter/agents/mcp-test/src/index.ts` with interactive REPL

## 2. Role Package

- [x] 2.1 Create `e2e/fixtures/test-chapter/roles/mcp-test/package.json` with `risk: "LOW"`, wildcard permissions

## 3. Integration Test

- [x] 3.1 Create `packages/cli/tests/integration/credential-flow.test.ts` -- test credential retrieval via proxy + credential service (SDK mode)

## 4. Verification

- [x] 4.1 `npx tsc --noEmit` compiles
- [x] 4.2 `npx eslint packages/*/src/ packages/*/tests/` passes
- [x] 4.3 `npx vitest run` passes
