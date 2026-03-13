## Context

The `run-agent` pipeline currently depends on `CLAWMASONS_HOME` (`~/.clawmasons`) for role lookup via `chapters.json` and lodge resolution via `config.json`. This global state was designed for multi-chapter orchestration but creates unnecessary coupling for the run path, which only needs the project directory.

Key observations from the current codebase:
- **ACP mode already uses project-local role discovery** (`discoverRoles()` + `resolveRole()` from `packages/shared/src/role/discovery.ts`) — interactive mode is the laggard.
- Session state (`.clawmasons/sessions/`), project config (`.clawmasons/chapter.json`), and sentinel files are already project-local.
- The `chapters.json` global registry is the primary coupling point — `findRoleEntryByRole()` in `home.ts` is used by interactive mode to locate docker build paths.
- Docker build artifacts currently live in `<chapter-project>/docker/` and are referenced via `chapter.json`'s `docker-build` field — this indirection will be removed.

## Goals / Non-Goals

**Goals:**
- Run-agent pipeline works entirely from `{project}/.clawmasons/` — no CLAWMASONS_HOME reads or writes in the run path
- Role discovery unified across interactive and ACP modes using the existing `discoverRoles()` / `resolveRole()` system
- Docker build artifacts materialized to `{project}/.clawmasons/docker/{role-name}/` with agent and mcp-proxy subdirectories
- Sessions rooted at `{project}/.clawmasons/sessions/{session-id}/`
- Remove dead commands that depend on the global home: `lodge-init`, `remove`, `run-acp-agent` (empty), and `init-role` (registers in global chapters.json)
- Keep `add.ts` (pure npm wrapper) and `build.ts` (already local discovery)
- Remove init-lodge and CLAWMASONS_HOME entirely
**Non-Goals:**
- Changing the monorepo/npm publishing workflow
- Changing the materializer interface (`RuntimeMaterializer`) — only the output paths change
- Backward compatibility shims for the old `chapters.json` registry in the run path (this is a clean break)

## Decisions

### 1. Eliminate `chapters.json` from the run path entirely

**Decision**: Don't migrate the registry — remove it. Use `discoverRoles()` + `resolveRole()` directly.

**Rationale**: ACP mode already proves this works. The registry was a caching layer for role→docker-build path mapping, but with docker artifacts now project-local, there's nothing to cache. Discovery is fast (filesystem scan of known agent directories + node_modules check).

**Alternative considered**: Migrate `chapters.json` to `.clawmasons/role-registry.json`. Rejected because it adds state management complexity for no benefit when discovery is deterministic.

### 2. Docker build artifacts at `{project}/.clawmasons/docker/{role-name}/`

**Decision**: Materializers write directly to the project-local docker directory.

```
{project}/.clawmasons/docker/{role-name}/
├── agent/
│   └── {agent-type}/
│       ├── Dockerfile
│       └── workspace/
│           └── project/
│               └── .claude/          # Materialized role files
│                   ├── settings.json
│                   ├── CLAUDE.md
│                   ├── skills/
│                   └── commands/
├── proxy/
│   ├── Dockerfile
│   └── config.json
└── credential-service/
    └── Dockerfile
```

**Rationale**: Keeps the existing `docker-generator.ts` structure but roots it project-locally. The materializer receives a `RoleType` with resolved dependencies and writes workspace files. Dockerfiles install role packages at build time via `npm install` in the Dockerfile (packages are already available from the chapter build step in `docker/node_modules/`).

**Alternative considered**: Flatten to `{role-name}/Dockerfile` without agent subdirectory. Rejected because a role may be materialized for different agent types (e.g., a `.claude` role running in codex for docker).

### 3. Project directory resolution: `process.cwd()` or ACP `session/new` cwd

**Decision**: No config file lookup. Interactive mode uses `process.cwd()`. ACP mode uses the `cwd` field from the `session/new` request.

**Rationale**: Simplest possible approach. The project directory is always known at invocation time. No need for `.clawmasons/chapter.json`'s `docker-build` indirection — the docker directory is deterministically at `{projectDir}/.clawmasons/docker/`.

### 4. Materializer receives full `RoleType` with dependencies

**Decision**: The `materializeForAgent()` call receives a `RoleType` object that includes the role definition and all its dependency roles (tools, skills, commands). The materializer resolves these into workspace files.

**Rationale**: The materializer shouldn't need to do its own discovery. The caller (run-agent pipeline) resolves the role and its dependency graph, then hands the complete picture to the materializer.

### 5. Agent type inference from role, with optional override

**Decision**: Agent type is inferred from the role's source directory (e.g., `.claude/roles/foo/` → agent type `claude`). The `--agent-type` flag remains as an optional override for cases where the docker agent differs from the role's source agent (e.g., a `.claude` role running via `codex` in the container).

**Rationale**: Removes the positional `<agent-type>` argument (breaking change) while preserving flexibility. Most users never need the override.

### 6. Commands to remove vs. keep

| Command | Action | Reason |
|---------|--------|--------|
| `lodge-init` | Remove | Creates `~/.clawmasons/<lodge>/` — no longer needed in run path |
| `remove` | Remove | Removes from global chapters.json registry |
| `run-acp-agent` | Remove | Empty file, dead code |
| `init-role` | Remove | Registers in global chapters.json — replaced by project-local discovery |
| `add` | Keep | Pure npm wrapper, no CLAWMASONS_HOME dependency |
| `build` | Keep/Refactor | Already uses local discovery; refactor to output to `.clawmasons/docker/` |
| `run-init` | Refactor | Simplify — no longer needs to write `chapter.json` with global docker-build path |
| `docker-init` | Refactor | Populate `.clawmasons/docker/node_modules/` instead of `<chapter>/docker/` |

## Risks / Trade-offs

**[Breaking change: `<agent-type>` positional arg removed]** → Document in changelog. Users must switch to `--agent-type` flag or rely on inference. Migration is straightforward.

**[Docker rebuild on every run if no caching]** → Materializers should check if workspace files have changed before regenerating. Docker layer caching handles Dockerfile rebuilds efficiently. First-run will be slower but subsequent runs hit cache.

**[Multiple roles in same project compete for `.clawmasons/docker/`]** → Not a conflict — each role gets its own subdirectory (`{role-name}/`). Multiple roles can coexist.

**[Loss of global role registry breaks `clawmasons list` across projects]** → Acceptable trade-off. The global registry was never reliable (stale entries from moved/deleted projects). Per-project discovery is the source of truth.

**[Existing projects with `chapter.json` pointing to old docker paths]** → `run-init` refactoring should handle migration or the old `chapter.json` can be ignored since the run pipeline no longer reads it.

## Open Questions

- Should `build` and `docker-init` be merged into a single command since they're tightly coupled in the new flow?  Yes - merge into docker init and use it
- How should the run command handle the case where docker artifacts don't exist yet — auto-build, or require explicit `build` first?  auto-build or docker-init
- Should `.clawmasons/docker/` be gitignored by default (generated artifacts) or tracked (reproducible builds)? gitignored since it can be easily generated from the role
