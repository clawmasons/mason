## MODIFIED Requirements

### Requirement: Discover forge packages from node_modules (ENHANCED)
The system SHALL scan `node_modules/` under the project root to find installed packages with valid `forge` fields, including scoped packages. **Additionally**, when a package in `node_modules/` contains any of the standard workspace directories (`apps/`, `tasks/`, `skills/`, `roles/`, `agents/`), the system SHALL scan those directories for forge sub-packages and register them.

#### Scenario: Discover sub-components inside a node_modules package with workspace dirs
- **WHEN** `discoverPackages(rootDir)` is called and `node_modules/@clawforge/forge-core/apps/filesystem/package.json` contains a valid app forge field, `node_modules/@clawforge/forge-core/tasks/take-notes/package.json` contains a valid task forge field, and `node_modules/@clawforge/forge-core/skills/markdown-conventions/package.json` contains a valid skill forge field
- **THEN** the result map contains entries for `@clawforge/app-filesystem`, `@clawforge/task-take-notes`, and `@clawforge/skill-markdown-conventions`

#### Scenario: Workspace-local packages take precedence over node_modules sub-components
- **WHEN** `discoverPackages(rootDir)` is called and `apps/filesystem/package.json` exists locally with name `@clawforge/app-filesystem` version `2.0.0`, AND `node_modules/@clawforge/forge-core/apps/filesystem/package.json` also has name `@clawforge/app-filesystem` version `1.0.0`
- **THEN** the result map contains `@clawforge/app-filesystem` with version `2.0.0` (the local version)

#### Scenario: Node_modules packages without workspace dirs are unaffected
- **WHEN** `discoverPackages(rootDir)` is called and `node_modules/some-app/package.json` has a valid forge field but no workspace subdirectories
- **THEN** `some-app` is discovered via its direct forge field (existing behavior unchanged)

#### Scenario: Package with both direct forge field and workspace dirs
- **WHEN** `discoverPackages(rootDir)` is called and `node_modules/@org/lib/package.json` has a valid forge field AND `node_modules/@org/lib/apps/tool/package.json` also has a valid forge field
- **THEN** both the library package and the sub-component are registered in the result map

#### Scenario: Direct forge-field packages in node_modules still take lower precedence than workspace
- **WHEN** `discoverPackages(rootDir)` is called and `node_modules/@clawforge/app-github/package.json` has a valid forge field, AND `apps/github/package.json` exists locally with the same name
- **THEN** the local workspace version is in the result map (existing precedence behavior preserved)
