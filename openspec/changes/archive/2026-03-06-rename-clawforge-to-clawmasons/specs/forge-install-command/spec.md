## MODIFIED Requirements

### Requirement: forge install supports custom output directory

The `forge install` command SHALL support an optional `--output-dir` flag.

#### Scenario: Default output directory

- **WHEN** a user runs `forge install @clawmasons/agent-repo-ops`
- **THEN** the output SHALL be written to `.forge/agents/repo-ops/` by default

#### Scenario: Custom output directory

- **WHEN** a user runs `forge install @clawmasons/agent-repo-ops --output-dir ./my-output`
- **THEN** the output SHALL be written to `./my-output/`
