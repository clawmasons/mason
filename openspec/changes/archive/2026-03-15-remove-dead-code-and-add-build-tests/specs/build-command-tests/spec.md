## ADDED Requirements

### Requirement: Build command has unit tests for role discovery failure
The `runBuild` function SHALL exit with code 1 and print an error when no roles are found in the workspace.

#### Scenario: No roles found
- **WHEN** `discoverRoles` returns an empty array
- **THEN** `process.exit(1)` is called and an error message is printed to stderr

### Requirement: Build command has unit tests for role name filtering
The `runBuild` function SHALL filter to the requested role when a role name is provided, and exit with code 1 if no matching role is found.

#### Scenario: Named role not found
- **WHEN** `runBuild` is called with a role name that does not match any discovered role
- **THEN** `process.exit(1)` is called and an error listing available roles is printed

#### Scenario: Named role found
- **WHEN** `runBuild` is called with a role name matching one discovered role
- **THEN** only that role is built (Docker generator called once)

### Requirement: Build command has unit tests for adapter validation failure
The `runBuild` function SHALL exit with code 1 if `adaptRoleToResolvedAgent` throws during validation.

#### Scenario: Adapter validation throws
- **WHEN** `adaptRoleToResolvedAgent` throws an error for a role
- **THEN** `process.exit(1)` is called and the error message is printed

### Requirement: Build command has unit tests for successful build of all roles
The `runBuild` function SHALL call Docker generation, proxy dependency setup, and package synthesis for all discovered roles when no role name filter is given.

#### Scenario: All roles built successfully
- **WHEN** `runBuild` is called with no role name filter and two roles are discovered
- **THEN** `generateRoleDockerBuildDir` is called twice, `ensureProxyDependencies` once, and `synthesizeRolePackages` twice

### Requirement: Build command has unit tests for agent type override
The `runBuild` function SHALL use the provided `agentTypeOverride` instead of inferring from the role when specified.

#### Scenario: Agent type override applied
- **WHEN** `runBuild` is called with `agentTypeOverride` set to `"mcp-agent"`
- **THEN** `generateRoleDockerBuildDir` is called with `agentType: "mcp-agent"` regardless of the role's dialect
