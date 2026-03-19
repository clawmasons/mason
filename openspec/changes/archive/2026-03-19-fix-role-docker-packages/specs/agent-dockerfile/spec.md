## MODIFIED Requirements

### Requirement: Agent Dockerfile uses pluggable runtime install steps

The `generateAgentDockerfile()` function SHALL accept an `AgentPackage` (or its `dockerfile` config) to determine runtime-specific Dockerfile instructions. The hardcoded `getRuntimeInstall()` switch statement SHALL be removed.

When generating the Dockerfile:
- If `agentPackage.dockerfile.installSteps` is provided, those lines SHALL be included in the Dockerfile
- If `agentPackage.dockerfile.installSteps` is not provided, no agent-specific install step SHALL be emitted
- If `agentPackage.dockerfile.baseImage` is provided and the role does not declare its own `baseImage`, the agent's base image SHALL be used
- If `agentPackage.dockerfile.aptPackages` is provided, those packages SHALL be merged with any role-declared `aptPackages`
- If `agentPackage.dockerfile.npmPackages` is provided, those packages SHALL be merged with any role-declared `npmPackages`
- The Dockerfile SHALL COPY from `{roleShortName}/{agentType}/build/workspace/` to `/home/mason/workspace/` (not from `workspace/` directly)
- When npm packages are declared (from either role or agent), the Dockerfile SHALL emit `RUN npm install -g <packages>` after the apt install step and before user creation

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

#### Scenario: npm packages from role installed globally
- **WHEN** `generateAgentDockerfile()` is called with a role whose `npmPackages` is `["typescript"]`
- **AND** the agent declares no `dockerfile.npmPackages`
- **THEN** the output Dockerfile SHALL contain `RUN npm install -g typescript`

#### Scenario: npm packages merged from agent and role
- **WHEN** the role declares `npmPackages: ["typescript"]`
- **AND** the agent declares `dockerfile.npmPackages: ["@fission-ai/openspec@latest"]`
- **THEN** the Dockerfile SHALL contain `RUN npm install -g` with both packages
- **AND** duplicates SHALL be deduplicated

#### Scenario: npm install step absent when no npm packages declared
- **WHEN** neither the role nor the agent declares any npm packages
- **THEN** the output Dockerfile SHALL NOT contain any `npm install -g` line

#### Scenario: npm install step placed after apt and before user creation
- **WHEN** the Dockerfile is generated with both apt and npm packages
- **THEN** the `apt-get install` step SHALL appear before the `npm install -g` step
- **AND** the `npm install -g` step SHALL appear before the `RUN groupadd` / user creation block

#### Scenario: Workspace COPY uses build/ path
- **WHEN** `generateAgentDockerfile()` is called for a claude-code-agent agent in role "writer"
- **THEN** the output Dockerfile SHALL contain `COPY writer/claude-code-agent/build/workspace/ /home/mason/workspace/`
- **AND** SHALL NOT contain `COPY writer/claude-code-agent/workspace/ /home/mason/workspace/`
