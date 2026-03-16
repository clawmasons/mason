## Why

Roles currently only support a single mode: materializing agent configuration into a project directory. A new `supervisor` role type is needed for agents that operate at a global scope—setting up projects, auditing configurations, or running maintenance tasks—without loading the project-specific agent configuration into their context.

## What Changes

- Add a `type` field to the `Role` schema with values `"project"` (default, existing behavior) and `"supervisor"` (new).
- Supervisor roles materialize to the agent's home directory (`~/.claude/`, `~/.claude.json`) rather than the project workspace directory.
- Supervisor roles run with the workspace directory (e.g. `/home/mason/workspace/`) as the working directory instead of the project directory, so project-specific `/home/mason/workspace/project.claude/` config is not auto-loaded by the agent runtime.
- The project's `.claude/` folder is still present and accessible on disk; the role designer can choose to ignore it or reference it explicitly.
- Dev-container `LABEL` and URL must be updated to reflect the workspace-level launch path for supervisor agents.
- The terminal/ACP `agent-entry` launch path must be updated to start supervisor agents from the workspace directory instead of the project directory.
- MCP servers and apps for supervisor roles are written to `~/.claude.json` (home-scoped) rather than the project-local config.

## Capabilities

### New Capabilities
- `supervisor-role-type`: Defines the `type` field on the `Role` schema (`"project"` | `"supervisor"`), the materialization path differences for supervisor roles, and the working-directory behavior for agent launch.

### Modified Capabilities
- `role-core-type-system`: Add `type` field (`"project"` | `"supervisor"`, default `"project"`) to `roleSchema` and `Role` TypeScript type.
- `agent-home-materializer`: Supervisor roles use home materialization as the *primary* output path (tasks, skills, apps go to `~/.claude/`; MCP servers go to `~/.claude.json`) rather than the project workspace.
- `dev-container-start`: When running a supervisor role, the dev-container LABEL and remote workspace URL must point to the workspace root, not the project subdirectory.
- `agent-entry-package`: When launching a supervisor role, `agent-entry` must set the working directory to the workspace root (e.g. `/home/mason/workspace`) instead of the project path so that project-local `.claude/` config is not auto-loaded.

## Impact

- `packages/shared`: `roleSchema` and `Role` type gain a `type` field.
- `packages/cli` (or `packages/agent-sdk`): Materialization logic branches on `role.type`; supervisor roles write to home paths and skip project-workspace materialization.
- `packages/agent-entry`: Launch working directory changes for supervisor roles.
- Dev-container compose/Dockerfile generation: LABEL and workspace URL updated for supervisor roles.
- Existing `"project"` roles: no behavior change (field defaults to `"project"`).
