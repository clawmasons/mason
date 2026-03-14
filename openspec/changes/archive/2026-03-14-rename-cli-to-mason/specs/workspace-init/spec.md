## MODIFIED Requirements

### Requirement: Scaffold workspace directory structure
The `mason init` command SHALL create the following directory structure in the target directory (current working directory by default):
- `apps/` — for app (MCP server) packages
- `tasks/` — for task packages
- `skills/` — for skill packages
- `roles/` — for role packages
- `members/` — for agent packages
- `.mason/` — for workspace configuration

#### Scenario: Init in empty directory
- **WHEN** `mason init` is run in an empty directory
- **THEN** all six directories (`apps/`, `tasks/`, `skills/`, `roles/`, `members/`, `.mason/`) are created

#### Scenario: Init in directory with existing files
- **WHEN** `mason init` is run in a directory that already has files but no `.mason/` directory
- **THEN** the workspace directories are created alongside existing files without overwriting anything

### Requirement: Generate .chapter/config.json
The `mason init` command SHALL create `.mason/config.json` with default workspace configuration: `{ "version": "0.1.0" }`.

#### Scenario: Config file created with defaults
- **WHEN** `mason init` is run
- **THEN** `.mason/config.json` exists and contains `{ "version": "0.1.0" }`

### Requirement: Generate .chapter/.env.example
The `mason init` command SHALL create `.mason/.env.example` as a template for credential bindings with commented placeholder entries for common environment variables.

#### Scenario: Env template created
- **WHEN** `mason init` is run
- **THEN** `.mason/.env.example` exists and contains commented placeholder lines (e.g., `# GITHUB_TOKEN=`, `# ANTHROPIC_API_KEY=`)

### Requirement: Generate .gitignore
The `mason init` command SHALL create a `.gitignore` file with entries for `node_modules/`, `.env`, `dist/`, and `.mason/.env` if no `.gitignore` already exists. If a `.gitignore` exists, it SHALL NOT be overwritten.

#### Scenario: Gitignore created in new workspace
- **WHEN** `mason init` is run in a directory without `.gitignore`
- **THEN** a `.gitignore` file is created with entries for `node_modules/`, `.env`, `dist/`, `.mason/.env`

#### Scenario: Existing gitignore preserved
- **WHEN** `mason init` is run in a directory with an existing `.gitignore`
- **THEN** the existing `.gitignore` is NOT overwritten

### Requirement: Idempotency detection
The `mason init` command SHALL detect an existing workspace by the presence of a `.mason/` directory. If detected, it SHALL print a warning message and exit with code 0 without modifying any files.

#### Scenario: Init on existing workspace
- **WHEN** `mason init` is run in a directory that already contains a `.mason/` directory
- **THEN** the command prints a warning like "Workspace already initialized" and exits with code 0 without creating or modifying any files

### Requirement: Output summary on success
The `mason init` command SHALL print a summary of created files and directories after successful initialization, and suggest next steps. When a template is used, the next steps SHALL include project-scoped agent commands.

#### Scenario: Success output without template
- **WHEN** `mason init` completes successfully without `--template`
- **THEN** the CLI prints a list of created files/directories and generic next-step hints

#### Scenario: Success output with template
- **WHEN** `mason init --template note-taker` completes in `/tmp/test-project/`
- **THEN** the CLI prints the template name and next-step commands using the project scope (e.g., `mason validate @test-project/member-note-taker`)

### Requirement: Template directory structure
The `@clawmasons/mason` package SHALL contain a `templates/` directory with at least one template (`note-taker/`). Each template directory SHALL contain the files needed to bootstrap a working project.

#### Scenario: note-taker template exists
- **WHEN** the `templates/` directory is inspected
- **THEN** `note-taker/` exists containing `package.json`, `members/note-taker/package.json`, `roles/writer/package.json`, `apps/filesystem/package.json`, `tasks/take-notes/package.json`, `tasks/take-notes/prompts/take-notes.md`, `skills/markdown-conventions/package.json`, and `skills/markdown-conventions/SKILL.md`

#### Scenario: Template root package.json has no external dependencies
- **WHEN** `templates/note-taker/package.json` is read
- **THEN** it does NOT list `@clawmasons/chapter-core` as a dependency; `dependencies` is empty or absent

### Requirement: chapter init --template copies template files
The `mason init` command SHALL accept a `--template <name>` option. When specified, it SHALL copy all files from the named template directory into the target directory before creating the scaffold.

#### Scenario: Init with template in empty directory
- **WHEN** `mason init --template note-taker` is run in an empty directory
- **THEN** template files are copied (package.json, members/, roles/), `.mason/` is created, and `npm install` is run

#### Scenario: Init with template and custom name
- **WHEN** `mason init --template note-taker --name @acme/my-agent` is run
- **THEN** the root `package.json` has `name: "@acme/my-agent"` and local components are scoped as `@acme/*`

#### Scenario: Init with unknown template shows error
- **WHEN** `mason init --template nonexistent` is run
- **THEN** the command prints an error listing available templates and exits without modifying the directory
