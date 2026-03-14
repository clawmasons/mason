## Purpose

The `chapter init` command that scaffolds a new chapter monorepo workspace. Creates the directory structure, npm workspace configuration, chapter config files, environment template, and .gitignore. Supports `--template` to bootstrap a working agent project from a bundled template. Handles edge cases like existing files and idempotent re-runs.

## Requirements

### Requirement: Scaffold workspace directory structure
The `chapter init` command SHALL create the following directory structure in the target directory (current working directory by default):
- `apps/` — for app (MCP server) packages
- `tasks/` — for task packages
- `skills/` — for skill packages
- `roles/` — for role packages
- `members/` — for agent packages
- `.chapter/` — for chapter workspace configuration

#### Scenario: Init in empty directory
- **WHEN** `chapter init` is run in an empty directory
- **THEN** all six directories (`apps/`, `tasks/`, `skills/`, `roles/`, `members/`, `.chapter/`) are created

#### Scenario: Init in directory with existing files
- **WHEN** `chapter init` is run in a directory that already has files but no `.chapter/` directory
- **THEN** the workspace directories are created alongside existing files without overwriting anything

### Requirement: Generate root package.json with workspaces
The `chapter init` command SHALL create a root `package.json` with:
- `"private": true`
- `"workspaces": ["apps/*", "tasks/*", "skills/*", "roles/*", "members/*"]`
- `"name"` set to the directory name (or the value of `--name` if provided)
- `"version"` set to `"0.1.0"`

When a template provides a `package.json`, the template's version is used instead (with placeholder substitution applied).

#### Scenario: Default package name from directory
- **WHEN** `chapter init` is run in a directory named `my-agent-project` without `--name`
- **THEN** the generated package.json has `"name": "my-agent-project"`

#### Scenario: Custom package name via --name flag
- **WHEN** `chapter init --name @myorg/agent-workspace` is run
- **THEN** the generated package.json has `"name": "@myorg/agent-workspace"`

#### Scenario: Existing package.json not overwritten
- **WHEN** `chapter init` is run in a directory that already has a `package.json` but no `.chapter/` directory
- **THEN** the existing `package.json` is NOT overwritten, the workspaces field is NOT added, and a warning is displayed telling the user to add the workspaces configuration manually

### Requirement: Generate .chapter/config.json
The `chapter init` command SHALL create `.chapter/config.json` with default workspace configuration: `{ "version": "0.1.0" }`.

#### Scenario: Config file created with defaults
- **WHEN** `chapter init` is run
- **THEN** `.chapter/config.json` exists and contains `{ "version": "0.1.0" }`

### Requirement: Generate .chapter/.env.example
The `chapter init` command SHALL create `.chapter/.env.example` as a template for credential bindings with commented placeholder entries for common environment variables.

#### Scenario: Env template created
- **WHEN** `chapter init` is run
- **THEN** `.chapter/.env.example` exists and contains commented placeholder lines (e.g., `# GITHUB_TOKEN=`, `# ANTHROPIC_API_KEY=`)

### Requirement: Generate .gitignore
The `chapter init` command SHALL create a `.gitignore` file with entries for `node_modules/`, `.env`, `dist/`, and `.chapter/.env` if no `.gitignore` already exists. If a `.gitignore` exists, it SHALL NOT be overwritten.

#### Scenario: Gitignore created in new workspace
- **WHEN** `chapter init` is run in a directory without `.gitignore`
- **THEN** a `.gitignore` file is created with entries for `node_modules/`, `.env`, `dist/`, `.chapter/.env`

#### Scenario: Existing gitignore preserved
- **WHEN** `chapter init` is run in a directory with an existing `.gitignore`
- **THEN** the existing `.gitignore` is NOT overwritten

### Requirement: Idempotency detection
The `chapter init` command SHALL detect an existing chapter workspace by the presence of a `.chapter/` directory. If detected, it SHALL print a warning message and exit with code 0 without modifying any files.

#### Scenario: Init on existing workspace
- **WHEN** `chapter init` is run in a directory that already contains a `.chapter/` directory
- **THEN** the command prints a warning like "Workspace already initialized" and exits with code 0 without creating or modifying any files

### Requirement: Name flag for workspace name
The `chapter init` command SHALL accept an optional `--name <name>` flag to set the workspace package name in the generated `package.json`.

#### Scenario: Name flag provided
- **WHEN** `chapter init --name my-custom-name` is run
- **THEN** the generated package.json has `"name": "my-custom-name"`

### Requirement: Output summary on success
The `chapter init` command SHALL print a summary of created files and directories after successful initialization, and suggest next steps. When a template is used, the next steps SHALL include project-scoped agent commands.

#### Scenario: Success output without template
- **WHEN** `chapter init` completes successfully without `--template`
- **THEN** the CLI prints a list of created files/directories and generic next-step hints

#### Scenario: Success output with template
- **WHEN** `chapter init --template note-taker` completes in `/tmp/test-chapter/`
- **THEN** the CLI prints the template name and next-step commands using the project scope (e.g., `chapter validate @test-chapter/member-note-taker`)

### Requirement: Template directory structure
The `@clawmasons/mason` package SHALL contain a `templates/` directory with at least one template (`note-taker/`). Each template directory SHALL contain the files needed to bootstrap a working chapter project.

#### Scenario: note-taker template exists
- **WHEN** the `templates/` directory is inspected
- **THEN** `note-taker/` exists containing `package.json`, `members/note-taker/package.json`, `roles/writer/package.json`, `apps/filesystem/package.json`, `tasks/take-notes/package.json`, `tasks/take-notes/prompts/take-notes.md`, `skills/markdown-conventions/package.json`, and `skills/markdown-conventions/SKILL.md`

#### Scenario: Template root package.json has no external dependencies
- **WHEN** `templates/note-taker/package.json` is read
- **THEN** it does NOT list `@clawmasons/chapter-core` as a dependency; `dependencies` is empty or absent

#### Scenario: Template member references local role
- **WHEN** `templates/note-taker/members/note-taker/package.json` is read
- **THEN** the chapter field has `type: "member"`, `memberType: "agent"`, and `roles` contains `@{{projectScope}}/role-writer`

#### Scenario: Template role references local components
- **WHEN** `templates/note-taker/roles/writer/package.json` is read
- **THEN** the chapter field has `type: "role"`, tasks include `@{{projectScope}}/task-take-notes`, skills include `@{{projectScope}}/skill-markdown-conventions`, and permissions reference `@{{projectScope}}/app-filesystem`

#### Scenario: Template member includes identity fields
- **WHEN** `templates/note-taker/members/note-taker/package.json` is read
- **THEN** the chapter field includes `name`, `slug`, `email`, and `authProviders` fields as required by the member schema

#### Scenario: Template member validates against member schema after init
- **WHEN** `chapter init --template note-taker --name @acme/my-project` is run and the generated `members/note-taker/package.json` chapter field is parsed with `parseChapterField()`
- **THEN** the parse succeeds, `type` is `"member"`, and `memberType` is `"agent"`

### Requirement: chapter init --template copies template files
The `chapter init` command SHALL accept a `--template <name>` option. When specified, it SHALL copy all files from the named template directory into the target directory before creating the chapter scaffold.

#### Scenario: Init with template in empty directory
- **WHEN** `chapter init --template note-taker` is run in an empty directory
- **THEN** template files are copied (package.json, members/, roles/), `.chapter/` is created, and `npm install` is run

#### Scenario: Init with template and custom name
- **WHEN** `chapter init --template note-taker --name @acme/my-agent` is run
- **THEN** the root `package.json` has `name: "@acme/my-agent"` and local components are scoped as `@acme/*`

#### Scenario: Init with unknown template shows error
- **WHEN** `chapter init --template nonexistent` is run
- **THEN** the command prints an error listing available templates and exits without modifying the directory

### Requirement: Template placeholder substitution
Template `package.json` files SHALL support `{{projectName}}` and `{{projectScope}}` placeholders. During `chapter init`, `{{projectName}}` SHALL be replaced with the full project name (from `--name` or directory basename). `{{projectScope}}` SHALL be replaced with the scope portion derived from the project name (e.g., `@acme/my-agent` yields `acme`, `test-chapter` yields `test-chapter`). Only `package.json` files undergo substitution.

#### Scenario: Directory name used as project scope
- **WHEN** `chapter init --template note-taker` is run in `/tmp/test-chapter/`
- **THEN** `{{projectScope}}` is replaced with `test-chapter`, so the local member is named `@test-chapter/member-note-taker`

#### Scenario: Scoped name extracts scope portion
- **WHEN** `chapter init --template note-taker --name @acme/my-agent` is run
- **THEN** `{{projectScope}}` is replaced with `acme`, so the local member is named `@acme/member-note-taker`

### Requirement: chapter init lists available templates
When `chapter init` is run without `--template`, the command SHALL display a list of available templates before proceeding with the bare scaffold.

#### Scenario: No template specified shows available templates
- **WHEN** `chapter init` is run without `--template`
- **THEN** the output includes "Available templates:" followed by template names (e.g., `note-taker`)

### Requirement: npm install after template scaffolding
When `chapter init` is run with `--template`, the command SHALL run `npm install` in the target directory after copying template files and creating the chapter scaffold.

#### Scenario: npm install runs after template init
- **WHEN** `chapter init --template note-taker` completes
- **THEN** `npm install` has been executed in the target directory

### Requirement: Templates bundled in chapter package
The root `package.json` SHALL include `"templates"` in its `files` array so that templates are included when the package is published or packed via `npm pack`.

#### Scenario: files array includes templates
- **WHEN** the root `package.json` is read
- **THEN** the `files` array contains `"templates"`
