## MODIFIED Requirements

### Requirement: chapter run command is registered as a CLI command

The CLI SHALL register a `run` command that accepts a required `--role <name>` option and an optional `--agent-type <type>` option. The `<agent-type>` positional argument is removed.

#### Scenario: Command registration
- **WHEN** the CLI program is initialized
- **THEN** the `run` command SHALL be available with option `--role` (required) and option `--agent-type` (optional)
- **AND** there SHALL be no positional `<agent-type>` argument

### Requirement: chapter run resolves project directory from cwd

The run command SHALL resolve the project directory from `process.cwd()`. It SHALL NOT read `CLAWMASONS_HOME`, `chapters.json`, `config.json`, or any global state.

#### Scenario: Project directory from cwd
- **WHEN** `chapter run --role writer` is executed from `/home/user/my-project`
- **THEN** the project directory SHALL be `/home/user/my-project`
- **AND** no reads to `~/.clawmasons/` SHALL occur

### Requirement: chapter run infers agent type from role source

The run command SHALL infer the agent type from the role's source directory (e.g., `.claude/roles/foo/` → agent type `claude`). If `--agent-type` is specified, it SHALL override the inferred type.

#### Scenario: Agent type inferred from role directory
- **WHEN** `chapter run --role writer` is executed
- **AND** the role "writer" is found at `.claude/roles/writer/ROLE.md`
- **THEN** the agent type SHALL be inferred as "claude"

#### Scenario: Agent type override
- **WHEN** `chapter run --role writer --agent-type codex` is executed
- **AND** the role "writer" is found at `.claude/roles/writer/ROLE.md`
- **THEN** the agent type SHALL be "codex" (override takes precedence)

### Requirement: chapter run uses project-local role discovery

The run command SHALL use `resolveRole(name, projectDir)` from the shared discovery module to locate the role. It SHALL NOT use `findRoleEntryByRole()` from `home.ts` or read from any global registry.

#### Scenario: Role resolved via project-local discovery
- **WHEN** `chapter run --role writer` is executed
- **THEN** the command SHALL call `resolveRole("writer", projectDir)`
- **AND** SHALL NOT call `findRoleEntryByRole()`, `readChaptersJson()`, or `getClawmasonsHome()`

#### Scenario: Role not found
- **WHEN** `chapter run --role nonexistent` is executed
- **AND** the role is not found locally or in `node_modules/`
- **THEN** the command SHALL print an error and exit with code 1

### Requirement: chapter run auto-builds docker artifacts if missing

The run command SHALL check if docker build artifacts exist at `{projectDir}/.clawmasons/docker/{role-name}/`. If they do not exist, it SHALL automatically trigger `docker-init` to materialize them before proceeding.

#### Scenario: Docker artifacts exist
- **WHEN** `chapter run --role writer` is executed
- **AND** `{projectDir}/.clawmasons/docker/writer/` contains the expected Dockerfiles
- **THEN** the command SHALL proceed directly to session creation

#### Scenario: Docker artifacts missing — auto-build
- **WHEN** `chapter run --role writer` is executed
- **AND** `{projectDir}/.clawmasons/docker/writer/` does not exist
- **THEN** the command SHALL run `docker-init` for the role before proceeding
- **AND** SHALL print a message indicating docker artifacts are being built

### Requirement: chapter run uses project-local session directory

The run command SHALL create the session at `{projectDir}/.clawmasons/sessions/{session-id}/` and generate docker-compose.yml referencing the project-local docker build directory.

#### Scenario: Session created project-locally
- **WHEN** `chapter run --role writer` is executed from `/home/user/my-project`
- **THEN** the session directory SHALL be at `/home/user/my-project/.clawmasons/sessions/{session-id}/`
- **AND** the docker-compose.yml SHALL reference `../../docker/writer/` for build contexts

## REMOVED Requirements

### Requirement: chapter run resolves the member directory
**Reason**: The member/chapter registry pattern is being removed. Roles are discovered directly from the project, not looked up via member directories or `chapters.json`.
**Migration**: Use `--role <name>` instead of the `<member>` positional argument.

### Requirement: chapter run rejects disabled members
**Reason**: The members registry (`members.json`) is part of the old chapter/lodge system being removed.
**Migration**: No replacement — role availability is determined by whether the role files exist in the project.
