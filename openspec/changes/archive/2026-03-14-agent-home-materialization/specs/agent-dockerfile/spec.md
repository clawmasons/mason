## MODIFIED Requirements

### Requirement: Agent Dockerfile creates mason user with host UID/GID

The `generateAgentDockerfile()` function SHALL emit `ARG HOST_UID=1000` and `ARG HOST_GID=1000` build args, and create the `mason` user and group with those IDs:
```dockerfile
ARG HOST_UID=1000
ARG HOST_GID=1000
RUN groupadd -g $HOST_GID mason && useradd -m -u $HOST_UID -g $HOST_GID mason
```

The `-r` (system user) flag SHALL be removed. Default values of 1000 provide a fallback when build args are not explicitly passed.

#### Scenario: Dockerfile with default UID/GID
- **WHEN** `generateAgentDockerfile()` is called without explicit HOST_UID/HOST_GID build args
- **THEN** the Dockerfile SHALL create mason with UID=1000 and GID=1000

#### Scenario: Dockerfile with custom UID/GID
- **WHEN** the image is built with `--build-arg HOST_UID=501 --build-arg HOST_GID=20`
- **THEN** the mason user SHALL have UID=501 and GID=20

## ADDED Requirements

### Requirement: Agent Dockerfile copies home directory and creates backup

The `generateAgentDockerfile()` function SHALL emit lines to:
1. COPY the materialized home directory into `/home/mason/`
2. Copy `/home/mason` to `/home/mason-from-build` as a backup before the mount overlay

The COPY line SHALL use the path `{roleShortName}/{agentType}/home/` relative to the build context. The backup step SHALL use `cp -a` to preserve permissions and ownership.

#### Scenario: Dockerfile includes home COPY and backup
- **WHEN** `generateAgentDockerfile()` is called for a claude-code agent in role "writer"
- **THEN** the output SHALL contain `COPY writer/claude-code/home/ /home/mason/`
- **AND** `RUN cp -a /home/mason /home/mason-from-build`

#### Scenario: Home backup preserves OS files
- **WHEN** the Dockerfile is built and the base image created `.bashrc` and `.profile` in `/home/mason/`
- **THEN** `/home/mason-from-build/` SHALL contain those files plus the materialized home content

### Requirement: Agent Dockerfile emits home COPY only when home directory exists

The `generateAgentDockerfile()` function SHALL accept an option indicating whether a home directory was materialized. When no home directory exists (e.g., agent type without `materializeHome`), the COPY and backup lines SHALL be omitted.

#### Scenario: No home directory materialized
- **WHEN** `generateAgentDockerfile()` is called with `hasHome: false`
- **THEN** the output SHALL NOT contain the home COPY line or the backup step

#### Scenario: Home directory materialized
- **WHEN** `generateAgentDockerfile()` is called with `hasHome: true`
- **THEN** the output SHALL contain both the home COPY and backup lines
