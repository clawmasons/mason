## Context

The `container.packages` block in ROLE.md frontmatter supports three package managers: `apt`, `npm`, and `pip`. Only `apt` has a working end-to-end path. `npm` is parsed and schema-validated but silently dropped — `ResolvedRole` has no `npmPackages` field, the adapter doesn't map it, and `generateAgentDockerfile` emits nothing for it.

Additionally, the Dockerfile generation is cached by file existence: `run-agent.ts` skips regeneration if `{buildDir}/{agentType}/Dockerfile` already exists. This means adding or changing `container.packages` after an initial run silently produces a stale Dockerfile. Users must know to pass `--build` to force regeneration — there is no automatic invalidation.

Current flow for apt (working):
```
ROLE.md container.packages.apt
  → containerRequirementsSchema (parsed + validated)
  → role.container.packages.apt
  → adapter: resolvedRole.aptPackages
  → generateAgentDockerfile: RUN apt-get install ...
```

Current flow for npm (broken — drops silently):
```
ROLE.md container.packages.npm
  → containerRequirementsSchema (parsed + validated)
  → role.container.packages.npm
  → adapter: (nothing)
  → generateAgentDockerfile: (nothing)
```

## Goals / Non-Goals

**Goals:**
- Wire `container.packages.npm` end-to-end so globally-declared npm packages are installed in the agent container via `npm install -g`
- Auto-invalidate the Mason build directory when `container.packages` changes, so users don't silently get stale Dockerfiles
- Match the existing `aptPackages` pattern: both role-level and agent-level (`DockerfileConfig`) npm declarations merged and deduplicated

**Non-Goals:**
- `pip` packages — same gap exists but no role uses it yet; deferring to avoid scope creep
- Rebuilding the Docker image itself (not just the Dockerfile/build dir) — that remains the user's responsibility or `--build` flag behavior
- Package version pinning or lockfiles for npm global installs

## Decisions

### 1. npm install placement in Dockerfile — after apt, before user creation

The `npm install -g` step should run as root (before `USER mason`) and after any apt packages are installed, since some npm packages (e.g. those with native bindings) depend on system libraries. This mirrors where `aptInstallStep` is placed today.

**Alternative considered:** Running as `mason` user with a user-scoped install (`npm install -g --prefix /home/mason`). Rejected — global installs under root are simpler, consistent with how `claude-code-agent` installs work, and avoid PATH complexity.

### 2. Hash-based invalidation stored in build directory

Store a SHA-256 hash of the serialized `container.packages` object as `.packages-hash` in `{buildDir}/{agentType}/`. On each `mason run`, recompute the hash and compare. If it differs (or the file is missing), delete the build directory and regenerate.

This is scoped to `container.packages` only — not the full ROLE.md — to avoid spurious rebuilds from instruction text edits.

**Alternative considered:** Hash the entire ROLE.md file. Rejected — would trigger rebuilds on any text change (e.g. editing the instructions body), which is expensive and surprising.

**Alternative considered:** Always regenerate the Dockerfile without deleting the build dir. Rejected — the build dir contains a `node_modules/` copy that's expensive to reproduce; we only want to regenerate when packages actually changed.

### 3. `npmPackages` on `ResolvedRole` and `DockerfileConfig` — mirrors `aptPackages`

Add `npmPackages?: string[]` to both `ResolvedRole` (in shared types) and `DockerfileConfig` (in agent-sdk). The Dockerfile generator merges `[...dockerfileConfig?.npmPackages, ...role.npmPackages]` with deduplication, identical to the existing `aptPackages` merge.

**Alternative considered:** A single unified `packages` map on `ResolvedRole`. Rejected — the `aptPackages` field is already established in the type; changing its shape would be a breaking change.

## Risks / Trade-offs

- **Hash invalidation adds I/O on every `mason run`**: Reading and writing a small hash file on each run is negligible overhead. → Acceptable.
- **Global npm install ordering**: If npm packages have transitive peer deps that depend on apt packages, ordering (apt first, npm second) must be maintained. Current design preserves this. → No mitigation needed beyond the placement decision above.
- **Stale Docker image after Dockerfile change**: Regenerating the Dockerfile doesn't automatically rebuild the Docker image. Users still need to rebuild their Docker image (docker compose build or `--build`). → Document in output: Mason will log when a stale hash is detected and a rebuild is triggered.

## Migration Plan

1. No schema migrations — additive changes to `ResolvedRole` and `DockerfileConfig` (both optional fields)
2. Existing build directories without `.packages-hash` will be treated as stale on the next run (hash file missing → rebuild triggered). This is the correct behavior: the first run after upgrading will regenerate the Dockerfile, which ensures packages are picked up.
3. Rollback: revert the `run-agent.ts` hash check; old behavior (existence-only check) resumes.

## Open Questions

- Should `pip` packages be included in scope? Currently deferred — revisit if a role adds `container.packages.pip` before this ships.
