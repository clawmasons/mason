## Purpose

The `forge init` command that scaffolds a new forge monorepo workspace. Creates the directory structure, npm workspace configuration, forge config files, environment template, and .gitignore. Supports `--template` to bootstrap a working agent project from a bundled template. Handles edge cases like existing files and idempotent re-runs.

## Requirements

### Requirement: Scaffold workspace directory structure
The `forge init` command SHALL create the following directory structure in the target directory (current working directory by default):
- `apps/` — for app (MCP server) packages
- `tasks/` — for task packages
- `skills/` — for skill packages
- `roles/` — for role packages
- `members/` — for agent packages
- `.forge/` — for forge workspace configuration

#### Scenario: Init in empty directory
- **WHEN** `forge init` is run in an empty directory
- **THEN** all six directories (`apps/`, `tasks/`, `skills/`, `roles/`, `members/`, `.forge/`) are created

#### Scenario: Init in directory with existing files
- **WHEN** `forge init` is run in a directory that already has files but no `.forge/` directory
- **THEN** the workspace directories are created alongside existing files without overwriting anything

### Requirement: Generate root package.json with workspaces
The `forge init` command SHALL create a root `package.json` with:
- `"private": true`
- `"workspaces": ["apps/*", "tasks/*", "skills/*", "roles/*", "members/*"]`
- `"name"` set to the directory name (or the value of `--name` if provided)
- `"version"` set to `"0.1.0"`

When a template provides a `package.json`, the template's version is used instead (with placeholder substitution applied).

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
The `forge init` command SHALL print a summary of created files and directories after successful initialization, and suggest next steps. When a template is used, the next steps SHALL include project-scoped agent commands.

#### Scenario: Success output without template
- **WHEN** `forge init` completes successfully without `--template`
- **THEN** the CLI prints a list of created files/directories and generic next-step hints

#### Scenario: Success output with template
- **WHEN** `forge init --template note-taker` completes in `/tmp/test-forge/`
- **THEN** the CLI prints the template name and next-step commands using the project scope (e.g., `forge validate @test-forge/member-note-taker`)

### Requirement: Template directory structure
The `@clawmasons/chapter` package SHALL contain a `templates/` directory with at least one template (`note-taker/`). Each template directory SHALL contain the files needed to bootstrap a working forge project.

#### Scenario: note-taker template exists
- **WHEN** the `templates/` directory is inspected
- **THEN** `note-taker/` exists containing `package.json`, `members/note-taker/package.json`, and `roles/writer/package.json`

#### Scenario: Template root package.json depends on chapter-core
- **WHEN** `templates/note-taker/package.json` is read
- **THEN** it lists `@clawmasons/chapter-core` as a dependency with a version range

#### Scenario: Template member references local role
- **WHEN** `templates/note-taker/members/note-taker/package.json` is read
- **THEN** the chapter field has `type: "agent"` and `roles` contains `@{{projectScope}}/role-writer`

#### Scenario: Template role references chapter-core components
- **WHEN** `templates/note-taker/roles/writer/package.json` is read
- **THEN** the chapter field has `type: "role"`, tasks include `@clawmasons/task-take-notes`, skills include `@clawmasons/skill-markdown-conventions`, and permissions reference `@clawmasons/app-filesystem`

### Requirement: forge init --template copies template files
The `forge init` command SHALL accept a `--template <name>` option. When specified, it SHALL copy all files from the named template directory into the target directory before creating the forge scaffold.

#### Scenario: Init with template in empty directory
- **WHEN** `forge init --template note-taker` is run in an empty directory
- **THEN** template files are copied (package.json, members/, roles/), `.forge/` is created, and `npm install` is run

#### Scenario: Init with template and custom name
- **WHEN** `forge init --template note-taker --name @acme/my-agent` is run
- **THEN** the root `package.json` has `name: "@acme/my-agent"` and local components are scoped as `@acme/*`

#### Scenario: Init with unknown template shows error
- **WHEN** `forge init --template nonexistent` is run
- **THEN** the command prints an error listing available templates and exits without modifying the directory

### Requirement: Template placeholder substitution
Template `package.json` files SHALL support `{{projectName}}` and `{{projectScope}}` placeholders. During `forge init`, `{{projectName}}` SHALL be replaced with the full project name (from `--name` or directory basename). `{{projectScope}}` SHALL be replaced with the scope portion derived from the project name (e.g., `@acme/my-agent` yields `acme`, `test-forge` yields `test-forge`). Only `package.json` files undergo substitution.

#### Scenario: Directory name used as project scope
- **WHEN** `forge init --template note-taker` is run in `/tmp/test-forge/`
- **THEN** `{{projectScope}}` is replaced with `test-forge`, so the local member is named `@test-forge/member-note-taker`

#### Scenario: Scoped name extracts scope portion
- **WHEN** `forge init --template note-taker --name @acme/my-agent` is run
- **THEN** `{{projectScope}}` is replaced with `acme`, so the local member is named `@acme/member-note-taker`

### Requirement: forge init lists available templates
When `forge init` is run without `--template`, the command SHALL display a list of available templates before proceeding with the bare scaffold.

#### Scenario: No template specified shows available templates
- **WHEN** `forge init` is run without `--template`
- **THEN** the output includes "Available templates:" followed by template names (e.g., `note-taker`)

### Requirement: npm install after template scaffolding
When `forge init` is run with `--template`, the command SHALL run `npm install` in the target directory after copying template files and creating the forge scaffold.

#### Scenario: npm install runs after template init
- **WHEN** `forge init --template note-taker` completes
- **THEN** `npm install` has been executed in the target directory

### Requirement: Templates bundled in chapter package
The root `package.json` SHALL include `"templates"` in its `files` array so that templates are included when the package is published or packed via `npm pack`.

#### Scenario: files array includes templates
- **WHEN** the root `package.json` is read
- **THEN** the `files` array contains `"templates"`
