## Purpose

Wire the role schema extensions (mounts, baseImage, aptPackages) from CHANGE 3 into Dockerfile generation and Docker Compose volume generation, so that role-declared Docker customizations are reflected in the actual build artifacts.

## Requirements

### Requirement: Dockerfile uses role baseImage for FROM line
The system SHALL use `resolvedRole.baseImage` as the Docker FROM image when specified, falling back to `node:22-slim` when unset.

#### Scenario: Custom base image
- **GIVEN** a role with `baseImage: "node:22-bookworm"`
- **WHEN** `generateAgentDockerfile()` is called
- **THEN** the output contains `FROM node:22-bookworm` and does NOT contain `FROM node:22-slim`

#### Scenario: Default base image when baseImage is undefined
- **GIVEN** a role without `baseImage`
- **WHEN** `generateAgentDockerfile()` is called
- **THEN** the output contains `FROM node:22-slim`

### Requirement: Dockerfile includes apt-get install for role aptPackages
The system SHALL add an `apt-get update && apt-get install` step when `resolvedRole.aptPackages` is a non-empty array.

#### Scenario: Role with apt packages
- **GIVEN** a role with `aptPackages: ["git", "curl", "jq"]`
- **WHEN** `generateAgentDockerfile()` is called
- **THEN** the output contains `apt-get install -y --no-install-recommends git curl jq`

#### Scenario: No apt step when aptPackages is undefined or empty
- **GIVEN** a role without `aptPackages` (or with an empty array)
- **WHEN** `generateAgentDockerfile()` is called
- **THEN** the output does NOT contain `apt-get`

### Requirement: Compose volumes include role mounts with env var resolution
The system SHALL iterate `role.mounts`, resolve `${VAR}` references from `process.env`, and add them to the agent service's `volumes` array in all compose generators.

#### Scenario: Role mount added to agent volumes
- **GIVEN** a role with `mounts: [{ source: "/host/data", target: "/container/data", readonly: false }]`
- **WHEN** any compose generator is called with `roleMounts`
- **THEN** the agent service volumes include `"/host/data:/container/data"`

#### Scenario: Readonly mount appends :ro
- **GIVEN** a role with `mounts: [{ source: "/configs", target: "/etc/app", readonly: true }]`
- **WHEN** any compose generator is called with `roleMounts`
- **THEN** the agent service volumes include `"/configs:/etc/app:ro"`

#### Scenario: Env var resolution in mount source/target
- **GIVEN** `process.env.LODGE_HOME = "/home/lodges"` and a mount with `source: "${LODGE_HOME}"`
- **WHEN** `resolveRoleMountVolumes()` is called
- **THEN** the source is resolved to `/home/lodges`

#### Scenario: Role mounts not added to proxy volumes
- **GIVEN** a role with mounts
- **WHEN** compose is generated
- **THEN** only the agent service has the extra mount volumes, not the proxy

#### Scenario: No extra mounts when roleMounts is undefined
- **GIVEN** no roleMounts passed
- **WHEN** compose is generated
- **THEN** only the standard workspace mount appears in agent volumes

## Files Changed

- `packages/cli/src/generator/agent-dockerfile.ts` — FROM line uses `role.baseImage`, apt-get step for `role.aptPackages`
- `packages/cli/src/generator/mount-volumes.ts` — New shared utility for env var resolution and mount volume generation
- `packages/cli/src/generator/index.ts` — Re-exports mount-volumes utilities
- `packages/cli/src/acp/session.ts` — `generateAgentComposeYml()` and `generateAcpComposeYml()` accept and use `roleMounts`
- `packages/cli/src/cli/commands/run-agent.ts` — `generateComposeYml()` accepts and uses `roleMounts`
- `packages/cli/src/cli/commands/init-role.ts` — `generateInitRoleComposeYml()` accepts and uses `roleMounts`
- `packages/cli/tests/generator/mount-volumes.test.ts` — 12 unit tests for env var resolution and mount volume generation
- `packages/cli/tests/generator/agent-dockerfile.test.ts` — 8 new tests for baseImage and aptPackages
- `packages/cli/tests/acp/session.test.ts` — 6 new tests for role mounts in ACP compose generators
- `packages/cli/tests/cli/run-agent.test.ts` — 4 new tests for role mounts in run-agent compose
- `packages/cli/tests/cli/init-role.test.ts` — 6 new tests for role mounts in init-role compose
