# Tasks: Agent Dockerfile ACP Entrypoint

**Date:** 2026-03-10

## Completed

- [x] Import `ACP_RUNTIME_COMMANDS` from `materializer/common.ts`
- [x] Add `options?: { acpMode?: boolean }` parameter to `generateAgentDockerfile()`
- [x] Refactor `getRuntimeConfig()` to accept `acpMode` flag
- [x] Extract `getBaseRuntimeConfig()` for non-ACP base config
- [x] Implement ACP entrypoint resolution using `ACP_RUNTIME_COMMANDS`
- [x] Add `[ACP mode]` marker to Dockerfile header comment
- [x] Handle unknown runtime fallback with warning comment
- [x] Add 8 new ACP mode tests to test file
- [x] Verify all 33 tests pass (including existing regression tests)
- [x] Verify full test suite (838 tests) passes
- [x] Type check passes (`npx tsc --noEmit`)
- [x] Lint passes
