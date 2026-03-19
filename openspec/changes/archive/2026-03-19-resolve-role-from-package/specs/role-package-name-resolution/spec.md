## ADDED Requirements

### Requirement: Package names resolve via direct path lookup
When `resolveRole(name, projectDir)` is called with a name that contains `@` or `/`, the system SHALL treat it as an npm package name and resolve it by direct path lookup in `node_modules/<name>/` rather than scanning all packages.

#### Scenario: Resolve scoped package name from local node_modules
- **WHEN** `resolveRole("@clawmasons/role-configure-project", "/home/user/my-project")` is called
- **AND** `/home/user/my-project/node_modules/@clawmasons/role-configure-project/` exists and has `chapter.type === "role"`
- **THEN** the role SHALL be returned without scanning all of `node_modules/`

#### Scenario: Package name skips local role lookup
- **WHEN** `resolveRole("@clawmasons/role-configure-project", "/home/user/my-project")` is called
- **AND** `/home/user/my-project/.mason/roles/@clawmasons/role-configure-project/ROLE.md` does not exist
- **THEN** the system SHALL NOT check `.mason/roles/` and SHALL proceed directly to package lookup

#### Scenario: Package not in local node_modules — falls back to global
- **WHEN** `resolveRole("@clawmasons/role-configure-project", "/home/user/my-project")` is called
- **AND** `node_modules/@clawmasons/role-configure-project/` does not exist locally
- **AND** the global node_modules contains `@clawmasons/role-configure-project/` with `chapter.type === "role"`
- **THEN** the role SHALL be loaded from the global node_modules path

#### Scenario: Package name not found anywhere throws RoleDiscoveryError
- **WHEN** `resolveRole("@clawmasons/role-nonexistent", "/home/user/my-project")` is called
- **AND** the package exists neither in local nor global node_modules
- **THEN** a `RoleDiscoveryError` SHALL be thrown with a message indicating the package was not found

### Requirement: Plain role names auto-convert to clawmasons package names
When a plain role name (no `@` or `/`) is not found as a local role or via full node_modules scan, the system SHALL retry lookup using `@clawmasons/role-<name>` as a package name (direct lookup in local then global node_modules).

#### Scenario: Plain name found via auto-converted package name
- **WHEN** `resolveRole("configure-project", "/home/user/my-project")` is called
- **AND** no local role named `configure-project` exists in `.mason/roles/`
- **AND** no installed package's metadata name matches `configure-project`
- **AND** `node_modules/@clawmasons/role-configure-project/` exists and has `chapter.type === "role"`
- **THEN** the role SHALL be returned

#### Scenario: Plain name auto-convert also checks global
- **WHEN** `resolveRole("configure-project", "/home/user/my-project")` is called
- **AND** no local role or local package matches
- **AND** the global node_modules contains `@clawmasons/role-configure-project/`
- **THEN** the role SHALL be loaded from the global path

#### Scenario: Auto-convert fails gracefully when package absent
- **WHEN** `resolveRole("nonexistent-role", "/home/user/my-project")` is called
- **AND** no local role, no installed package, and no `@clawmasons/role-nonexistent-role` package exists
- **THEN** a `RoleDiscoveryError` SHALL be thrown

### Requirement: Global node_modules resolved via npm root -g
The system SHALL locate global node_modules by running `npm root -g` once per process, caching the result. If the command fails or is unavailable, global lookup SHALL be silently skipped.

#### Scenario: Global lookup uses cached npm root result
- **WHEN** `resolveRole` is called multiple times in the same process
- **THEN** `npm root -g` SHALL be executed at most once

#### Scenario: npm root -g failure does not block resolution
- **WHEN** `npm root -g` exits with a non-zero code or throws
- **THEN** global lookup SHALL be skipped
- **AND** local resolution SHALL proceed normally without error
