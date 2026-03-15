## MODIFIED Requirements

### Requirement: Agent Dockerfile uses pluggable runtime install steps

The `generateAgentDockerfile()` function SHALL accept an `AgentPackage` (or its `dockerfile` config) to determine runtime-specific Dockerfile instructions. The hardcoded `getRuntimeInstall()` switch statement SHALL be removed.

When generating the Dockerfile:
- If `agentPackage.dockerfile.installSteps` is provided, those lines SHALL be included in the Dockerfile
- If `agentPackage.dockerfile.installSteps` is not provided, no agent-specific install step SHALL be emitted
- If `agentPackage.dockerfile.baseImage` is provided and the role does not declare its own `baseImage`, the agent's base image SHALL be used
- If `agentPackage.dockerfile.aptPackages` is provided, those packages SHALL be merged with any role-declared `aptPackages`

#### Scenario: Agent provides install steps
- **WHEN** `generateAgentDockerfile()` is called with an `AgentPackage` whose `dockerfile.installSteps` is `"RUN npm install -g @anthropic-ai/claude-code"`
- **THEN** the output Dockerfile SHALL contain that RUN instruction

#### Scenario: Agent provides no install steps
- **WHEN** `generateAgentDockerfile()` is called with an `AgentPackage` whose `dockerfile` is undefined
- **THEN** the output Dockerfile SHALL contain no agent-specific install step (only the standard mason user setup, workspace copy, etc.)

#### Scenario: Base image precedence
- **WHEN** `generateAgentDockerfile()` is called with an `AgentPackage` whose `dockerfile.baseImage` is `"python:3.12-slim"`
- **AND** the role does not declare `baseImage`
- **THEN** the Dockerfile SHALL use `FROM python:3.12-slim`

#### Scenario: Role base image overrides agent base image
- **WHEN** the role declares `baseImage: "ubuntu:22.04"`
- **AND** the agent declares `dockerfile.baseImage: "node:22-slim"`
- **THEN** the Dockerfile SHALL use `FROM ubuntu:22.04` (role takes precedence)

#### Scenario: Apt packages merged from agent and role
- **WHEN** the agent declares `dockerfile.aptPackages: ["git"]`
- **AND** the role declares `aptPackages: ["curl"]`
- **THEN** the Dockerfile SHALL install both `git` and `curl` via `apt-get install`
- **AND** duplicates SHALL be deduplicated

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
