## ADDED Requirements

### Requirement: Package role dependencies validated on load
When `readPackagedRole(packagePath)` loads a role, it SHALL validate that all skill and task names that do not start with `./` or `../` exist as subdirectories within the package (at `<packagePath>/skills/<name>/` and `<packagePath>/tasks/<name>/` respectively). All missing paths SHALL be collected before throwing.

#### Scenario: All dependencies present — load succeeds
- **WHEN** `readPackagedRole("/path/to/node_modules/@acme/role-foo")` is called
- **AND** the ROLE.md lists `skills: [create-plan]`
- **AND** `/path/to/node_modules/@acme/role-foo/skills/create-plan/` exists
- **THEN** the role SHALL load successfully

#### Scenario: Missing skill subdirectory throws PackageDependencyError
- **WHEN** `readPackagedRole("/path/to/node_modules/@acme/role-foo")` is called
- **AND** the ROLE.md lists `skills: [create-plan, run-tests]`
- **AND** `/path/to/node_modules/@acme/role-foo/skills/create-plan/` does NOT exist
- **AND** `/path/to/node_modules/@acme/role-foo/skills/run-tests/` does NOT exist
- **THEN** a `PackageDependencyError` SHALL be thrown
- **AND** the error SHALL include the path to the ROLE.md
- **AND** the error SHALL list both missing paths

#### Scenario: Missing task subdirectory included in error
- **WHEN** `readPackagedRole("/path/to/node_modules/@acme/role-foo")` is called
- **AND** the ROLE.md lists `tasks: [setup]`
- **AND** `/path/to/node_modules/@acme/role-foo/tasks/setup/` does NOT exist
- **THEN** a `PackageDependencyError` SHALL be thrown listing the missing tasks path

#### Scenario: Path-relative skill refs are not validated as subdirectories
- **WHEN** the ROLE.md lists `skills: [./skills/my-skill]`
- **THEN** `./skills/my-skill` SHALL NOT be checked as a bare subdirectory name
- **AND** its resolution follows existing path normalization

#### Scenario: All missing deps collected before throwing
- **WHEN** `readPackagedRole(...)` is called
- **AND** two skills and one task are missing
- **THEN** the thrown `PackageDependencyError` SHALL contain all three missing paths
- **AND** SHALL NOT throw after finding only the first missing path

### Requirement: PackageDependencyError carries ROLE.md path and missing paths
`PackageDependencyError` SHALL expose `roleMdPath: string` (absolute path to the ROLE.md that failed) and `missingPaths: string[]` (all dependency paths that were not found).

#### Scenario: Error fields are accessible
- **WHEN** a `PackageDependencyError` is caught
- **THEN** `error.roleMdPath` SHALL be the absolute path to the failing ROLE.md
- **AND** `error.missingPaths` SHALL be a non-empty array of absolute paths that were not found
