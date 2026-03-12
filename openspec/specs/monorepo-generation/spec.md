## Purpose

Generate a publishable npm monorepo from a local role definition, enabling distribution of roles and their dependencies through npm package registries. Implements the `mason init-repo --role <name> [--target-dir <path>]` command that reads a local RoleType and creates a complete npm workspace structure with separate packages for the role and each dependency (skills, apps, tasks).

## Requirements

### Requirement: Monorepo Generation Command

The system SHALL provide a `mason init-repo` command that generates an npm workspace monorepo from a local role definition.

#### Scenario: Generate monorepo from local role
- **GIVEN** a local role named "create-prd" defined in `.claude/roles/create-prd/ROLE.md`
- **WHEN** `mason init-repo --role create-prd` is executed
- **THEN** a monorepo is created at `.clawmasons/repositories/create-prd/` with the correct workspace structure

#### Scenario: Custom target directory
- **GIVEN** a local role named "create-prd"
- **WHEN** `mason init-repo --role create-prd --target-dir ./my-repo` is executed
- **THEN** the monorepo is created at `./my-repo/` instead of the default location

#### Scenario: Default target directory
- **GIVEN** a local role named "create-prd"
- **WHEN** `mason init-repo --role create-prd` is executed without `--target-dir`
- **THEN** the monorepo is created at `.clawmasons/repositories/create-prd/`

#### Scenario: Reject packaged roles
- **GIVEN** a role that was installed as an npm package (source.type = "package")
- **WHEN** `mason init-repo --role <name>` is executed
- **THEN** the command exits with an error explaining that only local roles can be used

### Requirement: Generated Directory Structure (PRD §11.3)

The generated monorepo SHALL match the structure defined in PRD §11.3.

#### Scenario: Root package.json
- **GIVEN** a role with skills, apps, and tasks
- **WHEN** the monorepo is generated
- **THEN** the root `package.json` has `private: true` and `workspaces` listing all dependency directories

#### Scenario: Role package
- **GIVEN** a role named "create-prd"
- **WHEN** the monorepo is generated
- **THEN** `roles/create-prd/package.json` exists with `chapter.type = "role"` and `roles/create-prd/ROLE.md` contains the role definition

#### Scenario: Skill packages
- **GIVEN** a role with skill dependencies
- **WHEN** the monorepo is generated
- **THEN** each skill has a directory under `skills/` with a `package.json` containing `chapter.type = "skill"`

#### Scenario: App packages
- **GIVEN** a role with app (MCP server) dependencies
- **WHEN** the monorepo is generated
- **THEN** each app has a directory under `apps/` with a `package.json` containing `chapter.type = "app"`

#### Scenario: Task packages
- **GIVEN** a role with task dependencies
- **WHEN** the monorepo is generated
- **THEN** each task has a directory under `tasks/` with a `package.json` containing `chapter.type = "task"` and a `PROMPT.md` placeholder

#### Scenario: Role with no dependencies
- **GIVEN** a role with no skills, apps, or tasks
- **WHEN** the monorepo is generated
- **THEN** only the `roles/` workspace directory is included; `skills/`, `apps/`, `tasks/` directories are not created

### Requirement: Package Name Generation

The system SHALL derive npm-compatible package names from role metadata.

#### Scenario: Scope from role metadata
- **GIVEN** a role with `scope: "acme.engineering"`
- **WHEN** package names are generated
- **THEN** all packages use the `@acme-engineering/` npm scope prefix

#### Scenario: No scope
- **GIVEN** a role with no scope defined
- **WHEN** package names are generated
- **THEN** packages use no scope prefix (e.g., `role-create-prd` instead of `@scope/role-create-prd`)

### Requirement: ROLE.md Handling

The system SHALL copy or generate a ROLE.md file in the role package.

#### Scenario: Copy from source
- **GIVEN** a role with an accessible source ROLE.md file
- **WHEN** the monorepo is generated
- **THEN** the ROLE.md is copied from the source to the role package directory

#### Scenario: Generate fallback
- **GIVEN** a role whose source ROLE.md is not accessible
- **WHEN** the monorepo is generated
- **THEN** a minimal ROLE.md is generated with the role's name, description, and instructions

### Requirement: Distribution Workflow (PRD §11.4)

The generated monorepo SHALL support standard npm distribution workflows.

#### Scenario: Workspace configuration supports npm publish
- **GIVEN** a generated monorepo
- **THEN** the root `package.json` has a valid `workspaces` array and `private: true`
- **AND** each sub-package has a valid `package.json` with `name`, `version`, and `chapter` fields

### Requirement: CLI Registration

The `mason init-repo` command SHALL be registered under the `mason` command group.

#### Scenario: Command is accessible
- **WHEN** `clawmasons mason init-repo --role <name>` is invoked
- **THEN** the command executes the monorepo generation flow
