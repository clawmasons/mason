## ADDED Requirements

### Requirement: Template directory structure
The `@clawmasons/forge` package SHALL contain a `templates/` directory with at least one template (`note-taker/`). Each template directory SHALL contain the files needed to bootstrap a working forge project.

#### Scenario: note-taker template exists
- **WHEN** the `templates/` directory is inspected
- **THEN** `note-taker/` exists containing `package.json`, `agents/note-taker/package.json`, and `roles/writer/package.json`

#### Scenario: Template root package.json depends on forge-core
- **WHEN** `templates/note-taker/package.json` is read
- **THEN** it lists `@clawmasons/forge-core` as a dependency with a version range

#### Scenario: Template agent references local role
- **WHEN** `templates/note-taker/agents/note-taker/package.json` is read
- **THEN** the forge field has `type: "agent"` and `roles` contains `@{{projectScope}}/role-writer`

#### Scenario: Template role references forge-core components
- **WHEN** `templates/note-taker/roles/writer/package.json` is read
- **THEN** the forge field has `type: "role"`, tasks include `@clawmasons/task-take-notes`, skills include `@clawmasons/skill-markdown-conventions`, and permissions reference `@clawmasons/app-filesystem`

### Requirement: forge init --template copies template files
The `forge init` command SHALL accept a `--template <name>` option. When specified, it SHALL copy all files from the named template directory into the target directory before creating the forge scaffold.

#### Scenario: Init with template in empty directory
- **WHEN** `forge init --template note-taker` is run in an empty directory
- **THEN** template files are copied (package.json, agents/, roles/), `.forge/` is created, and `npm install` is run

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
- **THEN** `{{projectScope}}` is replaced with `test-forge`, so the local agent is named `@test-forge/agent-note-taker`

#### Scenario: Scoped name extracts scope portion
- **WHEN** `forge init --template note-taker --name @acme/my-agent` is run
- **THEN** `{{projectScope}}` is replaced with `acme`, so the local agent is named `@acme/agent-note-taker`

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

### Requirement: Templates bundled in forge package
The root `package.json` SHALL include `"templates"` in its `files` array so that templates are included when the package is published or packed via `npm pack`.

#### Scenario: files array includes templates
- **WHEN** the root `package.json` is read
- **THEN** the `files` array contains `"templates"`

### Requirement: Template-specific next steps output
When `forge init` completes with a template, the success output SHALL include next-step commands using the project-scoped agent name.

#### Scenario: Next steps show project-scoped names
- **WHEN** `forge init --template note-taker` completes in `/tmp/test-forge/`
- **THEN** the output includes commands like `forge validate @test-forge/agent-note-taker` and `forge list`

## MODIFIED Requirements

### Requirement: Output summary on success
Updated to include template-specific next steps when a template is used. When no template is used, the original generic next-step hints are shown.

## UNCHANGED Requirements

All existing workspace-init requirements (directory creation, package.json generation, .forge/config.json, .env.example, .gitignore, idempotency, --name flag) remain unchanged and continue to function as specified.
