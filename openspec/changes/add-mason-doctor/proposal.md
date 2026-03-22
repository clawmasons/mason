## Why

Mason creates Docker containers, volumes, networks, and images during agent runs. Over time these accumulate — stopped containers from crashed sessions, dangling images from rebuilds, orphaned volumes, stale networks. Users have no visibility into this and no easy way to clean up. `mason doctor` gives a single command to diagnose Docker health and clean up everything.

Additionally, lightweight cleanup should happen automatically. `mason run` invokes doctor's quick+auto cleanup on every start — removing obviously stale resources without user intervention.

## What Changes

- Add `mason doctor` CLI command with two scan modes and an auto flag:
  - **Full mode** (default): comprehensive scan and report of all Docker resources — running/stopped containers, dangling images, unused volumes, unused networks, build cache size, disk usage, orphaned Mason sessions. Prompts user to confirm cleanup. On confirmation: stops all containers, prunes all stale resources, cleans orphaned session dirs, optionally restarts Docker
  - **`--quick` mode**: scans only obviously safe-to-remove resources — stopped containers, dangling images, orphaned `.mason/sessions/` directories. Reports findings and prompts user to confirm cleanup
  - **`--auto` flag**: skips confirmation prompts in either mode — executes cleanup immediately. Combinable with both full and quick
- `mason run` calls doctor `--quick --auto` functionality at the start of every invocation for silent housekeeping

## Capabilities

### New Capabilities
- `doctor-command`: CLI command `mason doctor` that diagnoses Docker health, reports resource status, and performs interactive cleanup with optional Docker restart. Supports `--quick` (safe-only scan), `--auto` (skip prompts), and combinations thereof

### Modified Capabilities
- `run-command`: Calls doctor quick+auto cleanup at the start of every `mason run` invocation to automatically remove obviously stale resources

## Impact

- New file: `packages/cli/src/cli/commands/doctor.ts`
- Modified file: `packages/cli/src/cli/commands/index.ts` (register command)
- Modified file: `packages/cli/src/cli/commands/run-agent.ts` (call quick+auto cleanup on start)
- Dependencies: uses existing `docker-utils.ts` patterns, Docker CLI (`docker system df`, `docker ps`, `docker network ls`, `docker volume ls`, `docker image ls`, `docker system prune`)
- No breaking changes to existing commands or APIs
