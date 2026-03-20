## Requirements

### Requirement: Discover packages from workspace directories
The system SHALL scan workspace directories (`apps/`, `tasks/`, `skills/`, `roles/`, `agents/`) under the project root to find packages with valid metadata fields. Each directory containing a `package.json` with a parseable field at `pkg[CLI_NAME_LOWERCASE]` SHALL be included in the discovery result.

#### Scenario: Discover packages in workspace directories
- **WHEN** `discoverPackages(rootDir)` is called on a workspace with `apps/github/package.json` containing a valid app field under the `mason` key and `roles/issue-manager/package.json` containing a valid role field
- **THEN** the result map contains entries keyed by package name for both packages, each with the parsed field, version, and package path

#### Scenario: Skip directories without package.json
- **WHEN** `discoverPackages(rootDir)` is called and `apps/empty-dir/` exists but has no `package.json`
- **THEN** that directory is silently skipped and not included in the result

#### Scenario: Skip packages without metadata field
- **WHEN** `discoverPackages(rootDir)` is called and `apps/plain-npm/package.json` exists but has no `mason` field (the CLI_NAME_LOWERCASE key)
- **THEN** that package is silently skipped and not included in the result

#### Scenario: Skip packages with invalid metadata field
- **WHEN** `discoverPackages(rootDir)` is called and `apps/bad-schema/package.json` has an invalid field under the `mason` key (fails Zod validation)
- **THEN** that package is skipped and not included in the result

### Requirement: Discover packages from node_modules
The system SHALL scan `node_modules/` under the project root to find installed packages with valid metadata fields under the `mason` key (CLI_NAME_LOWERCASE), including scoped packages.

#### Scenario: Discover packages in node_modules
- **WHEN** `discoverPackages(rootDir)` is called and `node_modules/@clawmasons/app-github/package.json` contains a valid app field under the `mason` key
- **THEN** the result map contains an entry for `@clawmasons/app-github` with the parsed field

#### Scenario: Handle scoped packages
- **WHEN** `discoverPackages(rootDir)` is called and `node_modules/@org/` contains multiple packages with valid fields
- **THEN** all scoped packages with valid fields are discovered

#### Scenario: No node_modules directory
- **WHEN** `discoverPackages(rootDir)` is called and no `node_modules/` directory exists
- **THEN** discovery succeeds with an empty or partial result (workspace packages still discovered)

### Requirement: DiscoveredPackage data structure
Each discovered package SHALL be represented as a `DiscoveredPackage` containing: `name` (string), `version` (string), `packagePath` (absolute filesystem path), and `field` (validated `Field` from Zod parsing).

#### Scenario: DiscoveredPackage contains all fields
- **WHEN** a valid package is discovered at `apps/github/package.json` with name `@clawmasons/app-github` and version `1.2.0`
- **THEN** the `DiscoveredPackage` has `name: "@clawmasons/app-github"`, `version: "1.2.0"`, `packagePath` pointing to the package directory, and `field` containing the validated app field

### Requirement: Workspace packages take precedence over node_modules
When the same package name exists in both a workspace directory and node_modules, the workspace version SHALL take precedence (matching npm workspace behavior).

#### Scenario: Workspace package overrides node_modules
- **WHEN** `@clawmasons/app-github` exists in both `apps/github/` and `node_modules/@clawmasons/app-github/`
- **THEN** the discovery result contains only the workspace version
