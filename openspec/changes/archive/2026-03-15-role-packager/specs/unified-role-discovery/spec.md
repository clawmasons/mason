## MODIFIED Requirements

### Requirement: Discovery uses project directory only — no CLAWMASONS_HOME scanning
`discoverRoles(projectDir)` and `resolveRole(name, projectDir)` SHALL scan only `.mason/roles/` within the project directory for local roles, and `node_modules` for packaged roles. There SHALL be no scanning of dialect-specific agent directories (`.claude/roles/`, `.codex/roles/`, etc.), `CLAWMASONS_HOME`, `chapters.json`, or any global registry.

#### Scenario: Discover local role from .mason/roles/
- **WHEN** `discoverRoles("/home/user/my-project")` is called
- **AND** `/home/user/my-project/.mason/roles/writer/ROLE.md` exists
- **THEN** the result SHALL include a RoleType for "writer"
- **AND** no reads to `~/.clawmasons/` SHALL occur
- **AND** no reads to `.claude/roles/` SHALL occur

#### Scenario: Discover packaged role from node_modules/
- **WHEN** `discoverRoles("/home/user/my-project")` is called
- **AND** a package in `node_modules/` has `chapter.type === "role"`
- **THEN** the result SHALL include the packaged role
- **AND** no reads to `~/.clawmasons/chapters.json` SHALL occur

#### Scenario: Role resolution does not fall back to global registry
- **WHEN** `resolveRole("writer", "/home/user/my-project")` is called
- **AND** "writer" is not found in `.mason/roles/` or `node_modules/`
- **THEN** a `RoleDiscoveryError` SHALL be thrown
- **AND** the function SHALL NOT attempt to read from `CLAWMASONS_HOME`

#### Scenario: Dialect-specific directories are not searched
- **WHEN** `discoverRoles("/home/user/my-project")` is called
- **AND** `/home/user/my-project/.claude/roles/writer/ROLE.md` exists
- **AND** `/home/user/my-project/.mason/roles/writer/ROLE.md` does not exist
- **THEN** the result SHALL NOT include a RoleType for "writer"

## REMOVED Requirements

### Requirement: (implicit) Local roles discovered from dialect-specific agent directories
**Reason**: Local role discovery is now exclusively from `.mason/roles/`. Dialect directories (`.claude/roles/`, `.codex/roles/`, `.aider/roles/`) are no longer scanned for ROLE.md files. This simplifies the discovery model and decouples roles from the agent they are deployed to.
**Migration**: Move any ROLE.md files from `.<agent>/roles/<name>/ROLE.md` to `.mason/roles/<name>/ROLE.md`. The file content is unchanged.
