## MODIFIED Requirements

### Requirement: Role package validation uses CLI name field
The role package reader and discovery module SHALL read the metadata field from `pkg[CLI_NAME_LOWERCASE]` (currently `pkg.mason`) instead of `pkg.chapter`. Validation of `type` and `dialect` sub-fields SHALL reference the new field path.

#### Scenario: Role package validation reads mason field
- **WHEN** a role package.json is validated
- **THEN** the system SHALL check `pkg.mason.type === "role"` (using `pkg[CLI_NAME_LOWERCASE]`)
- **AND** if `pkg.mason.dialect` is specified, it SHALL be validated against known dialects

#### Scenario: Package without mason field is skipped
- **WHEN** a package.json has no `mason` field (CLI_NAME_LOWERCASE key)
- **THEN** the package SHALL be skipped during role discovery
