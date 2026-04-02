## MODIFIED Requirements

### Requirement: Docker build artifacts are materialized to project-local directory

The `docker-init` command SHALL write all docker build artifacts to `{projectDir}/.clawmasons/docker/{role-name}/` instead of `{chapterProject}/docker/`. The directory structure SHALL contain `agent/{agent-type}/`, `proxy/`, and `credential-service/` subdirectories. The proxy subdirectory SHALL contain `proxy-bundle.cjs` and `proxy-config.json` instead of `package.json` and `node_modules/`.

#### Scenario: Materialize agent docker artifacts for a claude role
- **WHEN** `docker-init` is run for role "writer" with agent type "claude"
- **THEN** the following files SHALL exist:
  - `{projectDir}/.clawmasons/docker/writer/agent/claude/Dockerfile`
  - `{projectDir}/.clawmasons/docker/writer/agent/claude/workspace/project/.claude/` (materialized role files)
  - `{projectDir}/.clawmasons/docker/writer/proxy/Dockerfile`
  - `{projectDir}/.clawmasons/docker/writer/proxy/proxy-bundle.cjs`
  - `{projectDir}/.clawmasons/docker/writer/proxy/proxy-config.json`
  - `{projectDir}/.clawmasons/docker/writer/credential-service/Dockerfile`

#### Scenario: No node_modules in docker build context
- **WHEN** `docker-init` materializes docker artifacts
- **THEN** neither `{projectDir}/.clawmasons/docker/node_modules/` nor any `node_modules/` directory SHALL exist in the docker build context
- **AND** no `package.json` SHALL exist at the docker build context root
