## ADDED Requirements

### Requirement: sources field in Role schema
The system SHALL define an optional `sources` field in `roleSchema` as a string array (defaults to empty array). Each entry is a directory path relative to the project root that will be scanned for tasks, skills, and apps when the role is run locally. The same list controls which files are copied into the build directory during `mason package`.

#### Scenario: Valid sources field
- **WHEN** a Role with `sources: [".claude/", ".codex/"]` is validated
- **THEN** validation succeeds and `sources` is typed as `string[]`

#### Scenario: sources defaults to empty array
- **WHEN** a Role without a `sources` field is validated
- **THEN** validation succeeds with `sources` defaulting to `[]`

#### Scenario: sources with empty array is valid
- **WHEN** a Role with `sources: []` is validated
- **THEN** validation succeeds

### Requirement: type field in Role schema
The system SHALL define an optional `type` field in `roleSchema` as a string enum with values `"project"` and `"supervisor"`, defaulting to `"project"`. This field is distinct from `source.type` (which identifies local vs. packaged role source) and controls runtime materialization scope.

#### Scenario: type field defaults to project
- **WHEN** a Role is validated without a `type` field
- **THEN** validation SHALL succeed and `role.type` SHALL equal `"project"`

#### Scenario: type field accepts supervisor
- **WHEN** a Role is validated with `type: "supervisor"`
- **THEN** validation SHALL succeed and `role.type` SHALL equal `"supervisor"`

#### Scenario: type field rejects unknown values
- **WHEN** a Role is validated with `type: "other"`
- **THEN** validation SHALL fail with a Zod enum error

### Requirement: TypeScript type exports include type field
The `Role` TypeScript type SHALL include `type: "project" | "supervisor"` as a field accessible to all consumers of `@clawmasons/shared`.

#### Scenario: type is accessible on Role
- **WHEN** a `Role` object is accessed in TypeScript
- **THEN** `role.type` SHALL be typed as `"project" | "supervisor"`

### Requirement: TypeScript type exports include sources
The `Role` TypeScript type SHALL include `sources: string[]` as a field accessible to all consumers of `@clawmasons/shared`. The Zod schema SHALL be exported as `roleSchema`.

#### Scenario: sources is accessible on Role
- **WHEN** a `Role` object is accessed in TypeScript
- **THEN** `role.sources` SHALL be typed as `string[]`

#### Scenario: roleSchema is exported from shared
- **WHEN** a consumer imports from `@clawmasons/shared`
- **THEN** `roleSchema` SHALL be available as a named export
