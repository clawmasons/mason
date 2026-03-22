## Context

Mason creates Docker containers, volumes, networks, and images during `mason run`. Over time these accumulate — stopped containers from crashed sessions, dangling images from rebuilds, orphaned volumes, stale networks, and leftover `.mason/sessions/` directories. There is currently no built-in mechanism for users to diagnose or clean up Docker resource sprawl. The existing `docker-utils.ts` has basic compose utilities but nothing for resource inventory or cleanup.

## Goals / Non-Goals

**Goals:**
- Provide a single `mason doctor` command to diagnose Docker resource health and clean up stale resources
- Support two scan modes: full (comprehensive) and quick (safe-only)
- Support an `--auto` flag to skip confirmation prompts for CI/scripted use
- Integrate silent quick+auto cleanup into every `mason run` invocation

**Non-Goals:**
- Docker daemon management (install, upgrade, configure Docker itself)
- Cross-project cleanup (only resources in the current project scope)
- Persistent scheduling or cron-based cleanup
- Monitoring or alerting on resource usage over time

## Decisions

### 1. New standalone command file at `packages/cli/src/cli/commands/doctor.ts`

**Rationale:** Follows existing command pattern — one file per command with a `registerDoctorCommand(program)` export and a testable `runDoctor()` function. Keeps the command self-contained.

**Alternative considered:** Adding cleanup logic to `docker-utils.ts`. Rejected because the doctor command has its own CLI options, scan logic, and user interaction — it's a command, not a utility.

### 2. Resource scanning via Docker CLI commands, not Docker API

**Rationale:** The codebase already uses `execSync`/`spawn` for Docker CLI (`docker compose version`, etc.). Using `docker ps`, `docker images`, `docker volume ls`, `docker network ls`, and `docker system df` keeps the approach consistent and avoids adding a Docker API client dependency.

### 3. Two-mode scanning architecture

- **Full mode** scans: running containers, stopped containers, dangling images, unused volumes, unused networks, build cache, disk usage, orphaned session dirs. Prompts before cleanup.
- **Quick mode** scans: stopped containers, dangling images, orphaned session dirs only. These are always safe to remove.

**Rationale:** Full mode gives comprehensive visibility. Quick mode is fast and safe enough for automated use in `mason run`.

### 4. Cleanup uses Docker's built-in prune commands

- Containers: `docker rm` for stopped mason containers
- Images: `docker image prune` for dangling
- Volumes: `docker volume rm` for unused mason volumes
- Networks: `docker network rm` for unused mason networks
- Full prune: `docker system prune` for comprehensive cleanup

**Rationale:** Docker's prune is well-tested and handles edge cases. We filter to mason-specific resources where possible (by label or naming convention) to avoid removing non-mason resources.

### 5. Mason resource identification by naming convention

Mason containers, volumes, and networks are created by docker-compose with project-name-based prefixes. The doctor command will identify mason resources by matching against known naming patterns from the compose files and `.mason/` directory structure.

### 6. Integration into `mason run` via exported function

The `runDoctor` function (or a dedicated `quickAutoCleanup()` helper) will be imported by `run-agent.ts` and called at the start of execution. This avoids shelling out to `mason doctor` as a subprocess.

**Alternative considered:** Running `mason doctor --quick --auto` as a child process. Rejected for unnecessary overhead and startup cost on every run.

### 7. Orphaned session detection by checking for running containers

A `.mason/sessions/<id>/` directory is orphaned if its corresponding docker-compose services are not running. The doctor scans session dirs and checks container status to identify orphans.

## Risks / Trade-offs

- **[Risk] Removing resources from concurrent sessions** → Mitigation: Quick mode only removes stopped containers and orphaned sessions. Full mode prompts for confirmation. The `--auto` flag in `mason run` only uses quick mode.
- **[Risk] Docker CLI availability** → Mitigation: `checkDockerCompose()` already validates Docker. Doctor will fail gracefully with a clear error if Docker is unavailable.
- **[Risk] Slow scan on systems with many Docker resources** → Mitigation: Quick mode minimizes the number of Docker CLI calls. Full mode is opt-in and interactive.
- **[Trade-off] Filtering to mason-only resources vs system-wide prune** → We filter where possible but some prune commands (like `docker system prune`) are system-wide. Full mode makes this clear in its prompt.
