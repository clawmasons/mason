## ADDED Requirements

### Requirement: Single passing e2e test for mcp-proxy-agent
The e2e test suite SHALL contain exactly one test file (`mcp-proxy-agent.test.ts`) that validates the full agent↔proxy pipeline by spawning `mason run` via CLI and verifying behavior through stdout and REPL interaction.

#### Scenario: Test suite contains only mcp-proxy-agent test
- **WHEN** listing test files in `packages/tests/tests/`
- **THEN** only `mcp-proxy-agent.test.ts` and `helpers.ts` exist

#### Scenario: Deleted fixture is absent
- **WHEN** checking `packages/tests/fixtures/`
- **THEN** `test-chapter/` directory does not exist
- **THEN** `claude-test-project/` directory exists

#### Scenario: Deleted scripts are absent
- **WHEN** checking `packages/tests/scripts/`
- **THEN** the `scripts/` directory does not exist

### Requirement: mcp-proxy-agent test passes
The `mcp-proxy-agent.test.ts` test SHALL pass when Docker is available.

#### Scenario: CLI starts and REPL becomes ready
- **WHEN** `mason run --role writer --agent mcp` is spawned in a workspace copied from `claude-test-project`
- **THEN** stdout contains `[mcp-agent]` and the REPL prompt `> ` within 180 seconds

#### Scenario: Tool list is available via REPL
- **WHEN** `list` is sent to the REPL
- **THEN** stdout contains `read_file`, `write_file`, `list_directory`, and `create_directory`

#### Scenario: Filesystem round-trip via proxy tools
- **WHEN** `filesystem_create_directory` is called with a path
- **THEN** stdout contains `Result:`
- **WHEN** `filesystem_write_file` is called with a path and content
- **THEN** stdout contains `Result:`
- **WHEN** `filesystem_read_file` is called with the same path
- **THEN** stdout contains the exact content that was written

#### Scenario: Test skips gracefully when Docker is unavailable
- **WHEN** `docker info` fails
- **THEN** the test returns without error (no assertion failures)
