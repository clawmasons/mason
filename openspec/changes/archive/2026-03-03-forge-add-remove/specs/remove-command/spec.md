## ADDED Requirements

### Requirement: CLI registration for forge remove
The `forge remove` command SHALL be registered as a Commander.js command with a required `<pkg>` argument, a `--force` option, and optional variadic `[npmArgs...]` for forwarding to npm.

#### Scenario: Command is registered
- **WHEN** the CLI program is initialized
- **THEN** a command named "remove" SHALL be available with description containing "Remove"
- **AND** it SHALL accept a required argument named "pkg"
- **AND** it SHALL have a `--force` boolean option

### Requirement: Dependent package checking
Before removing a package, the command SHALL scan all discovered forge packages in the workspace to find packages that reference the target package in their `forge` field.

#### Scenario: No dependents found
- **WHEN** `forge remove @clawforge/app-unused` is run and no other package references it
- **THEN** the command SHALL proceed with npm uninstall

#### Scenario: Dependents found without --force
- **WHEN** `forge remove @clawforge/app-github` is run and `@clawforge/role-manager` references it in `permissions`
- **THEN** the command SHALL NOT run npm uninstall
- **AND** SHALL print an error listing the dependent packages
- **AND** SHALL suggest using `--force` to override
- **AND** SHALL exit with code 1

#### Scenario: Dependents found with --force
- **WHEN** `forge remove @clawforge/app-github --force` is run and dependents exist
- **THEN** the command SHALL print a warning listing the dependent packages
- **AND** SHALL proceed with npm uninstall despite the dependents

### Requirement: Dependency reference detection
The dependent checker SHALL detect references to the target package in the following forge field locations:

#### Scenario: Role permissions reference
- **WHEN** a role has `permissions: { "@target/app": { allow: [...] } }`
- **THEN** the role SHALL be identified as a dependent of `@target/app`

#### Scenario: Role tasks reference
- **WHEN** a role has `tasks: ["@target/task"]`
- **THEN** the role SHALL be identified as a dependent of `@target/task`

#### Scenario: Role skills reference
- **WHEN** a role has `skills: ["@target/skill"]`
- **THEN** the role SHALL be identified as a dependent of `@target/skill`

#### Scenario: Task requires apps reference
- **WHEN** a task has `requires: { apps: ["@target/app"] }`
- **THEN** the task SHALL be identified as a dependent of `@target/app`

#### Scenario: Task requires skills reference
- **WHEN** a task has `requires: { skills: ["@target/skill"] }`
- **THEN** the task SHALL be identified as a dependent of `@target/skill`

#### Scenario: Agent roles reference
- **WHEN** an agent has `roles: ["@target/role"]`
- **THEN** the agent SHALL be identified as a dependent of `@target/role`

### Requirement: npm uninstall delegation
When removal is permitted (no dependents or `--force`), the command SHALL delegate to npm by executing `npm uninstall <pkg> [npmArgs...]` in the workspace root directory.

#### Scenario: Successful removal
- **WHEN** npm uninstall succeeds
- **THEN** the command SHALL print a success message containing the package name
- **AND** SHALL exit with code 0

#### Scenario: npm uninstall failure
- **WHEN** npm uninstall fails (non-zero exit code)
- **THEN** the command SHALL exit with code 1
- **AND** SHALL print an error message containing "Remove failed"

#### Scenario: Remove with extra npm flags
- **WHEN** `forge remove @clawforge/app-github --force -- --no-save` is run
- **THEN** the command SHALL execute `npm uninstall @clawforge/app-github --no-save`
