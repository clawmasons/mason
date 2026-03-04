# Spec: build-command

## ADDED Requirements

### Requirement: pam build command is registered as a CLI command

The CLI SHALL register a `build` command that accepts a required `<agent>` argument (agent package name), an optional `--output <path>` option, and a `--json` flag.

#### Scenario: Command registration
- **WHEN** the CLI program is initialized
- **THEN** the `build` command SHALL be available with argument `<agent>`, option `--output`, and flag `--json`

### Requirement: pam build resolves the agent graph and generates a lock file

When `pam build <agent>` is run, the command SHALL:
1. Discover packages in the workspace via `discoverPackages()`
2. Resolve the agent's dependency graph via `resolveAgent()`
3. Validate the resolved graph via `validateAgent()`
4. Generate a lock file via `generateLockFile()` with an empty generated files list
5. Write `pam.lock.json` to the output path

#### Scenario: Successful build writes lock file
- **WHEN** `pam build` is run with a valid agent name
- **THEN** a `pam.lock.json` file SHALL be written to the current working directory (or `--output` path)
- **AND** the lock file SHALL contain the agent name, version, runtimes, and all resolved roles with their tasks, apps, and skills

#### Scenario: Custom output path
- **WHEN** `pam build` is run with `--output ./custom/path.json`
- **THEN** the lock file SHALL be written to `./custom/path.json`

#### Scenario: JSON output mode
- **WHEN** `pam build` is run with `--json`
- **THEN** the lock file content SHALL be printed to stdout as JSON instead of being written to a file

### Requirement: pam build exits with non-zero code on failure

#### Scenario: Agent not found
- **WHEN** `pam build` is run with a non-existent agent name
- **THEN** the command SHALL print an error message and exit with code 1

#### Scenario: Validation failure
- **WHEN** `pam build` is run with an agent that fails validation
- **THEN** the command SHALL print validation errors and exit with code 1
