# Tasks: Docker Session Orchestration for ACP

**Date:** 2026-03-10

## Completed

- [x] Create `packages/cli/src/acp/session.ts` with `AcpSession` class
- [x] Define `AcpSessionConfig`, `SessionInfo`, and `AcpSessionDeps` interfaces
- [x] Implement `generateAcpComposeYml()` -- adapted from `generateComposeYml()` with ACP differences
- [x] Implement `AcpSession.start()` -- generate compose, start all services detached
- [x] Implement `AcpSession.stop()` -- tear down all containers via `docker compose down`
- [x] Implement `AcpSession.isRunning()` -- return running state
- [x] Handle CREDENTIAL_SESSION_OVERRIDES env var in compose generation
- [x] Handle ACP port exposure in compose generation
- [x] Handle non-interactive agent container (no stdin_open/tty)
- [x] Create `packages/cli/tests/acp/session.test.ts`
- [x] Test: generated compose has correct three services
- [x] Test: agent service has no stdin_open/tty (non-interactive)
- [x] Test: credential-service gets CREDENTIAL_SESSION_OVERRIDES
- [x] Test: agent service exposes ACP port
- [x] Test: start() returns correct SessionInfo
- [x] Test: stop() calls compose down
- [x] Test: isRunning() reflects state
- [x] Test: double start throws
- [x] Test: stop when not running is idempotent
- [x] Verify type check passes (`npx tsc --noEmit`)
- [x] Verify lint passes
- [x] Verify all tests pass (883 tests, including 31 new session tests)
