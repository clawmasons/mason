# Tasks: `chapter acp-proxy` CLI Command

**Date:** 2026-03-10

## Completed

- [x] Create `packages/cli/src/cli/commands/acp-proxy.ts` with `acpProxy` function
- [x] Register command in `packages/cli/src/cli/commands/index.ts`
- [x] Implement CLI options: --agent, --role, --port, --proxy-port
- [x] Implement startup sequence: discover, resolve, compute tool filters, start bridge
- [x] Wire bridge events: onClientConnect, onClientDisconnect, onAgentError
- [x] Implement graceful shutdown on SIGINT/SIGTERM
- [x] Create Docker session and connect bridge to container agent
- [x] Create `packages/cli/tests/cli/acp-proxy.test.ts` with unit tests
- [x] Test: command registers with correct options and defaults (5 tests)
- [x] Test: resolveAgentName auto-detect, flag, errors (4 tests)
- [x] Test: startup resolves agent (1 test)
- [x] Test: bridge starts on configured port (2 tests)
- [x] Test: session starts and bridge connects (2 tests)
- [x] Test: error handling -- no agent, session failure, bridge failure (3 tests)
- [x] Test: cleanup on failure (1 test)
- [x] Test: lifecycle callbacks set (3 tests)
- [x] Test: session ID logged, agent flag, proxy port config (3 tests)
- [x] Verify type check passes (`npx tsc --noEmit`)
- [x] Verify lint passes (`npx eslint`)
- [x] Verify all tests pass (909 tests across 54 files, including 26 new)
