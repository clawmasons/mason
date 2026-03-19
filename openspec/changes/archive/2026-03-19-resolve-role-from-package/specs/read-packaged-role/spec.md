## MODIFIED Requirements

### Requirement: readPackagedRole validates dependency subdirectories
After parsing ROLE.md fields, `readPackagedRole(packagePath)` SHALL validate that all skill and task references that are plain names (not starting with `./` or `../`) exist as subdirectories of the package. All missing paths SHALL be collected into a `PackageDependencyError` before throwing — never fail on the first missing dependency.

This extends the existing behavior (steps 1–11 unchanged) by inserting a validation step after field normalization (new step 8a) and introducing the `PackageDependencyError` type alongside the existing `PackageReadError`.

#### Scenario: Role with all bundled deps present loads successfully
- **WHEN** `readPackagedRole("/path/pkg")` is called
- **AND** ROLE.md has `skills: [create-plan]`
- **AND** `/path/pkg/skills/create-plan/` exists
- **THEN** the Role SHALL be returned with no error

#### Scenario: Missing bundled skill triggers PackageDependencyError
- **WHEN** `readPackagedRole("/path/pkg")` is called
- **AND** ROLE.md has `skills: [create-plan, run-tests]`
- **AND** neither `skills/create-plan/` nor `skills/run-tests/` exists in the package
- **THEN** a `PackageDependencyError` SHALL be thrown listing both missing paths and the ROLE.md path

#### Scenario: Existing error cases (PackageReadError) still apply
- **WHEN** `readPackagedRole(packagePath)` is called with a package missing `ROLE.md`
- **THEN** a `PackageReadError` SHALL be thrown (unchanged behavior)

| Condition | Error Type | Message Pattern |
|-----------|-----------|-----------------|
| Missing package.json | `PackageReadError` | "Missing package.json" |
| Invalid JSON in package.json | `PackageReadError` | "Invalid package.json: ..." |
| Missing name in package.json | `PackageReadError` | "missing required field: name" |
| Wrong chapter.type | `PackageReadError` | 'does not have chapter.type = "role"' |
| Missing chapter field | `PackageReadError` | 'does not have chapter.type = "role"' |
| Missing ROLE.md | `PackageReadError` | "missing ROLE.md" |
| Missing description in ROLE.md | `PackageReadError` | "missing required field: description" |
| Unknown dialect | `PackageReadError` | 'Unknown dialect "..."' |
| Malformed YAML | `RoleParseError` | (from parseFrontmatter) |
| Missing bundled dependency paths | `PackageDependencyError` | includes roleMdPath + list of missing paths |
