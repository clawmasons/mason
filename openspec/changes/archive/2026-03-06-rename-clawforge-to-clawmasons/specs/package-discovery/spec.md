## MODIFIED Requirements

### Requirement: Discover forge packages from node_modules

The resolver SHALL scan `node_modules/` for packages with forge metadata.

#### Scenario: Discover packages in node_modules

- **WHEN** the resolver scans `node_modules/@clawmasons/`
- **THEN** packages like `node_modules/@clawmasons/app-github/package.json` SHALL be discovered

### Requirement: Discover forge sub-packages inside node_modules packages with workspace dirs

The resolver SHALL scan workspace directories inside discovered node_modules packages.

#### Scenario: Discover sub-components

- **WHEN** a node_modules package like `@clawmasons/forge-core` contains workspace directories
- **THEN** sub-packages SHALL be discovered (e.g., `@clawmasons/app-filesystem`, `@clawmasons/task-take-notes`, `@clawmasons/skill-markdown-conventions`)

#### Scenario: Workspace-local packages take precedence

- **WHEN** `@clawmasons/app-filesystem` exists in both local `apps/` and `node_modules/`
- **THEN** the local version SHALL take precedence

### Requirement: DiscoveredPackage data structure

Each discovered package SHALL include name, version, path, and forge metadata.

#### Scenario: DiscoveredPackage contains all fields

- **WHEN** a package `@clawmasons/app-github` version `1.2.0` is discovered
- **THEN** the result SHALL contain the name, version, absolute path, and parsed forge fields

### Requirement: Workspace packages take precedence over node_modules

Local workspace packages SHALL override identically-named node_modules packages.

#### Scenario: Workspace package overrides node_modules

- **WHEN** `@clawmasons/app-github` exists in both the workspace and node_modules
- **THEN** the workspace version SHALL be used
