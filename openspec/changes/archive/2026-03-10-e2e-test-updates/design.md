# Design: E2E Test Updates

## Overview

Update E2E tests to use `chapter build` (the unified build command from Change #3) instead of the separate `pack` -> `docker-init` -> `run-init` pipeline. Update references from removed CLI commands.

## Changes by File

### `e2e/tests/docker-init-full.test.ts`

**Before:** Runs `chapter pack`, then `chapter docker-init`, then `runRunInit()` programmatically.

**After:** Runs `chapter build` which does pack + docker-init in one step. Removes the `run-init` step entirely -- the old `runRunInit` tested per-project `.clawmasons/chapter.json` creation which is now handled by auto-init in `run-agent` (Change #5). The `readRunConfig` and `validateDockerfiles` imports remain available since the functions still exist in `run-agent.ts`.

Specific changes:
1. Remove `import { runRunInit }` from `run-init.js`
2. Replace `chapter pack` + `chapter docker-init` steps with single `chapter build` call
3. Remove `runnerDir` and all `run-init` related setup (step 4 and 5 in `beforeAll`)
4. Remove `run-init output` describe block entirely
5. Remove `runnerDir` cleanup from `afterAll`
6. Add new test: `chapter.lock.json` exists after build
7. Update top-of-file comment to describe the new flow
8. Keep `validateDockerfiles` test -- it validates docker-init output which `build` still produces

### `e2e/tests/acp-proxy.test.ts`

**Before:** `beforeAll` runs `chapter pack` then `chapter docker-init`.

**After:** `beforeAll` runs `chapter build`.

Specific changes:
1. Replace `chapter pack` + `chapter docker-init` exec calls with single `chapter build`
2. Update top-of-file comment to reference `chapter build`

### `e2e/tests/note-taker-pi.test.ts`

No changes needed. Already uses `chapter build`. The `generateDockerfiles` import from `docker-init.js` is an internal API that remains per REQ-007.

## Design Decisions

- **Keep `validateDockerfiles` test**: Even though `run-init` is removed, `validateDockerfiles` from `run-agent.ts` is still a valid function that validates Docker artifacts exist. It's useful to test that `build` produces the expected Dockerfiles.
- **Remove `readRunConfig` test entirely**: `readRunConfig` reads `.clawmasons/chapter.json` which is only created by `run-init`. Since `run-init` is removed and replaced by `CLAWMASONS_HOME/chapters.json`, testing `readRunConfig` in E2E is no longer relevant.
- **No `run-init` replacement in E2E**: The E2E test doesn't need to test `init-role` or auto-init since those have dedicated unit tests (from Changes #4 and #5). The E2E focuses on build -> Docker artifacts -> proxy connectivity.
