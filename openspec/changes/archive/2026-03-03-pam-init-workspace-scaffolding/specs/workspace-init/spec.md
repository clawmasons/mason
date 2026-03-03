## ADDED Requirements

### Requirement: Scaffold workspace directory structure
The `pam init` command SHALL create the following directory structure in the target directory (current working directory by default):
- `apps/` — for app (MCP server) packages
- `tasks/` — for task packages
- `skills/` — for skill packages
- `roles/` — for role packages
- `agents/` — for agent packages
- `.pam/` — for pam workspace configuration

#### Scenario: Init in empty directory
- **WHEN** `pam init` is run in an empty directory
- **THEN** all six directories (`apps/`, `tasks/`, `skills/`, `roles/`, `agents/`, `.pam/`) are created

#### Scenario: Init in directory with existing files
- **WHEN** `pam init` is run in a directory that already has files but no `.pam/` directory
- **THEN** the workspace directories are created alongside existing files without overwriting anything

### Requirement: Generate root package.json with workspaces
The `pam init` command SHALL create a root `package.json` with:
- `"private": true`
- `"workspaces": ["apps/*", "tasks/*", "skills/*", "roles/*", "agents/*"]`
- `"name"` set to the directory name (or the value of `--name` if provided)
- `"version"` set to `"0.1.0"`

#### Scenario: Default package name from directory
- **WHEN** `pam init` is run in a directory named `my-agent-project` without `--name`
- **THEN** the generated package.json has `"name": "my-agent-project"`

#### Scenario: Custom package name via --name flag
- **WHEN** `pam init --name @myorg/agent-workspace` is run
- **THEN** the generated package.json has `"name": "@myorg/agent-workspace"`

#### Scenario: Existing package.json not overwritten
- **WHEN** `pam init` is run in a directory that already has a `package.json` but no `.pam/` directory
- **THEN** the existing `package.json` is NOT overwritten, the workspaces field is NOT added, and a warning is displayed telling the user to add the workspaces configuration manually

### Requirement: Generate .pam/config.json
The `pam init` command SHALL create `.pam/config.json` with default workspace configuration: `{ "version": "0.1.0" }`.

#### Scenario: Config file created with defaults
- **WHEN** `pam init` is run
- **THEN** `.pam/config.json` exists and contains `{ "version": "0.1.0" }`

### Requirement: Generate .pam/.env.example
The `pam init` command SHALL create `.pam/.env.example` as a template for credential bindings with commented placeholder entries for common environment variables.

#### Scenario: Env template created
- **WHEN** `pam init` is run
- **THEN** `.pam/.env.example` exists and contains commented placeholder lines (e.g., `# GITHUB_TOKEN=`, `# ANTHROPIC_API_KEY=`)

### Requirement: Generate .gitignore
The `pam init` command SHALL create a `.gitignore` file with entries for `node_modules/`, `.env`, `dist/`, and `.pam/.env` if no `.gitignore` already exists. If a `.gitignore` exists, it SHALL NOT be overwritten.

#### Scenario: Gitignore created in new workspace
- **WHEN** `pam init` is run in a directory without `.gitignore`
- **THEN** a `.gitignore` file is created with entries for `node_modules/`, `.env`, `dist/`, `.pam/.env`

#### Scenario: Existing gitignore preserved
- **WHEN** `pam init` is run in a directory with an existing `.gitignore`
- **THEN** the existing `.gitignore` is NOT overwritten

### Requirement: Idempotency detection
The `pam init` command SHALL detect an existing pam workspace by the presence of a `.pam/` directory. If detected, it SHALL print a warning message and exit with code 0 without modifying any files.

#### Scenario: Init on existing workspace
- **WHEN** `pam init` is run in a directory that already contains a `.pam/` directory
- **THEN** the command prints a warning like "Workspace already initialized" and exits with code 0 without creating or modifying any files

### Requirement: Name flag for workspace name
The `pam init` command SHALL accept an optional `--name <name>` flag to set the workspace package name in the generated `package.json`.

#### Scenario: Name flag provided
- **WHEN** `pam init --name my-custom-name` is run
- **THEN** the generated package.json has `"name": "my-custom-name"`

### Requirement: Output summary on success
The `pam init` command SHALL print a summary of created files and directories after successful initialization, and suggest next steps (e.g., "Run `pam add <package>` to add agent components").

#### Scenario: Success output
- **WHEN** `pam init` completes successfully
- **THEN** the CLI prints a list of created files/directories and a "next steps" hint
