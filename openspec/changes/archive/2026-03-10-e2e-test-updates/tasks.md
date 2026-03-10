# Tasks: E2E Test Updates

- [x] Update `docker-init-full.test.ts`: replace `pack` + `docker-init` + `run-init` with `chapter build`
- [x] Remove `runRunInit` import and `run-init output` tests from `docker-init-full.test.ts`
- [x] Remove `runnerDir` creation and cleanup from `docker-init-full.test.ts`
- [x] Add `chapter.lock.json` assertion to `docker-init-full.test.ts`
- [x] Update `acp-proxy.test.ts`: replace `pack` + `docker-init` with `chapter build`
- [x] Update file header comments to reflect new flow
- [x] Run type check, linter, and tests to verify -- 1028 tests passing
