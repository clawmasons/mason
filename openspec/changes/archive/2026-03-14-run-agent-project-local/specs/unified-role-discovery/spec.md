## MODIFIED Requirements

### Requirement: Discovery uses project directory only — no CLAWMASONS_HOME scanning

`discoverRoles(projectDir)` and `resolveRole(name, projectDir)` SHALL scan only the project directory for local roles and `node_modules` for packaged roles. There SHALL be no scanning of `CLAWMASONS_HOME`, `chapters.json`, or any global registry.

#### Scenario: Discover local role from `.claude/roles/`
- **WHEN** `discoverRoles("/home/user/my-project")` is called
- **AND** `/home/user/my-project/.claude/roles/writer/ROLE.md` exists
- **THEN** the result SHALL include a RoleType for "writer"
- **AND** no reads to `~/.clawmasons/` SHALL occur

#### Scenario: Discover packaged role from `node_modules/`
- **WHEN** `discoverRoles("/home/user/my-project")` is called
- **AND** a package in `node_modules/` has `chapter.type === "role"`
- **THEN** the result SHALL include the packaged role
- **AND** no reads to `~/.clawmasons/chapters.json` SHALL occur

#### Scenario: Role resolution does not fall back to global registry
- **WHEN** `resolveRole("writer", "/home/user/my-project")` is called
- **AND** "writer" is not found locally or in `node_modules/`
- **THEN** a `RoleDiscoveryError` SHALL be thrown
- **AND** the function SHALL NOT attempt to read from `CLAWMASONS_HOME`

## REMOVED Requirements

### Requirement: Home-directory scanning for roles
**Reason**: CLAWMASONS_HOME and the global `chapters.json` registry are being removed entirely. Role discovery is now project-local only.
**Migration**: Roles must be defined in the project's `.<agent>/roles/` directory or installed as npm packages in the project's `node_modules/`.
