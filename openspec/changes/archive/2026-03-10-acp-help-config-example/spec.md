## Purpose

Extend the `clawmasons acp --help` output to include a complete ACP client configuration example with the `agent_servers` JSON config block, all supported environment variables, and the bootstrap flow explanation. This gives developers a ready-to-copy config they can paste into their editor settings (Zed, acpx).

## Requirements

### Requirement: Help epilog includes agent_servers config block
The system SHALL display a complete `agent_servers` JSON config block in the `clawmasons acp --help` output, showing the bootstrap flow example with `--chapter initiate`, `--role`, and `--init-agent` flags.

#### Scenario: Help output shows bootstrap config example
- **WHEN** the user runs `clawmasons acp --help`
- **THEN** the output includes an `agent_servers` JSON block with `"type": "custom"`, `"command": "npx"`, and args including `--chapter`, `--init-agent`

#### Scenario: Help output shows existing workspace config example
- **WHEN** the user runs `clawmasons acp --help`
- **THEN** the output includes a second simpler `agent_servers` JSON block for use with an existing chapter workspace (no bootstrap)

### Requirement: Help epilog documents all environment variables
The system SHALL document `CLAWMASONS_HOME`, `LODGE`, and `LODGE_HOME` environment variables in the help epilog, including their defaults and how credential env vars flow through to the credential-service.

#### Scenario: Environment section lists all env vars
- **WHEN** the user runs `clawmasons acp --help`
- **THEN** the output includes documentation for `CLAWMASONS_HOME`, `LODGE`, `LODGE_HOME`, and credential env var pass-through behavior

### Requirement: Help epilog explains bootstrap flow
The system SHALL include a "Bootstrap Flow" section explaining what `--chapter initiate` does: lodge init, chapter init, chapter build.

#### Scenario: Bootstrap flow section present
- **WHEN** the user runs `clawmasons acp --help`
- **THEN** the output includes a "Bootstrap Flow" section describing the 3-step process

## Files Modified

- `packages/cli/src/cli/commands/run-acp-agent.ts` — extended `RUN_ACP_AGENT_HELP_EPILOG` constant
- `packages/cli/tests/cli/run-acp-agent.test.ts` — updated tests to verify new help content
