## Why

Agents running in containers need host configuration to behave like the user's local environment. Currently, the container's `/home/mason` is mostly empty at build time and only receives credentials at runtime via the credential service. This means agents lack the rich config that makes them effective — no settings, no plans, no skills, no project-specific context. Additionally, the `mason` user is created with arbitrary UID/GID, causing permission mismatches when bind-mounting host directories.

## What Changes

- **New: Agent home materialization (generic framework)** — Each agent materializer gains a `materializeHome()` method that populates `{projectDir}/.mason/docker/{role}/{agent}/home/` with agent-specific host config. Different agent types copy different files — the materializer drives what goes into the home directory. This directory gets mounted as `/home/mason` in the container.
- **New: Claude-code home materialization** — The claude-code materializer copies these specific host files/dirs into the agent home:
  - `~/.claude/statsig/` — feature flags and experiment state
  - `~/.claude/projects/` — project-specific context, with path transformation: take current project Dir and flatten `/` to `-`, then remove all other project dirs except the current project dir with that flattened path, finally rename it to `-home-mason-workspace-project` to match the container mount path
  - `~/.claude/settings.json` — user settings
  - `~/.claude/stats-cache.json` — stats cache
  - `~/.claude/plans/` — saved plans
  - `~/.claude/plugins/` — installed plugins
  - `~/.claude/skills/` — custom skills
  - `~/.claude.json` — top-level claude config (copied to `home/.claude.json`)
- **New: Build-time home backup in Dockerfile** — Dockerfiles copy `/home/mason` to `/home/mason-from-build` so OS-created files (`.bashrc`, `.profile`, etc.) survive the home mount overlay.
- **New: Runtime home merge in agent-entry** — On container start, `agent-entry` copies `/home/mason-from-build/*` into the now-mounted `/home/mason`, preserving both build-time OS files and host-materialized config. Then proceeds with existing credential fetching.
- **BREAKING: Host UID/GID matching** — The `mason` user is created with the host user's UID/GID (passed as build args `HOST_UID`/`HOST_GID`) instead of system-assigned values. This fixes bind-mount permission issues.  do not worry about about backwards compatibility
- **Unchanged: Credential flow** — `security.CLAUDE_CODE_CREDENTIALS` continues to be handled by the credential service at runtime (written into the mounted home directory), unchanged from current behavior.

## Capabilities

### New Capabilities
- `agent-home-materializer`: Generic framework for agent home materialization. Each agent materializer implements what host config to copy into `home/`. Includes the claude-code implementation that copies `~/.claude/` config (statsig, projects with path transforms, settings, plans, plugins, skills) and `~/.claude.json`.
- `agent-entry-home-merge`: Runtime merge of `/home/mason-from-build` into mounted `/home/mason` before credential setup and agent launch. Applies to all agent types.

### Modified Capabilities
- `agent-dockerfile`: Dockerfiles add `ARG HOST_UID/HOST_GID`, create `mason` user with matching IDs, and copy `/home/mason` to `/home/mason-from-build` before the mount point is used. Applies to all agent types.
- `docker-compose-generation`: Compose files mount the materialized `home/` directory as `/home/mason` in agent containers. Applies to all agent types.

## Impact

- **Packages affected**: `cli` (materializer interface, claude-code materializer, dockerfile generator, docker-compose generator), `agent-entry` (home merge logic)
- **Materializer interface**: New `materializeHome()` method on the materializer interface — each agent type implements its own version. `mcp-agent` can start with a no-op and add home files later as needed.
- **Build flow**: `--build` now runs home materialization alongside existing workspace materialization
- **Docker images**: All agent Dockerfiles change (user creation with UID/GID, home backup step)
- **Compose files**: Agent service gains a new volume mount for the home directory
- **File permissions**: Host UID/GID matching ensures mounted files are readable/writable by the container's `mason` user
- **No credential changes**: Runtime credential flow via MCP proxy remains unchanged
