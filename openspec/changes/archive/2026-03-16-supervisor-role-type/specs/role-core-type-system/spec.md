## ADDED Requirements

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
