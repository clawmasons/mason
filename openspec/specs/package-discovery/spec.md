## ADDED Requirements

### Requirement: Discover chapter packages from workspace directories
The system SHALL scan workspace directories (`apps/`, `tasks/`, `skills/`, `roles/`, `agents/`) under the project root to find packages with valid `chapter` fields. Each directory containing a `package.json` with a parseable `chapter` field SHALL be included in the discovery result.

#### Scenario: Discover packages in workspace directories
- **WHEN** `discoverPackages(rootDir)` is called on a workspace with `apps/github/package.json` containing a valid app chapter field and `roles/issue-manager/package.json` containing a valid role chapter field
- **THEN** the result map contains entries keyed by package name for both packages, each with the parsed chapter field, version, and package path

#### Scenario: Skip directories without package.json
- **WHEN** `discoverPackages(rootDir)` is called and `apps/empty-dir/` exists but has no `package.json`
- **THEN** that directory is silently skipped and not included in the result

#### Scenario: Skip packages without chapter field
- **WHEN** `discoverPackages(rootDir)` is called and `apps/plain-npm/package.json` exists but has no `chapter` field
- **THEN** that package is silently skipped and not included in the result

#### Scenario: Skip packages with invalid chapter field
- **WHEN** `discoverPackages(rootDir)` is called and `apps/bad-schema/package.json` has an invalid `chapter` field (fails Zod validation)
- **THEN** that package is skipped and not included in the result

### Requirement: Discover chapter packages from node_modules
The system SHALL scan `node_modules/` under the project root to find installed packages with valid `chapter` fields, including scoped packages (e.g., `node_modules/@clawmasons/app-github/`).

#### Scenario: Discover packages in node_modules
- **WHEN** `discoverPackages(rootDir)` is called and `node_modules/@clawmasons/app-github/package.json` contains a valid app chapter field
- **THEN** the result map contains an entry for `@clawmasons/app-github` with the parsed chapter field

#### Scenario: Handle scoped packages
- **WHEN** `discoverPackages(rootDir)` is called and `node_modules/@org/` contains multiple packages with chapter fields
- **THEN** all scoped packages with valid chapter fields are discovered

#### Scenario: No node_modules directory
- **WHEN** `discoverPackages(rootDir)` is called and no `node_modules/` directory exists
- **THEN** discovery succeeds with an empty or partial result (workspace packages still discovered)

### Requirement: Discover chapter sub-packages inside node_modules packages with workspace dirs
When a package in `node_modules/` contains any of the standard workspace directories (`apps/`, `tasks/`, `skills/`, `roles/`, `agents/`), the system SHALL scan those directories for chapter sub-packages and register them. Sub-packages are only registered if no package with the same name already exists in the map (preserving workspace-local precedence).

#### Scenario: Discover sub-components inside a node_modules package with workspace dirs
- **WHEN** `discoverPackages(rootDir)` is called and `node_modules/@clawmasons/forge-core/apps/filesystem/package.json` contains a valid app chapter field, `node_modules/@clawmasons/forge-core/tasks/take-notes/package.json` contains a valid task chapter field, and `node_modules/@clawmasons/forge-core/skills/markdown-conventions/package.json` contains a valid skill chapter field
- **THEN** the result map contains entries for `@clawmasons/app-filesystem`, `@clawmasons/task-take-notes`, and `@clawmasons/skill-markdown-conventions`

#### Scenario: Workspace-local packages take precedence over node_modules sub-components
- **WHEN** `discoverPackages(rootDir)` is called and `apps/filesystem/package.json` exists locally with name `@clawmasons/app-filesystem` version `2.0.0`, AND `node_modules/@clawmasons/forge-core/apps/filesystem/package.json` also has name `@clawmasons/app-filesystem` version `1.0.0`
- **THEN** the result map contains `@clawmasons/app-filesystem` with version `2.0.0` (the local version)

#### Scenario: Package with both direct chapter field and workspace dirs
- **WHEN** `discoverPackages(rootDir)` is called and `node_modules/@org/lib/package.json` has a valid chapter field AND `node_modules/@org/lib/apps/tool/package.json` also has a valid chapter field
- **THEN** both the library package and the sub-component are registered in the result map

### Requirement: DiscoveredPackage data structure
Each discovered package SHALL be represented as a `DiscoveredPackage` containing: `name` (string), `version` (string), `packagePath` (absolute filesystem path), and `chapterField` (validated ChapterField from Zod parsing).

#### Scenario: DiscoveredPackage contains all fields
- **WHEN** a valid chapter package is discovered at `apps/github/package.json` with name `@clawmasons/app-github` and version `1.2.0`
- **THEN** the `DiscoveredPackage` has `name: "@clawmasons/app-github"`, `version: "1.2.0"`, `packagePath` pointing to the package directory, and `chapterField` containing the validated app chapter field

### Requirement: Workspace packages take precedence over node_modules
When the same package name exists in both a workspace directory and node_modules, the workspace version SHALL take precedence (matching npm workspace behavior).

#### Scenario: Workspace package overrides node_modules
- **WHEN** `@clawmasons/app-github` exists in both `apps/github/` and `node_modules/@clawmasons/app-github/`
- **THEN** the discovery result contains only the workspace version
