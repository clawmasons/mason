## MODIFIED Requirements

### Requirement: chapter run auto-builds docker artifacts if missing

The run command SHALL check if docker build artifacts exist at `{projectDir}/.mason/docker/{role-name}/`. If they do not exist, it SHALL automatically trigger `generateRoleDockerBuildDir` to materialize them before proceeding.

Additionally, the run command SHALL detect when the role's `container.packages` has changed since the build directory was last generated. It SHALL compute a SHA-256 hash of the serialized `container.packages` object and compare it against a stored `.packages-hash` file in `{buildDir}/{agentType}/`. When the hash differs or the file is absent, the run command SHALL delete the stale build directory and regenerate it, then log that a stale package hash was detected.

#### Scenario: Docker artifacts exist and packages unchanged
- **WHEN** `mason run --role writer` is executed
- **AND** `{projectDir}/.mason/docker/writer/claude-code-agent/Dockerfile` exists
- **AND** the `.packages-hash` file matches the current role's `container.packages`
- **THEN** the command SHALL proceed directly to session creation without rebuilding

#### Scenario: Docker artifacts missing — auto-build
- **WHEN** `mason run --role writer` is executed
- **AND** `{projectDir}/.mason/docker/writer/` does not exist
- **THEN** the command SHALL run `generateRoleDockerBuildDir` for the role before proceeding
- **AND** SHALL print a message indicating docker artifacts are being built
- **AND** SHALL write a `.packages-hash` file to `{buildDir}/{agentType}/`

#### Scenario: Packages changed since last build — auto-invalidate
- **WHEN** `mason run --role writer` is executed
- **AND** the Dockerfile exists but `.packages-hash` does not match the current `container.packages`
- **THEN** the command SHALL delete the stale build directory
- **AND** SHALL regenerate the build artifacts including the updated Dockerfile
- **AND** SHALL log that a stale package hash was detected and rebuild was triggered
- **AND** SHALL write the updated `.packages-hash` file

#### Scenario: No packages declared — hash still written
- **WHEN** `mason run --role writer` is executed
- **AND** the role has no `container.packages` entries
- **THEN** the command SHALL write a `.packages-hash` representing the empty packages state
- **AND** subsequent runs with no changes SHALL not trigger a rebuild
