## ADDED Requirements

### Requirement: Role container npm packages are propagated to ResolvedRole

The adapter (`adaptRoleToResolvedAgent`) SHALL map `role.container.packages.npm` to `resolvedRole.npmPackages` when the array is non-empty.

#### Scenario: npm packages mapped from role
- **WHEN** a Role with `container.packages.npm: ["typescript", "@fission-ai/openspec@latest"]` is adapted
- **THEN** `resolvedRole.npmPackages` SHALL equal `["typescript", "@fission-ai/openspec@latest"]`

#### Scenario: Empty npm packages not set on resolved role
- **WHEN** a Role with `container.packages.npm: []` is adapted
- **THEN** `resolvedRole.npmPackages` SHALL be undefined

#### Scenario: npm packages absent from role leaves resolved role unset
- **WHEN** a Role with no `container.packages` block is adapted
- **THEN** `resolvedRole.npmPackages` SHALL be undefined

### Requirement: ResolvedRole type includes npmPackages field

The `ResolvedRole` TypeScript interface SHALL include an optional `npmPackages?: string[]` field.

#### Scenario: npmPackages is accessible on ResolvedRole
- **WHEN** a `ResolvedRole` object is accessed in TypeScript
- **THEN** `resolvedRole.npmPackages` SHALL be typed as `string[] | undefined`

### Requirement: DockerfileConfig includes npmPackages field

The `DockerfileConfig` interface in `@clawmasons/agent-sdk` SHALL include an optional `npmPackages?: string[]` field for agent-level global npm package declarations.

#### Scenario: Agent declares npm packages via DockerfileConfig
- **WHEN** an `AgentPackage` with `dockerfile.npmPackages: ["@anthropic-ai/claude-code"]` is used
- **THEN** `dockerfileConfig.npmPackages` SHALL equal `["@anthropic-ai/claude-code"]`
