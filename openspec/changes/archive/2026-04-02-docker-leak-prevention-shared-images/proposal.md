## Why

After a Docker reboot, orphaned mason resources (containers, networks, ~1.6GB of duplicate images) were found from a single prior session. Two root problems exist: (1) signal handlers and error-path cleanup are missing in 3 of 4 run modes, causing Docker resource leaks on interruption or failure; (2) every session builds its own ~600MB-1GB images even when the Dockerfile content is identical, because the session ID is baked into the image tag.

## What Changes

- **Signal-handler cleanup**: Add a shared `registerSessionCleanup` helper that installs SIGINT/SIGTERM handlers and ensures `docker compose down` runs on all exit paths (normal, signal, error) across all 4 run modes (interactive, JSON, print, dev-container)
- **Error-path cleanup**: Wire catch blocks in all modes to run Docker teardown before `process.exit(1)`
- **Dev-container handler consolidation**: Replace the ad-hoc `process.once` signal handlers in dev-container mode with the shared mechanism
- **Stable image naming**: Remove session ID from Docker image tags, using `mason-{projectHash}-{role}-{agent}` instead of `mason-{projectHash}-{sessionId}-agent-{role}-{agent}`, so identical roles share a single cached image across sessions
- **E2E test safety net**: Add a vitest `globalTeardown` that prunes stopped mason containers and unused mason networks after test runs

## Capabilities

### New Capabilities

- `session-cleanup`: Shared signal-handler and error-path cleanup mechanism that ensures Docker resources (containers, networks, volumes) are torn down on all exit paths across all run modes

### Modified Capabilities

- `docker-compose-generation`: Image naming convention changes from session-scoped to project+role+agent-scoped tags
- `run-command`: All 4 run modes gain signal handler registration and error-path cleanup wiring
- `e2e`: Add globalTeardown to prune orphaned Docker resources after test runs

## Impact

- **Code**: `run-agent.ts` (new helper + wiring in 4 mode functions), `docker-generator.ts` (image naming), `vitest.e2e.config.ts` (globalTeardown reference), new `global-teardown.ts` file
- **Docker**: Existing images with session-ID-based names become orphaned after this change (cleaned up by `mason doctor`)
- **Disk**: Significant reduction in disk usage for repeated sessions of the same role (~600MB-1GB saved per duplicate)
- **Breaking**: None -- container/network names are unchanged, only image tags change
