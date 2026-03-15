## ADDED Requirements

### Requirement: sources field in RoleType schema
The system SHALL define an optional `sources` field in `roleTypeSchema` as a string array (defaults to empty array). Each entry is a directory path relative to the project root that will be scanned for tasks, skills, and apps when the role is run locally. The same list controls which files are copied into the build directory during `mason package`.

#### Scenario: Valid sources field
- **WHEN** a RoleType with `sources: [".claude/", ".codex/"]` is validated
- **THEN** validation succeeds and `sources` is typed as `string[]`

#### Scenario: sources defaults to empty array
- **WHEN** a RoleType without a `sources` field is validated
- **THEN** validation succeeds with `sources` defaulting to `[]`

#### Scenario: sources with empty array is valid
- **WHEN** a RoleType with `sources: []` is validated
- **THEN** validation succeeds

### Requirement: TypeScript type exports include sources
The `RoleType` TypeScript type SHALL include `sources: string[]` as a field accessible to all consumers of `@clawmasons/shared`.

#### Scenario: sources is accessible on RoleType
- **WHEN** a `RoleType` object is accessed in TypeScript
- **THEN** `role.sources` SHALL be typed as `string[]`
