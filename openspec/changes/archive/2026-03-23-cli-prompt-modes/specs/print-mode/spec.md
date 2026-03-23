## ADDED Requirements

### Requirement: mason run supports -p/--print flag for non-interactive print mode

The `run` command SHALL accept a `-p <prompt>` / `--print <prompt>` string option. When provided, the prompt value SHALL become the `initialPrompt` (overriding any positional prompt). The flag SHALL activate print mode, which runs the agent non-interactively with JSON streaming output and outputs only the final result text to the terminal.

The `-p`/`--print` flag SHALL be mutually exclusive with `--acp`, `--bash`, `--dev-container`, and `--proxy-only`. If combined, the CLI SHALL exit with an error message.

#### Scenario: Print mode with claude

- **WHEN** `mason run claude -p "say hello"` is executed
- **THEN** the agent SHALL run non-interactively with JSON streaming output
- **AND** every stream line SHALL be logged to `.mason/logs/session.log`
- **AND** only the final result text SHALL appear on the terminal's stdout
- **AND** the process SHALL exit with the agent's exit code

#### Scenario: Print mode with --print long form

- **WHEN** `mason run claude --print "say hello"` is executed
- **THEN** behavior SHALL be identical to `mason run claude -p "say hello"`

#### Scenario: Print mode overrides positional prompt

- **WHEN** `mason run claude -p "use this" "ignore this"` is executed
- **THEN** the initial prompt SHALL be `"use this"` (from `-p`)
- **AND** the positional prompt `"ignore this"` SHALL be ignored

#### Scenario: Print mode mutually exclusive with --acp

- **WHEN** `mason run claude -p "hello" --acp` is executed
- **THEN** the CLI SHALL print an error message indicating mutual exclusivity
- **AND** the process SHALL exit with a non-zero code

#### Scenario: Print mode mutually exclusive with --bash

- **WHEN** `mason run claude -p "hello" --bash` is executed
- **THEN** the CLI SHALL print an error message indicating mutual exclusivity
- **AND** the process SHALL exit with a non-zero code

### Requirement: Print mode redirects mason output to session log

In print mode, all mason status output (agent name, role, session info, proxy status, build progress) SHALL be redirected to `.mason/logs/session.log`. The terminal stdout SHALL show only the agent's final result. The terminal stderr SHALL show only critical errors that prevent execution.

#### Scenario: No mason status output on terminal

- **WHEN** `mason run claude -p "say hello"` is executed
- **THEN** the terminal SHALL NOT display "Agent:", "Role:", "Session:", "Building proxy...", or similar mason status lines
- **AND** all such lines SHALL appear in `.mason/logs/session.log`
- **AND** only the agent's final result text SHALL appear on stdout

#### Scenario: Error produces non-zero exit code

- **WHEN** `mason run claude -p "say hello"` is executed
- **AND** the agent process exits with code 1
- **THEN** the mason process SHALL also exit with code 1

### Requirement: Print mode uses JSON streaming to capture agent output

In print mode, the agent SHALL be launched with its JSON streaming args (from `AgentPackage.printMode.jsonStreamArgs`) appended to the command in `agent-launch.json`. The host process SHALL pipe stdout from `docker compose run` instead of inheriting it, read each line, log it to the session logger, and call `AgentPackage.printMode.parseJsonStreamFinalResult(line)` to detect the final result.

#### Scenario: Claude agent launched with streaming args

- **WHEN** print mode is active for the claude agent
- **THEN** `agent-launch.json` SHALL include `["--output-format", "stream-json"]` in the args array
- **AND** the prompt SHALL be passed as `["-p", "the prompt text"]`

#### Scenario: Pi agent launched with streaming args

- **WHEN** print mode is active for the pi agent
- **THEN** `agent-launch.json` SHALL include `["--mode", "json"]` in the args array
- **AND** the prompt SHALL be passed as `["-p", "the prompt text"]`

#### Scenario: All stream lines logged

- **WHEN** the agent emits JSON stream lines during print mode
- **THEN** every line SHALL be appended to `.mason/logs/session.log`
- **AND** lines that do not contain the final result SHALL NOT appear on stdout

#### Scenario: Final result extracted and output

- **WHEN** `parseJsonStreamFinalResult(line)` returns a non-null string
- **THEN** that string SHALL be written to the terminal stdout after the agent process completes
- **AND** it SHALL be the only agent output on stdout

#### Scenario: Parse errors handled gracefully

- **WHEN** `parseJsonStreamFinalResult(line)` throws an exception (e.g., invalid JSON)
- **THEN** the exception SHALL be logged to the session logger
- **AND** the line SHALL be treated as not containing the final result (continue reading)

### Requirement: Print mode uses execComposeRunWithStreamCapture

Print mode SHALL use a dedicated `execComposeRunWithStreamCapture()` function that spawns `docker compose run` with stdout piped (not inherited). The function SHALL accept an `onLine` callback invoked for each line of stdout. Stderr SHALL be captured for OCI error detection (same as `execComposeRunWithStderr`).

#### Scenario: Stdout piped and processed line by line

- **WHEN** `execComposeRunWithStreamCapture` is called
- **THEN** the Docker process SHALL be spawned with `stdio: ["inherit", "pipe", "pipe"]`
- **AND** each line of stdout SHALL trigger the `onLine` callback

#### Scenario: Stderr captured for OCI detection

- **WHEN** the Docker process writes to stderr
- **THEN** the stderr content SHALL be captured and returned
- **AND** it SHALL be available for OCI runtime error detection
