# MCP Test Agent Package

The `mcp-test` agent and role packages provide an interactive CLI for integration and end-to-end testing of the credential and MCP tool pipeline. The agent requests the `TEST_TOKEN` credential, verifies it was received, and enters a REPL for listing and calling MCP tools.

## Requirements

### Requirement: mcp-test agent package declares TEST_TOKEN credential

The agent package SHALL declare `credentials: ["TEST_TOKEN"]` in its chapter field, with runtime `node` and role `@test/role-mcp-test`.

#### Scenario: Agent package validates correctly
- **GIVEN** the mcp-test agent package.json at `e2e/fixtures/test-chapter/agents/mcp-test/package.json`
- **WHEN** the chapter field is validated against the agent schema
- **THEN** it passes validation with `type: "agent"`, `credentials: ["TEST_TOKEN"]`, `runtimes: ["node"]`

### Requirement: mcp-test role package has LOW risk and wildcard permissions

The role package SHALL have `risk: "LOW"` and permissions that allow all tools from all apps (`"*": { "allow": ["*"] }`).

#### Scenario: Role package validates correctly
- **GIVEN** the mcp-test role package.json at `e2e/fixtures/test-chapter/roles/mcp-test/package.json`
- **WHEN** the chapter field is validated against the role schema
- **THEN** it passes validation with `type: "role"`, `risk: "LOW"`, wildcard permissions

### Requirement: mcp-test agent verifies TEST_TOKEN on boot

The agent SHALL check that `TEST_TOKEN` is present in the environment and exit with an error if it is not.

#### Scenario: TEST_TOKEN present
- **WHEN** the agent starts with `TEST_TOKEN` set in the environment
- **THEN** it prints "[mcp-test] Connected. TEST_TOKEN received." and enters the REPL

#### Scenario: TEST_TOKEN missing
- **WHEN** the agent starts without `TEST_TOKEN` in the environment
- **THEN** it exits with code 1 and prints an error about the missing credential

### Requirement: mcp-test agent supports interactive REPL commands

The agent SHALL support three commands in its REPL loop:
- `list` -- lists available MCP tools from the proxy
- `<tool_name> <json_args>` -- calls the named tool with JSON arguments and prints the result
- `exit` -- exits the agent

#### Scenario: list command
- **WHEN** the user types "list" in the REPL
- **THEN** available MCP tools are displayed with names and descriptions

#### Scenario: tool call command
- **WHEN** the user types a tool name followed by a JSON object
- **THEN** the tool is called via MCP and the result is printed

#### Scenario: exit command
- **WHEN** the user types "exit"
- **THEN** the agent prints "[mcp-test] Goodbye." and exits with code 0

### Requirement: credential flow integration works end-to-end in SDK mode

The integration test SHALL verify the full credential pipeline without Docker, using in-process proxy and credential service.

#### Scenario: connect-agent returns session token
- **WHEN** an agent POSTs to `/connect-agent` with a valid proxy token
- **THEN** a `{ sessionToken, sessionId }` response is returned

#### Scenario: credential_request tool resolves TEST_TOKEN
- **GIVEN** a connected agent with a valid session token and `TEST_TOKEN` in the process environment
- **WHEN** the `credential_request` MCP tool is called with `key: "TEST_TOKEN"`
- **THEN** the resolved value is returned

#### Scenario: undeclared credentials are denied
- **GIVEN** a connected agent with `declaredCredentials: ["TEST_TOKEN"]`
- **WHEN** the `credential_request` tool is called with `key: "UNDECLARED_KEY"`
- **THEN** the request is denied with a credential error

#### Scenario: invalid session tokens are rejected
- **WHEN** the `credential_request` tool is called with an invalid session token
- **THEN** the request is rejected with an "Invalid session token" error

#### Scenario: audit log records credential operations
- **GIVEN** a successful credential request
- **WHEN** the audit log is queried
- **THEN** an entry exists with `outcome: "granted"` and `agent_id: "mcp-test"`
