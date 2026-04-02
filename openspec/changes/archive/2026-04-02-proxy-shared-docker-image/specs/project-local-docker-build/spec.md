## MODIFIED Requirements

### Requirement: Docker build artifacts are materialized to project-local directory

The `docker-init` command SHALL write all docker build artifacts to `{projectDir}/.clawmasons/docker/{role-name}/` instead of `{chapterProject}/docker/`. The directory structure SHALL contain `agent/{agent-type}/` and `credential-service/` subdirectories per role. The per-role proxy subdirectory SHALL contain only `proxy-config.json` (no Dockerfile, no `proxy-bundle.cjs`).

The proxy Dockerfile and `proxy-bundle.cjs` SHALL be written to the shared location `{projectDir}/.clawmasons/docker/mcp-proxy/` (not per-role). This shared directory SHALL be generated once during `mason build`, outside the per-role loop.

#### Scenario: Materialize agent docker artifacts for a claude role
- **WHEN** `docker-init` is run for role "writer" with agent type "claude"
- **THEN** the following files SHALL exist:
  - `{projectDir}/.clawmasons/docker/writer/agent/claude/Dockerfile`
  - `{projectDir}/.clawmasons/docker/writer/agent/claude/workspace/project/.claude/` (materialized role files)
  - `{projectDir}/.clawmasons/docker/writer/mcp-proxy/proxy-config.json`
  - `{projectDir}/.clawmasons/docker/writer/credential-service/Dockerfile`
  - `{projectDir}/.clawmasons/docker/mcp-proxy/Dockerfile` (shared)
  - `{projectDir}/.clawmasons/docker/mcp-proxy/proxy-bundle.cjs` (shared)
- **AND** the following files SHALL NOT exist:
  - `{projectDir}/.clawmasons/docker/writer/mcp-proxy/Dockerfile`
  - `{projectDir}/.clawmasons/docker/writer/mcp-proxy/proxy-bundle.cjs`

#### Scenario: Shared proxy artifacts generated once for multiple roles
- **WHEN** `docker-init` is run for a project with roles "writer" and "reviewer"
- **THEN** exactly one `{projectDir}/.clawmasons/docker/mcp-proxy/Dockerfile` SHALL exist
- **AND** exactly one `{projectDir}/.clawmasons/docker/mcp-proxy/proxy-bundle.cjs` SHALL exist
- **AND** per-role config SHALL exist at `{projectDir}/.clawmasons/docker/writer/mcp-proxy/proxy-config.json` and `{projectDir}/.clawmasons/docker/reviewer/mcp-proxy/proxy-config.json`

#### Scenario: No node_modules in docker build context
- **WHEN** `docker-init` materializes docker artifacts
- **THEN** neither `{projectDir}/.clawmasons/docker/node_modules/` nor any `node_modules/` directory SHALL exist in the docker build context
- **AND** no `package.json` SHALL exist at the docker build context root
