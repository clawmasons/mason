## Tasks

- [x] Create `packages/cli/src/acp/discovery-cache.ts` with `discoverForCwd()` and `invalidateCache()`
- [x] Modify `packages/cli/src/acp/acp-agent.ts` to implement `newSession` handler
- [x] Add in-memory `sessions` Map for runtime session state
- [x] Add default project role creation when no local roles found
- [x] Send `available_commands_update` notification after session creation
- [x] Create `packages/cli/tests/acp/session-new.test.ts` with unit tests (8 tests)
- [x] Verify TypeScript compilation (`npx tsc --noEmit`) — passes
- [x] Verify linting (`npx eslint`) — passes
- [x] Verify unit tests pass (559 tests, 34 files, 0 failures)
