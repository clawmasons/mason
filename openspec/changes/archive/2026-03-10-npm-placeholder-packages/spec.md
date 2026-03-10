## Purpose

Create minimal placeholder packages on npm for all clawmasons-adjacent names to prevent namespace squatting and typosquatting attacks. Each placeholder contains a minimal `package.json` and `README.md` directing users to the official project. A publish script automates publishing all placeholders.

## Requirements

### Requirement: Placeholder package directories exist for all reserved names
The system SHALL create a `packages/placeholders/` directory containing subdirectories for each placeholder package: `clawmasons`, `clawmason`, `clawmasons-ai`, `clawmasons-com`, `@clawmasons/acp`, and `@clawmasons/mcp-proxy`.

#### Scenario: All placeholder directories exist
- **GIVEN** the repository is cloned
- **WHEN** listing `packages/placeholders/`
- **THEN** subdirectories exist for: `clawmasons`, `clawmason`, `clawmasons-ai`, `clawmasons-com`, `clawmasons-acp`, `clawmasons-mcp-proxy`

### Requirement: Each placeholder has a valid package.json
Each placeholder directory SHALL contain a `package.json` with: a `name` field matching the npm package name (including `@clawmasons/` scope where applicable), `version` set to `0.0.1`, `description` indicating it is a placeholder, `license` set to `MIT`, and a `repository` field pointing to the clawmasons GitHub repo.

#### Scenario: package.json is valid JSON with correct name
- **GIVEN** a placeholder directory for `@clawmasons/acp`
- **WHEN** reading its `package.json`
- **THEN** the `name` field is `@clawmasons/acp`
- **AND** the `version` field is `0.0.1`
- **AND** the `description` contains "placeholder"
- **AND** `npm pack` succeeds in the directory

#### Scenario: Unscoped package names are correct
- **GIVEN** the placeholder directory for `clawmasons`
- **WHEN** reading its `package.json`
- **THEN** the `name` field is `clawmasons`

### Requirement: Each placeholder has a README.md
Each placeholder directory SHALL contain a `README.md` that identifies the package as a placeholder, directs users to the official GitHub repository, and explains the package exists for namespace protection.

#### Scenario: README directs users to official project
- **GIVEN** any placeholder directory
- **WHEN** reading its `README.md`
- **THEN** it contains a link to `https://github.com/clawmasons/chapter`
- **AND** it states the package is a placeholder for namespace protection

### Requirement: Placeholders are NOT monorepo workspaces
The `packages/placeholders/` directory and its contents SHALL NOT be included in the monorepo's npm workspaces. The root `package.json` workspaces field must exclude them.

#### Scenario: Workspace exclusion
- **GIVEN** the root `package.json` has `workspaces: ["packages/*", "e2e"]`
- **WHEN** npm resolves workspaces
- **THEN** no placeholder package appears as a workspace
- **AND** `npm install` does not attempt to link placeholder packages

### Requirement: Publish script exists and iterates all placeholders
A `scripts/publish-placeholders.sh` bash script SHALL exist that iterates all directories under `packages/placeholders/`, runs `npm publish --access public` in each, and handles scoped packages correctly.

#### Scenario: Publish script iterates all directories
- **GIVEN** `scripts/publish-placeholders.sh` exists
- **WHEN** examining the script
- **THEN** it loops over all subdirectories of `packages/placeholders/`
- **AND** runs `npm publish --access public` in each
- **AND** the script is executable

#### Scenario: npm pack succeeds for each placeholder
- **GIVEN** any placeholder directory
- **WHEN** running `npm pack --dry-run` in that directory
- **THEN** the command exits with status 0
