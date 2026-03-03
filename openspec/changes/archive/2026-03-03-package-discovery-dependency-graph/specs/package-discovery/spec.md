## ADDED Requirements

### Requirement: Discover pam packages from workspace directories
The system SHALL scan workspace directories (`apps/`, `tasks/`, `skills/`, `roles/`, `agents/`) under the project root to find packages with valid `pam` fields. Each directory containing a `package.json` with a parseable `pam` field SHALL be included in the discovery result.

#### Scenario: Discover packages in workspace directories
- **WHEN** `discoverPackages(rootDir)` is called on a workspace with `apps/github/package.json` containing a valid app pam field and `roles/issue-manager/package.json` containing a valid role pam field
- **THEN** the result map contains entries keyed by package name for both packages, each with the parsed pam field, version, and package path

#### Scenario: Skip directories without package.json
- **WHEN** `discoverPackages(rootDir)` is called and `apps/empty-dir/` exists but has no `package.json`
- **THEN** that directory is silently skipped and not included in the result

#### Scenario: Skip packages without pam field
- **WHEN** `discoverPackages(rootDir)` is called and `apps/plain-npm/package.json` exists but has no `pam` field
- **THEN** that package is silently skipped and not included in the result

#### Scenario: Skip packages with invalid pam field
- **WHEN** `discoverPackages(rootDir)` is called and `apps/bad-schema/package.json` has an invalid `pam` field (fails Zod validation)
- **THEN** that package is skipped and not included in the result

### Requirement: Discover pam packages from node_modules
The system SHALL scan `node_modules/` under the project root to find installed packages with valid `pam` fields, including scoped packages (e.g., `node_modules/@clawforge/app-github/`).

#### Scenario: Discover packages in node_modules
- **WHEN** `discoverPackages(rootDir)` is called and `node_modules/@clawforge/app-github/package.json` contains a valid app pam field
- **THEN** the result map contains an entry for `@clawforge/app-github` with the parsed pam field

#### Scenario: Handle scoped packages
- **WHEN** `discoverPackages(rootDir)` is called and `node_modules/@org/` contains multiple packages with pam fields
- **THEN** all scoped packages with valid pam fields are discovered

#### Scenario: No node_modules directory
- **WHEN** `discoverPackages(rootDir)` is called and no `node_modules/` directory exists
- **THEN** discovery succeeds with an empty or partial result (workspace packages still discovered)

### Requirement: DiscoveredPackage data structure
Each discovered package SHALL be represented as a `DiscoveredPackage` containing: `name` (string), `version` (string), `packagePath` (absolute filesystem path), and `pamField` (validated PamField from Zod parsing).

#### Scenario: DiscoveredPackage contains all fields
- **WHEN** a valid pam package is discovered at `apps/github/package.json` with name `@clawforge/app-github` and version `1.2.0`
- **THEN** the `DiscoveredPackage` has `name: "@clawforge/app-github"`, `version: "1.2.0"`, `packagePath` pointing to the package directory, and `pamField` containing the validated app pam field

### Requirement: Workspace packages take precedence over node_modules
When the same package name exists in both a workspace directory and node_modules, the workspace version SHALL take precedence (matching npm workspace behavior).

#### Scenario: Workspace package overrides node_modules
- **WHEN** `@clawforge/app-github` exists in both `apps/github/` and `node_modules/@clawforge/app-github/`
- **THEN** the discovery result contains only the workspace version
