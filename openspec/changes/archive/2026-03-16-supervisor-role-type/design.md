## Context

Roles are the unit of configuration in mason. Today all roles behave identically: tasks, skills, and apps are materialized into the project workspace (`.claude/` inside `/home/mason/workspace/project/`), and the agent always launches with `WORKDIR /home/mason/workspace/project`. This means the agent automatically loads project-specific configuration and context.

A supervisor role needs to operate at a broader scope—managing projects, auditing configurations, bootstrapping workspaces—without being "captured" by the project context under its feet. The fix is two-pronged: materialize supervisor config into the agent's home directory instead of the project workspace, and launch the agent from the workspace root so Claude Code never auto-loads the project `.claude/` directory.

The existing `roleSchema` has a `source.type` field (`"local"` | `"package"`) for the source of the role file. We are adding a distinct top-level `type` field (`"project"` | `"supervisor"`) that controls runtime behavior. These are orthogonal concerns.

## Goals / Non-Goals

**Goals:**
- Add `type` field to `roleSchema` with values `"project"` (default) and `"supervisor"`
- Supervisor roles materialize tasks/skills/apps to `~/.claude/` and MCP servers to `~/.claude.json` inside the container
- Supervisor agents launch from `/home/mason/workspace` (not `/home/mason/workspace/project`)
- Dev-container `workspaceFolder` label updated to `/home/mason/workspace` for supervisor roles
- Zero behavior change for `"project"` roles (field defaults to `"project"`)

**Non-Goals:**
- Changing how project files are mounted or the project directory structure
- Adding new supervisor-specific fields beyond `type`
- Modifying how credentials or proxy tokens work
- Changing how `mason package` bundles roles

## Decisions

### 1. Field name: `type` on top-level `roleSchema`

The top-level field is named `type` (giving `role.type`), not `roleType`. The existing `source.type` is nested and accessed as `role.source.type`, so there is no naming collision in TypeScript. `role.type` reads naturally at the call site.

**Alternatives considered**: `roleType` (redundant given it's on the `Role` object), `mode` (less expressive), `scope` (ambiguous).

### 2. Materialization target for supervisor roles

Supervisor roles write their materialized files directly into the container home (`/home/mason/`) rather than the workspace. Concretely:
- Tasks, skills, commands → `/home/mason/.claude/` (mapped from `~/.claude/` in the materializer)
- MCP server config, apps → `/home/mason/.claude.json`

The `claude-code` materializer detects `role.type === "supervisor"` and switches the output path prefix from `workspace/project/` to the home-relative path. The Dockerfile build pipeline (`docker-generator.ts`) routes files with the `supervisor` type to `{agentDir}/build/home/` instead of `{agentDir}/build/workspace/project/`, and mounts them into `/home/mason/` via Docker volume.

**Alternatives considered**: A separate "supervisor materializer" — rejected as overkill; the existing claude-code materializer can branch on type cleanly.

### 3. Working directory: `/home/mason/workspace` for supervisor roles

Claude Code auto-loads `.claude/` from the working directory when it starts. By setting `WORKDIR /home/mason/workspace` in the Dockerfile (instead of `/home/mason/workspace/project`) the agent no longer auto-loads project-local configuration. The project is still mounted at `/home/mason/workspace/project` and fully accessible to the agent.

`agent-launch.json` is already mounted at `/home/mason/workspace/agent-launch.json` (not under `/project`), so its discovery via `process.cwd()` continues to work correctly from the workspace root.

**Alternatives considered**: A separate Dockerfile per role type — rejected; the WORKDIR change is the minimal surgical fix. Passing `--no-project` to Claude Code — not a stable CLI flag and brittle.

### 4. Dev-container `workspaceFolder` label

The `LABEL devcontainer.metadata` in the agent Dockerfile is currently hardcoded to `"/home/mason/workspace/project"`. For supervisor roles this must become `"/home/mason/workspace"`.

The `agent-dockerfile.ts` generator already receives the `Role` at build time, so it can branch on `role.type` when writing the label value.

### 5. Passing `role.type` through the build pipeline

`role.type` is available on the `Role` object from `@clawmasons/shared`. All sites that need to branch (`agent-dockerfile.ts`, `docker-generator.ts`, `claude-code` materializer) already receive `role` as a parameter, so no new data-passing plumbing is required.

## Risks / Trade-offs

- **Existing roles silently upgraded**: adding a defaulted field to `roleSchema` is safe; all existing roles parse as `type: "project"` with no code changes needed. Risk is negligible.
- **Two mount targets**: routing supervisor files to `build/home/` adds a new build output directory and a new Docker volume mount. The docker-generator logic is already branched on file destination (workspace vs. home for `agent-launch.json`), so the extension is localized.
- **IDE attach path**: VSCode dev-container attach follows `workspaceFolder` from the label. If a user attaches a supervisor agent they'll land at `/home/mason/workspace`; the project subdirectory is one level down. This is the intended experience.

## Migration Plan

1. Add `type` field to `roleSchema` in `packages/shared` (default `"project"`). All existing roles continue working unchanged.
2. Update `agent-dockerfile.ts` to branch on `role.type` for `workspaceFolder` label and `WORKDIR`.
3. Update `claude-code` materializer to route files to home prefix when `role.type === "supervisor"`.
4. Update `docker-generator.ts` to route supervisor files to `build/home/` and create the correct volume mount.
5. No migration needed for stored roles or packaged agents — the default handles backward compatibility.

## Open Questions

- Should a supervisor role still receive a copy of the project's `agent-launch.json`? Currently yes (it's at the workspace root). If a supervisor needs to remain completely unaware of the project runtime, the launch JSON could be omitted or emptied for supervisor roles. Decision deferred to implementation.
- Should `mason run` warn or confirm when launching a supervisor role in a project context, since the role won't auto-load project config?  mason run should print out a summary unless in acp mode of the role and type of role it is running at.
