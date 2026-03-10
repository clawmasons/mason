## Purpose

Restructure the CLI command hierarchy so that workspace management commands live under a `chapter` subcommand group, while `agent`, `acp`, and `init` are top-level commands. This makes the CLI ergonomic (`clawmasons chapter build`, `clawmasons acp --role writer`) and removes deprecated command names (`run-agent`, `run-acp-agent`, `run-init`, `docker-init`).

## Requirements

### Requirement: `chapter` subcommand group contains workspace commands
The system SHALL create a `chapter` subcommand group on the Commander program. The following commands SHALL be registered as subcommands of `chapter`: `init`, `build`, `init-role`, `list`, `validate`, `permissions`, `pack`, `add`, `remove`, `proxy`.

#### Scenario: `clawmasons chapter --help` lists subcommands
- **WHEN** the user runs `clawmasons chapter --help`
- **THEN** the output lists `init`, `build`, `init-role`, `list`, `validate`, `permissions`, `pack`, `add`, `remove`, `proxy` as available subcommands

#### Scenario: `clawmasons chapter build` works
- **WHEN** the user runs `clawmasons chapter build` in a chapter workspace
- **THEN** the build command executes successfully (same behavior as the old `clawmasons build`)

### Requirement: `agent` is a top-level command
The system SHALL register `agent` as a top-level command, replacing `run-agent`. It SHALL accept the same arguments: `<agent>` and `<role>`.

#### Scenario: `clawmasons agent` invocation
- **WHEN** the user runs `clawmasons agent note-taker writer`
- **THEN** the agent command executes (same behavior as old `clawmasons run-agent note-taker writer`)

#### Scenario: Old `run-agent` command is removed
- **WHEN** the user runs `clawmasons run-agent`
- **THEN** the CLI reports an unknown command error

### Requirement: `acp` is a top-level command
The system SHALL register `acp` as a top-level command, replacing `run-acp-agent`. It SHALL accept the same options: `--role`, `--agent`, `--port`, `--proxy-port`.

#### Scenario: `clawmasons acp` invocation
- **WHEN** the user runs `clawmasons acp --role writer`
- **THEN** the ACP agent starts (same behavior as old `clawmasons run-acp-agent --role writer`)

#### Scenario: Old `run-acp-agent` command is removed
- **WHEN** the user runs `clawmasons run-acp-agent`
- **THEN** the CLI reports an unknown command error

### Requirement: Placeholder `init` top-level command
The system SHALL register a placeholder `init` top-level command (distinct from `chapter init`). This command will be fully implemented in a future change (lodge initialization). For now it SHALL print a message indicating it is not yet implemented.

#### Scenario: `clawmasons init` placeholder
- **WHEN** the user runs `clawmasons init`
- **THEN** the CLI outputs a message indicating lodge initialization is coming soon

### Requirement: Deprecated commands removed from CLI
The system SHALL NOT register `run-init` or `docker-init` as CLI commands. These are internal functions only.

#### Scenario: `clawmasons run-init` is rejected
- **WHEN** the user runs `clawmasons run-init`
- **THEN** the CLI reports an unknown command error

#### Scenario: `clawmasons docker-init` is rejected
- **WHEN** the user runs `clawmasons docker-init`
- **THEN** the CLI reports an unknown command error

### Requirement: Top-level help shows new structure
The system SHALL show `init`, `agent`, `acp`, and `chapter` as the top-level commands in `clawmasons --help`.

#### Scenario: Help output structure
- **WHEN** the user runs `clawmasons --help`
- **THEN** the output lists `init`, `agent`, `acp`, `chapter` as available commands
- **AND** workspace-level commands like `build`, `list`, `validate` are NOT listed at the top level

### Requirement: E2E tests updated for new command paths
The system SHALL update all E2E tests to use the new command hierarchy (e.g., `["chapter", "build"]` instead of `["build"]`).

#### Scenario: E2E build pipeline test
- **WHEN** the `build-pipeline.test.ts` runs
- **THEN** it invokes `clawmasons chapter build` and all assertions pass

#### Scenario: E2E note-taker test
- **WHEN** the `test-note-taker-mcp.test.ts` runs
- **THEN** it invokes `clawmasons chapter build` and all assertions pass

### Requirement: Unit tests updated for new structure
The system SHALL update CLI unit tests to reflect the new command hierarchy. Tests that check for command registration SHALL verify commands under the `chapter` subgroup or at the top level as appropriate.

#### Scenario: CLI test verifies `chapter` subcommand
- **WHEN** the `cli.test.ts` runs
- **THEN** it verifies that `chapter` is a registered top-level command with subcommands including `init`, `build`, etc.

### Requirement: Internal log messages updated
The system SHALL update log messages in `run-agent.ts` and `run-acp-agent.ts` to use the new command names (`agent` and `acp` respectively) instead of `run-agent` and `run-acp-agent`.

#### Scenario: ACP log messages use new name
- **WHEN** the `acp` command runs
- **THEN** log messages reference `[clawmasons acp]` instead of `[clawmasons run-acp-agent]`

## Decisions

- The `chapter init` subcommand (workspace scaffolding) is distinct from the top-level `init` command (lodge initialization). Both exist simultaneously.
- `docker-init` and `run-init` are kept as internal modules (exported functions) but removed as CLI entry points.
- No logic changes to any command implementations — this is purely a registration/routing change.
