## Tasks

- [x] 1. Extend `Session` interface in `packages/shared/src/session/session-store.ts`
  - Add `masonSessionId: string` field
  - Add `agentSessionId: string | null` field

- [x] 2. Update `createSession()` in `packages/shared/src/session/session-store.ts`
  - Set `masonSessionId` to `sessionId`
  - Set `agentSessionId` to `null`

- [x] 3. Update `run-agent.ts` to use `createSession()` from session store
  - Import `createSession` from `@clawmasons/shared`
  - Add `createSessionFn` to `RunAgentDeps`
  - Replace each `generateSessionId()` call with `createSession()` call
  - Pass `session.sessionId` to `createSessionDirectory()` via `sessionId` option

- [x] 4. Add unit tests for new fields in `packages/shared/tests/session/session-store.test.ts`
  - Test `masonSessionId === sessionId` on creation
  - Test `agentSessionId` is `null` on creation
  - Test `updateSession()` can set `agentSessionId` to a string
  - Test `readSession()` round-trips both new fields

- [x] 5. Update CLI tests in `packages/cli/tests/cli/run-agent.test.ts`
  - Add `createSessionFn` mock to all test dep factories
  - Ensure tests still pass with the new session creation flow

- [x] 6. Verify: `npx tsc --noEmit`, linter, unit tests pass
  - TypeScript: clean
  - ESLint: clean
  - Shared tests: 287 passed
  - CLI tests: 667 passed
  - Agent-SDK tests: 261 passed
