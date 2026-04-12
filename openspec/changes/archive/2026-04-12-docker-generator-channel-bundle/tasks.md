# Tasks: Docker Generator Copies Channel Bundle into Build Context

**Change:** CHANGE 5 from PRD `role-channels`
**Date:** 2026-04-12

## Tasks

- [x] Add `copyChannelBundle()` function to `packages/cli/src/materializer/proxy-dependencies.ts`
- [x] Call `copyChannelBundle()` from `packages/cli/src/cli/commands/build.ts` per role
- [x] Call `copyChannelBundle()` from `packages/cli/src/cli/commands/run-agent.ts` after build
- [x] Add unit tests for `copyChannelBundle()` in `packages/cli/tests/materializer/proxy-dependencies.test.ts`
- [x] Update mock in `packages/cli/tests/cli/build.test.ts` to include `copyChannelBundle`
- [x] Verify all existing tests still pass (732 CLI tests, 366 shared tests, 273 agent-sdk tests)
- [x] Verify lint and type-check pass
