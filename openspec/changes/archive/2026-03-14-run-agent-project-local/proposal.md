## Why

The current `run-agent` command depends on `CLAWMASONS_HOME` (~/.clawmasons) for chapter registry, docker build artifacts, and session state. This creates unnecessary coupling to a global home directory when the CLI's sole concern should be the project directory. The command should work entirely within the project's `.clawmasons/` directory — finding roles locally or from npm packages, building docker artifacts, and managing sessions all project-locally.

## What Changes

- **BREAKING**: Remove `CLAWMASONS_HOME` dependency from the run-agent pipeline. No more `~/.clawmasons`, `chapters.json`, lodge resolution, or `home.ts` runtime module usage in the run path.
- we will continue to allow the user to specify the agent type in the command because they may want to run a different agent in the docker container than is setup
- Simplify role discovery to two sources: local project roles (`{agent}/roles/{role-name}/ROLE.md`) and npm packages (role names starting with `@` resolve from `node_modules`).
- Move docker build artifacts to `{project}/.clawmasons/docker/{role-name}/` with agent and mcp-proxy subdirectories.
- Move session state to `{project}/.clawmasons/sessions/{session-id}/` with logs and docker-compose.yaml.
- Project directory resolved via `process.cwd()` (interactive) or ACP `session/new` cwd field.
- Materialization still produces the full docker structure (agent Dockerfile + workspace, mcp-proxy Dockerfile + config), but rooted in the project's `.clawmasons/docker/` directory.  But the design is different:


agent materializer should be given a ROLE_TYPES with the role and all of its dependencies

note - you may have your roles defined in .claude, but this might materialize to codex for docker run.

Files will be copied during materialization
```
<docker-role-build-dir>/claude/Dockerfile
<docker-role-build-dir>/claude/workspace/project/.claude
<docker-role-build-dir>/claude/workspace/project/.claude/skills
<docker-role-build-dir>/claude/workspace/project/.claude/commands
```
Dockerfile should install all the packages at build time




#### materialize the role's mcp-proxy Dockerfile
materializer should be given a structure with the role and all of its dependencies

```
{docker-role-build-dir}/mcp-proxy/Dockerfile
{docker-role-build-dir}/mcp-proxy/config.json
```
#### create {session-dir}
	`~/projects/cool-app/.clawmasons/sessions/{session-id}`

#### create docker-files.yaml

using {docal-docker-role-build-dir}  to reference Dockerfiles for bhte services

.clawmasons/sessions/{session-id}/logs
.clawmasons/sessions/{session-id}/docker-compose.yaml

docker compose should mount this project direictory

- Dockerfile installs all role packages at build time.
- Docker-compose mounts the project directory into the container.
- Monorepo generation (publishing roles as npm packages) is preserved but not a primary concern of the run command.

## Capabilities

### New Capabilities

- `project-local-docker-build`: Materialization of agent and mcp-proxy Dockerfiles into `{project}/.clawmasons/docker/{role-name}/`, including workspace file copying, Dockerfile generation, and package installation at build time.
- `project-local-session`: Session lifecycle management rooted in `{project}/.clawmasons/sessions/{session-id}/` — docker-compose.yaml generation, log directory creation, and project directory mounting.

### Modified Capabilities

- `unified-role-discovery`: Simplified to project-local only. Two resolution paths: local roles from `{agent}/roles/{role-name}/ROLE.md` (agent type inferred from directory), and packaged roles from `node_modules` when role name starts with `@`. No more CLAWMASONS_HOME scanning or chapters.json lookup.
- `run-command`: Remove agent-type positional arg. Remove CLAWMASONS_HOME dependency. Agent type inferred from role. Project dir from cwd. Docker build and session dirs moved to project-local `.clawmasons/`.
- `acp-session`: Session directory moves from CLAWMASONS_HOME-relative to `{project}/.clawmasons/sessions/{session-id}/`. Docker-compose references project-local docker build directory. Project directory mounted into containers.

## Impact

- **CLI commands**: `run-agent.ts` loses the `<agent-type>` positional argument — breaking change for all callers.
- **Runtime module**: `home.ts` functions (`getClawmasonsHome`, `resolveLodgeVars`, `findRoleEntryByRole`, `upsertRoleEntry`) no longer used in the run path. May remain for other commands (e.g., `init`).
- **Role discovery**: `packages/shared/src/role/discovery.ts` simplified — remove home-directory scanning, keep project-local + node_modules paths.
- **Materializers**: Output paths change from CLAWMASONS_HOME-relative to project `.clawmasons/docker/{role}/`. The materializer interface itself doesn't change, just where outputs are written.
- **Docker generation**: `docker-generator.ts` and `agent-dockerfile.ts` paths updated. Compose file references local build contexts.
- **ACP session**: `packages/cli/src/acp/session.ts` session directory resolution changes.
- **Monorepo generation**: Unaffected — it's a separate publish workflow.

Remove chapter specific commands
  -add.ts
  -build.ts
  - docker utilities init-role run-init should be kept as appropriate (refactored ) for building docker directories in project/.clasmasons per the above design
  - remove lodge-init
  - remove "remove"
  - remove empty run-acp-agent.tx
  
Check all commands to see if they are still relevant