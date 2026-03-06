# Spec: build-command

## ADDED Requirements

### Requirement: chapter build command is registered as a CLI command

The CLI SHALL register a `build` command that accepts a required `<member>` argument (member package name), an optional `--output <path>` option, and a `--json` flag.

#### Scenario: Command registration
- **WHEN** the CLI program is initialized
- **THEN** the `build` command SHALL be available with argument `<member>`, option `--output`, and flag `--json`

### Requirement: chapter build resolves the member graph and generates a lock file

When `chapter build <member>` is run, the command SHALL:
1. Discover packages in the workspace via `discoverPackages()`
2. Resolve the member's dependency graph via `resolveMember()`
3. Validate the resolved graph via `validateMember()`
4. Generate a lock file via `generateLockFile()` with an empty generated files list
5. Write `chapter.lock.json` to the output path

#### Scenario: Successful build writes lock file
- **WHEN** `chapter build` is run with a valid member name
- **THEN** a `chapter.lock.json` file SHALL be written to the current working directory (or `--output` path)
- **AND** the lock file SHALL contain the member name, version, memberType, runtimes, and all resolved roles with their tasks, apps, and skills

#### Scenario: Custom output path
- **WHEN** `chapter build` is run with `--output ./custom/path.json`
- **THEN** the lock file SHALL be written to `./custom/path.json`

#### Scenario: JSON output mode
- **WHEN** `chapter build` is run with `--json`
- **THEN** the lock file content SHALL be printed to stdout as JSON instead of being written to a file

### Requirement: chapter build exits with non-zero code on failure

#### Scenario: Agent not found
- **WHEN** `chapter build` is run with a non-existent agent name
- **THEN** the command SHALL print an error message and exit with code 1

#### Scenario: Validation failure
- **WHEN** `chapter build` is run with an agent that fails validation
- **THEN** the command SHALL print validation errors and exit with code 1
