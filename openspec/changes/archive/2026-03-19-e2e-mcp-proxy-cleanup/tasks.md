## 1. Delete Unused Test Files

- [x] 1.1 Delete `packages/tests/tests/acp-client-spawn.test.ts`
- [x] 1.2 Delete `packages/tests/tests/build-pipeline.test.ts`
- [x] 1.3 Delete `packages/tests/tests/cross-agent-materialization.test.ts`
- [x] 1.4 Delete `packages/tests/tests/docker-proxy.test.ts`
- [x] 1.5 Delete `packages/tests/tests/error-paths.test.ts`
- [x] 1.6 Delete `packages/tests/tests/mcp-proxy.test.ts`
- [x] 1.7 Delete `packages/tests/tests/role-workflow.test.ts`
- [x] 1.8 Delete `packages/tests/tests/test-note-taker-mcp.test.ts`
- [x] 1.9 Delete `packages/tests/tests/volume-masking.test.ts`

## 2. Delete Unused Fixtures and Scripts

- [x] 2.1 Delete `packages/tests/fixtures/test-chapter/` directory
- [x] 2.2 Delete `packages/tests/scripts/` directory

## 3. Fix mcp-proxy-agent.test.ts

- [x] 3.1 Run the test: `cd packages/tests && npx vitest run --config vitest.config.ts`
- [x] 3.2 Read the error output and identify root cause(s)
- [x] 3.3 Fix identified errors (fixture, CLI behavior, timing, or imports)
- [x] 3.4 Re-run test and verify it passes; repeat 3.2–3.4 until green
