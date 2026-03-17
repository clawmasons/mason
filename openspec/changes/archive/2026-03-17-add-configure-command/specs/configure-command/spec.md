## ADDED Requirements

### Requirement: configure command is registered as a top-level CLI command

The CLI SHALL register a `configure` command at the top level (alongside `run`). It SHALL accept all options that `run` accepts except `--role`. The role SHALL be hardcoded to `@clawmasons/role-configure-project`.

#### Scenario: Command registration
- **WHEN** the CLI program is initialized
- **THEN** `mason configure` SHALL be available as a top-level command
- **AND** `mason configure --help` SHALL list all `run` options except `--role`

#### Scenario: Role is not an accepted option
- **WHEN** `mason configure --role something` is executed
- **THEN** Commander SHALL print an "unknown option" error and exit with code 1

### Requirement: configure delegates to run with the configure-project role

Running `mason configure [args]` SHALL be equivalent to running `mason run --role @clawmasons/role-configure-project [args]`.

#### Scenario: Basic invocation
- **WHEN** `mason configure --agent claude` is executed from a project directory
- **THEN** the agent SHALL start using the `@clawmasons/role-configure-project` role
- **AND** the behavior SHALL be identical to `mason run --role @clawmasons/role-configure-project --agent claude`

#### Scenario: All run options are forwarded
- **WHEN** `mason configure --agent claude --verbose --build` is executed
- **THEN** the underlying run action SHALL receive `verbose: true`, `build: true`, and `agent: "claude"`
- **AND** `role` SHALL be `"@clawmasons/role-configure-project"`

#### Scenario: ACP mode forwarding
- **WHEN** `mason configure --acp` is executed
- **THEN** the run action SHALL receive `acp: true` and `role: "@clawmasons/role-configure-project"`
