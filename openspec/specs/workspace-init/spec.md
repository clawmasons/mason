## Purpose

The `forge init` command that scaffolds a new forge monorepo workspace. Creates the directory structure, npm workspace configuration, forge config files, environment template, and .gitignore. Handles edge cases like existing files and idempotent re-runs.

## Requirements

### Requirement: Scaffold workspace directory structure
The `forge init` command SHALL create the following directory structure in the target directory (current working directory by default):
- `apps/` — for app (MCP server) packages
- `tasks/` — for task packages
- `skills/` — for skill packages
- `roles/` — for role packages
- `agents/` — for agent packages
- `.forge/` — for forge workspace configuration

#### Scenario: Init in empty directory
- **WHEN** `forge init` is run in an empty directory
- **THEN** all six directories (`apps/`, `tasks/`, `skills/`, `roles/`, `agents/`, `.forge/`) are created

#### Scenario: Init in directory with existing files
- **WHEN** `forge init` is run in a directory that already has files but no `.forge/` directory
- **THEN** the workspace directories are created alongside existing files without overwriting anything

### Requirement: Generate root package.json with workspaces
The `forge init` command SHALL create a root `package.json` with:
- `"private": true`
- `"workspaces": ["apps/*", "tasks/*", "skills/*", "roles/*", "agents/*"]`
- `"name"` set to the directory name (or the value of `--name` if provided)
- `"version"` set to `"0.1.0"`

#### Scenario: Default package name from directory
- **WHEN** `forge init` is run in a directory named `my-agent-project` without `--name`
- **THEN** the generated package.json has `"name": "my-agent-project"`

#### Scenario: Custom package name via --name flag
- **WHEN** `forge init --name @myorg/agent-workspace` is run
- **THEN** the generated package.json has `"name": "@myorg/agent-workspace"`

#### Scenario: Existing package.json not overwritten
- **WHEN** `forge init` is run in a directory that already has a `package.json` but no `.forge/` directory
- **THEN** the existing `package.json` is NOT overwritten, the workspaces field is NOT added, and a warning is displayed telling the user to add the workspaces configuration manually

### Requirement: Generate .forge/config.json
The `forge init` command SHALL create `.forge/config.json` with default workspace configuration: `{ "version": "0.1.0" }`.

#### Scenario: Config file created with defaults
- **WHEN** `forge init` is run
- **THEN** `.forge/config.json` exists and contains `{ "version": "0.1.0" }`

### Requirement: Generate .forge/.env.example
The `forge init` command SHALL create `.forge/.env.example` as a template for credential bindings with commented placeholder entries for common environment variables.

#### Scenario: Env template created
- **WHEN** `forge init` is run
- **THEN** `.forge/.env.example` exists and contains commented placeholder lines (e.g., `# GITHUB_TOKEN=`, `# ANTHROPIC_API_KEY=`)

### Requirement: Generate .gitignore
The `forge init` command SHALL create a `.gitignore` file with entries for `node_modules/`, `.env`, `dist/`, and `.forge/.env` if no `.gitignore` already exists. If a `.gitignore` exists, it SHALL NOT be overwritten.

#### Scenario: Gitignore created in new workspace
- **WHEN** `forge init` is run in a directory without `.gitignore`
- **THEN** a `.gitignore` file is created with entries for `node_modules/`, `.env`, `dist/`, `.forge/.env`

#### Scenario: Existing gitignore preserved
- **WHEN** `forge init` is run in a directory with an existing `.gitignore`
- **THEN** the existing `.gitignore` is NOT overwritten

### Requirement: Idempotency detection
The `forge init` command SHALL detect an existing forge workspace by the presence of a `.forge/` directory. If detected, it SHALL print a warning message and exit with code 0 without modifying any files.

#### Scenario: Init on existing workspace
- **WHEN** `forge init` is run in a directory that already contains a `.forge/` directory
- **THEN** the command prints a warning like "Workspace already initialized" and exits with code 0 without creating or modifying any files

### Requirement: Name flag for workspace name
The `forge init` command SHALL accept an optional `--name <name>` flag to set the workspace package name in the generated `package.json`.

#### Scenario: Name flag provided
- **WHEN** `forge init --name my-custom-name` is run
- **THEN** the generated package.json has `"name": "my-custom-name"`

### Requirement: Output summary on success
The `forge init` command SHALL print a summary of created files and directories after successful initialization, and suggest next steps (e.g., "Run `forge add <package>` to add agent components").

#### Scenario: Success output
- **WHEN** `forge init` completes successfully
- **THEN** the CLI prints a list of created files/directories and a "next steps" hint
