## Context

Mason's `run-agent.ts` implements 4 run modes: interactive (`runAgentInteractiveMode`, line 1866), JSON streaming (`runAgentJsonMode`, line 2043), print (`runAgentPrintMode`, line 2253), and dev-container (`runAgentDevContainerMode`, line 2469). All modes call `docker compose down --volumes` on the success path, but none call it in their catch blocks. Only dev-container registers SIGINT/SIGTERM handlers (lines 2646-2647 via `process.once`). A Ctrl+C in the other 3 modes leaves containers, networks, and volumes orphaned.

Separately, `docker-generator.ts` constructs image tags as `mason-{projectHash}-{sessionId}-{agentServiceName}-{agentShortName}` (line 693), where `composeName = mason-${projectHash}-${opts.sessionId}` (line 515). Since every session gets a unique ID, identical Dockerfiles produce duplicate ~600MB-1GB images.

## Goals / Non-Goals

**Goals:**
- Ensure Docker resources are cleaned up on all exit paths (normal, signal, error) in all 4 run modes
- Consolidate signal handling into a single shared mechanism
- Eliminate duplicate image builds by removing session ID from image tags
- Add a safety net for e2e tests to prune leaked Docker resources

**Non-Goals:**
- Changing container or network naming conventions (only image tags change)
- Adding `--rmi` to compose down (shared images should persist for reuse)
- Automatic garbage collection of old images (existing `mason doctor` handles this)
- Handling SIGHUP or other signals beyond SIGINT/SIGTERM

## Decisions

### D1: Shared `registerSessionCleanup` helper with idempotent guard

**Choice:** A single helper function near the Shared Helpers section (~line 1766) that accepts a cleanup callback and returns `{ unregister, runCleanup }`.

**Why not per-mode handlers?** The cleanup logic (stop host proxy → compose down) is identical across all 4 modes. Duplicating it invites drift. A shared helper with an idempotent `cleanedUp` flag ensures cleanup runs exactly once regardless of whether it's triggered by signal, catch block, or normal exit racing with a signal.

**Why return `unregister`?** On the normal exit path, cleanup has already run inline. Calling `unregister()` removes the signal listeners so they don't fire after teardown is complete (avoiding double-cleanup or unexpected `process.exit(1)` after a successful run).

### D2: Wire pattern — register early, unregister on success, runCleanup in catch

Each mode registers cleanup immediately after `composeFile` and `hostProxyHandle` are established (the earliest point where Docker resources exist). The wiring:

1. **After setup:** `const { unregister, runCleanup } = registerSessionCleanup(cleanupFn)`
2. **Normal exit (after existing compose down + proxy stop):** `unregister()`
3. **Catch block (before `process.exit(1)`):** `await runCleanup()`

For dev-container mode, this replaces the existing `process.once("SIGINT/SIGTERM")` handlers (lines 2644-2648). The signal now triggers cleanup and exit rather than just resolving a promise — the "wait for signal then teardown" flow is preserved but the teardown is guaranteed.

### D3: Stable image names keyed on project + role + agent

**Choice:** Change image tag from `${composeName}-${agentServiceName}-${agentShortName}` to `mason-${projectHash}-${agentServiceName}${agentShortName ? `-${agentShortName}` : ""}`.

**Why not include role name explicitly?** The `agentServiceName` already encodes the role (it's `agent-{roleName}`), so `mason-{projectHash}-agent-{roleName}-{agentShortName}` is already role-scoped without redundancy.

**Why keep projectHash?** Different projects may have different Dockerfiles, so images must be scoped per-project. The 8-char SHA256 hash of project directory provides this.

**Alternative considered — content-addressed tags:** Hash the Dockerfile content to tag images. Rejected because it adds complexity (must hash at tag-generation time) and Docker's layer cache already handles content-identical rebuilds efficiently. The simpler name-based approach achieves the primary goal (no duplicate images per session).

### D4: E2E globalTeardown as safety net

**Choice:** Add a `globalTeardown` file that prunes stopped mason containers and dangling mason networks after all e2e tests complete. Referenced from `vitest.e2e.config.ts`.

**Why globalTeardown not afterAll?** `globalTeardown` runs even if tests crash or timeout, making it a more reliable safety net. Individual test cleanup should still happen in tests themselves — this is defense-in-depth.

## Risks / Trade-offs

**[Existing images become orphaned after deploy]** → Old session-ID-tagged images will no longer be cleaned up by normal `docker compose down`. Mitigation: `mason doctor` already detects unused mason images and offers cleanup. Document in release notes.

**[Shared images could serve stale layers]** → If a role's Dockerfile changes between sessions, the old image tag now points to stale content. Mitigation: `docker compose up --build` (which mason uses) always rebuilds, so the image is updated in-place. The tag just avoids creating a *new* image for each session.

**[Signal handler stacking]** → If `registerSessionCleanup` is called multiple times (bug), multiple handlers accumulate. Mitigation: The idempotent `cleanedUp` flag ensures cleanup runs once, and `unregister()` removes specific listeners. Each mode calls register exactly once.

**[Process.exit in signal handler]** → Calling `process.exit(1)` in a signal handler skips any pending I/O. Mitigation: The cleanup function awaits `compose down` before exiting. Any remaining buffered output is best-effort — acceptable for an interrupted session.

## Open Questions

None — the approach is straightforward and builds on existing patterns.
