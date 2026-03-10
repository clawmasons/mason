# Proposal: E2E Test Updates

**Date:** 2026-03-10
**Change:** #8 from [ACP Session CWD IMPLEMENTATION](../../../prds/acp-session-cwd/IMPLEMENTATION.md)
**PRD Refs:** REQ-008 (E2E Test Updates)

## Problem

E2E tests still use the old separate `chapter pack` + `chapter docker-init` + `run-init` pipeline that was replaced by `chapter build` in Change #3. The `acp-proxy.test.ts` file references the old command names. Tests must be updated to use the new unified commands and verify the new flow works end-to-end.

## Proposal

Update the three E2E test files:

1. **`docker-init-full.test.ts`** -- Replace the separate `pack` + `docker-init` + `run-init` steps with a single `chapter build` call. Remove the `run-init` step (auto-init via `run-agent` replaces it). Remove the `readRunConfig` and `validateDockerfiles` import from `run-agent.js` and the `runRunInit` import from `run-init.js`. Add new assertion for `chapter.lock.json` existence after build.

2. **`acp-proxy.test.ts`** -- Replace `pack` + `docker-init` steps with `chapter build`. The file already only uses these in the Docker E2E setup section.

3. **`note-taker-pi.test.ts`** -- Already uses `chapter build` correctly. Only needs verification that `generateDockerfiles` import from `docker-init.js` still works (internal API unchanged per REQ-007).

## Scope

- Modified: `e2e/tests/docker-init-full.test.ts`
- Modified: `e2e/tests/acp-proxy.test.ts`
- No new files
