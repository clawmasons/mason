# Tasks: Enhanced `chapter build` Command

**Date:** 2026-03-10

## Completed

- [x] Make `<agent>` argument optional in build command registration
- [x] Add agent auto-detection logic (single agent -> auto-detect, multiple -> build all)
- [x] Integrate `runPack()` call after lock file generation
- [x] Integrate `runDockerInit()` call after pack
- [x] Add completion instructions output (run-agent, ACP client config)
- [x] Remove `docker-init` command registration from index.ts
- [x] Remove `run-init` command registration from index.ts
- [x] Remove `acp-proxy` command registration from index.ts
- [x] Update build.test.ts: agent argument is now optional
- [x] Update build.test.ts: add test for auto-detection with single agent
- [x] Update build.test.ts: add test for multi-agent build-all
- [x] Update build.test.ts: add test for completion instructions output
- [x] Update docker-init.test.ts: remove "has docker-init command registered" test
- [x] Add test: `docker-init` is NOT a registered command (in build.test.ts)
- [x] Add test: `run-init` is NOT a registered command (in build.test.ts)
- [x] Add test: `acp-proxy` is NOT a registered command (in build.test.ts)
- [x] Update acp-proxy.test.ts: remove command registration tests (command removed)
- [x] Update run-init.test.ts: remove command registration test (command removed)
- [x] Verify internal imports from docker-init.ts still work
- [x] Verify type check passes (`npx tsc --noEmit`)
- [x] Verify lint passes
- [x] Verify all tests pass (947 tests, 56 test files)
