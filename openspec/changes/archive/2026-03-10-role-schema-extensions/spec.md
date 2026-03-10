## Purpose

Extend the role schema and resolver to support `mounts`, `baseImage`, and `aptPackages` fields, enabling chapter authors to declare Docker volume mounts, custom base images, and apt packages directly in role definitions. This is a schema-only change — no Dockerfile or compose generation changes yet.

## Requirements

### Requirement: `mounts` field on role schema
The system SHALL accept an optional `mounts` array on the role chapter field schema. Each mount object SHALL have `source` (string, required), `target` (string, required), and `readonly` (boolean, optional, defaults to false).

#### Scenario: Role with valid mounts passes validation
- **GIVEN** a role chapter field with `mounts: [{ "source": "${LODGE_HOME}", "target": "/home/mason/${LODGE}" }]`
- **WHEN** the schema validates the input
- **THEN** validation succeeds and the parsed `mounts` array contains the mount object with `readonly` defaulting to `false`

#### Scenario: Mount with explicit readonly flag
- **GIVEN** a role chapter field with `mounts: [{ "source": "/data", "target": "/mnt/data", "readonly": true }]`
- **WHEN** the schema validates the input
- **THEN** validation succeeds and the mount has `readonly: true`

#### Scenario: Invalid mount shape is rejected
- **GIVEN** a role chapter field with `mounts: [{ "source": "/data" }]` (missing `target`)
- **WHEN** the schema validates the input
- **THEN** validation fails

#### Scenario: Empty mounts array is valid
- **GIVEN** a role chapter field with `mounts: []`
- **WHEN** the schema validates the input
- **THEN** validation succeeds with an empty mounts array

### Requirement: `baseImage` field on role schema
The system SHALL accept an optional `baseImage` string on the role chapter field schema.

#### Scenario: Role with baseImage passes validation
- **GIVEN** a role chapter field with `baseImage: "node:22-bookworm"`
- **WHEN** the schema validates the input
- **THEN** validation succeeds and the parsed `baseImage` is `"node:22-bookworm"`

#### Scenario: Invalid baseImage type is rejected
- **GIVEN** a role chapter field with `baseImage: 123`
- **WHEN** the schema validates the input
- **THEN** validation fails

### Requirement: `aptPackages` field on role schema
The system SHALL accept an optional `aptPackages` string array on the role chapter field schema.

#### Scenario: Role with aptPackages passes validation
- **GIVEN** a role chapter field with `aptPackages: ["git", "curl", "jq"]`
- **WHEN** the schema validates the input
- **THEN** validation succeeds and the parsed `aptPackages` array contains `["git", "curl", "jq"]`

#### Scenario: Empty aptPackages array is valid
- **GIVEN** a role chapter field with `aptPackages: []`
- **WHEN** the schema validates the input
- **THEN** validation succeeds with an empty array

### Requirement: Backwards compatibility
The system SHALL continue to validate roles that do not include `mounts`, `baseImage`, or `aptPackages` fields.

#### Scenario: Existing role without new fields passes validation
- **GIVEN** a role chapter field with only `type`, `permissions`, and existing optional fields
- **WHEN** the schema validates the input
- **THEN** validation succeeds and new fields are `undefined`

### Requirement: ResolvedRole type includes new fields
The `ResolvedRole` type SHALL include optional `mounts`, `baseImage`, and `aptPackages` fields matching the schema types.

#### Scenario: Resolver passes through new fields
- **GIVEN** a role with `mounts`, `baseImage`, and `aptPackages` defined
- **WHEN** the resolver resolves the role into a `ResolvedRole`
- **THEN** the resolved role carries `mounts`, `baseImage`, and `aptPackages` with correct values

#### Scenario: Resolver omits new fields when not defined
- **GIVEN** a role without `mounts`, `baseImage`, or `aptPackages`
- **WHEN** the resolver resolves the role
- **THEN** the resolved role has `undefined` for those fields

## Decisions

- The `mounts` field uses `{ source, target, readonly }` objects to match Docker bind mount semantics.
- `readonly` defaults to `false` to match Docker's default behavior.
- All three new fields are optional for backwards compatibility.
- This is schema-only: no Dockerfile generation or compose file changes (those come in CHANGE 4).
- Environment variable placeholders like `${LODGE_HOME}` in mount sources are stored as literal strings; resolution happens at compose/Dockerfile generation time (CHANGE 4).
