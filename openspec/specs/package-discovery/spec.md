## ADDED Requirements

### Requirement: Discover forge packages from workspace directories
The system SHALL scan workspace directories (`apps/`, `tasks/`, `skills/`, `roles/`, `agents/`) under the project root to find packages with valid `forge` fields. Each directory containing a `package.json` with a parseable `forge` field SHALL be included in the discovery result.

#### Scenario: Discover packages in workspace directories
- **WHEN** `discoverPackages(rootDir)` is called on a workspace with `apps/github/package.json` containing a valid app forge field and `roles/issue-manager/package.json` containing a valid role forge field
- **THEN** the result map contains entries keyed by package name for both packages, each with the parsed forge field, version, and package path

#### Scenario: Skip directories without package.json
- **WHEN** `discoverPackages(rootDir)` is called and `apps/empty-dir/` exists but has no `package.json`
- **THEN** that directory is silently skipped and not included in the result

#### Scenario: Skip packages without forge field
- **WHEN** `discoverPackages(rootDir)` is called and `apps/plain-npm/package.json` exists but has no `forge` field
- **THEN** that package is silently skipped and not included in the result

#### Scenario: Skip packages with invalid forge field
- **WHEN** `discoverPackages(rootDir)` is called and `apps/bad-schema/package.json` has an invalid `forge` field (fails Zod validation)
- **THEN** that package is skipped and not included in the result

### Requirement: Discover forge packages from node_modules
The system SHALL scan `node_modules/` under the project root to find installed packages with valid `forge` fields, including scoped packages (e.g., `node_modules/@clawforge/app-github/`).

#### Scenario: Discover packages in node_modules
- **WHEN** `discoverPackages(rootDir)` is called and `node_modules/@clawforge/app-github/package.json` contains a valid app forge field
- **THEN** the result map contains an entry for `@clawforge/app-github` with the parsed forge field

#### Scenario: Handle scoped packages
- **WHEN** `discoverPackages(rootDir)` is called and `node_modules/@org/` contains multiple packages with forge fields
- **THEN** all scoped packages with valid forge fields are discovered

#### Scenario: No node_modules directory
- **WHEN** `discoverPackages(rootDir)` is called and no `node_modules/` directory exists
- **THEN** discovery succeeds with an empty or partial result (workspace packages still discovered)

### Requirement: Discover forge sub-packages inside node_modules packages with workspace dirs
When a package in `node_modules/` contains any of the standard workspace directories (`apps/`, `tasks/`, `skills/`, `roles/`, `agents/`), the system SHALL scan those directories for forge sub-packages and register them. Sub-packages are only registered if no package with the same name already exists in the map (preserving workspace-local precedence).

#### Scenario: Discover sub-components inside a node_modules package with workspace dirs
- **WHEN** `discoverPackages(rootDir)` is called and `node_modules/@clawforge/forge-core/apps/filesystem/package.json` contains a valid app forge field, `node_modules/@clawforge/forge-core/tasks/take-notes/package.json` contains a valid task forge field, and `node_modules/@clawforge/forge-core/skills/markdown-conventions/package.json` contains a valid skill forge field
- **THEN** the result map contains entries for `@clawforge/app-filesystem`, `@clawforge/task-take-notes`, and `@clawforge/skill-markdown-conventions`

#### Scenario: Workspace-local packages take precedence over node_modules sub-components
- **WHEN** `discoverPackages(rootDir)` is called and `apps/filesystem/package.json` exists locally with name `@clawforge/app-filesystem` version `2.0.0`, AND `node_modules/@clawforge/forge-core/apps/filesystem/package.json` also has name `@clawforge/app-filesystem` version `1.0.0`
- **THEN** the result map contains `@clawforge/app-filesystem` with version `2.0.0` (the local version)

#### Scenario: Package with both direct forge field and workspace dirs
- **WHEN** `discoverPackages(rootDir)` is called and `node_modules/@org/lib/package.json` has a valid forge field AND `node_modules/@org/lib/apps/tool/package.json` also has a valid forge field
- **THEN** both the library package and the sub-component are registered in the result map

### Requirement: DiscoveredPackage data structure
Each discovered package SHALL be represented as a `DiscoveredPackage` containing: `name` (string), `version` (string), `packagePath` (absolute filesystem path), and `forgeField` (validated ForgeField from Zod parsing).

#### Scenario: DiscoveredPackage contains all fields
- **WHEN** a valid forge package is discovered at `apps/github/package.json` with name `@clawforge/app-github` and version `1.2.0`
- **THEN** the `DiscoveredPackage` has `name: "@clawforge/app-github"`, `version: "1.2.0"`, `packagePath` pointing to the package directory, and `forgeField` containing the validated app forge field

### Requirement: Workspace packages take precedence over node_modules
When the same package name exists in both a workspace directory and node_modules, the workspace version SHALL take precedence (matching npm workspace behavior).

#### Scenario: Workspace package overrides node_modules
- **WHEN** `@clawforge/app-github` exists in both `apps/github/` and `node_modules/@clawforge/app-github/`
- **THEN** the discovery result contains only the workspace version
