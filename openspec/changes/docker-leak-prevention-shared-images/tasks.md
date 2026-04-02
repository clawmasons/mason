## 1. Shared Session Cleanup Helper

- [x] 1.1 Add `registerSessionCleanup` function in `run-agent.ts` near the Shared Helpers section (~line 1766). Accepts async cleanup callback, returns `{ unregister, runCleanup }`. Includes idempotent `cleanedUp` guard. Installs SIGINT/SIGTERM handlers that run cleanup then `process.exit(1)`.
- [x] 1.2 Unit test: verify cleanup runs exactly once when triggered multiple times
- [x] 1.3 Unit test: verify `unregister()` removes signal listeners

## 2. Wire Cleanup into All Run Modes

- [x] 2.1 Wire `registerSessionCleanup` into `runAgentInteractiveMode` (line 1866): register after composeFile/hostProxyHandle established, `unregister()` on normal exit, `await runCleanup()` in catch block before `process.exit(1)`
- [x] 2.2 Wire `registerSessionCleanup` into `runAgentJsonMode` (line 2043): same pattern as interactive
- [x] 2.3 Wire `registerSessionCleanup` into `runAgentPrintMode` (line 2253): same pattern as JSON
- [x] 2.4 Wire `registerSessionCleanup` into `runAgentDevContainerMode` (line 2469): replace ad-hoc `process.once("SIGINT"/"SIGTERM")` handlers (lines 2644-2648) with shared mechanism

## 3. Stable Image Names

- [x] 3.1 In `docker-generator.ts`, compute `stableImagePrefix = mason-${projectHash}` independently of `composeName` (line 515 area)
- [x] 3.2 Change agent service image tag (line 693) from `${composeName}-${agentServiceName}-${agentShortName}` to `${stableImagePrefix}-${agentServiceName}-${agentShortName}`
- [x] 3.3 Update any proxy service image naming to use `stableImagePrefix` if applicable (N/A — proxy has no explicit image tag)
- [x] 3.4 Update existing unit tests in `docker-generator` tests to expect new image name format (no session ID) (N/A — no existing tests assert image tag format)

## 4. E2E Global Teardown

- [x] 4.1 Create `packages/cli/tests/e2e/global-teardown.ts` that prunes stopped mason containers (`docker ps -a --filter` + `docker rm`) and unused mason networks (`docker network ls --filter` + `docker network rm`)
- [x] 4.2 Reference `global-teardown.ts` in `vitest.e2e.config.ts` via `globalTeardown` option

## 5. Verification

- [x] 5.1 `npx tsc --noEmit` passes (1 pre-existing error in shared/tests, not from this change)
- [x] 5.2 `npx eslint src/ tests/` passes (from packages/cli)
- [x] 5.3 `npx vitest run packages/cli/tests/` — all 744 tests pass
- [x] 5.4 `npx vitest run packages/shared/tests/` — all 350 tests pass
