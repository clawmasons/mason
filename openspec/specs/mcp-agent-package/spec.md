# MCP Agent Package

The `mcp-agent` package provides a general-purpose MCP agent with REPL and ACP modes for testing and debugging the chapter proxy pipeline. It replaces the ad-hoc inline `mcp-test` fixture with a proper reusable package.

## Requirements

### Requirement: Package structure and build

The package SHALL be located at `packages/mcp-agent/` with name `@clawmasons/mcp-agent`, a `mcp-agent` binary entry, and esbuild bundling to `dist/mcp-agent.js` (same pattern as agent-entry).

#### Scenario: Package validates correctly
- **GIVEN** the mcp-agent package.json
- **WHEN** npm workspace resolution runs
- **THEN** the package is resolved as `@clawmasons/mcp-agent` with bin `mcp-agent`

### Requirement: Tool caller supports command parsing

The tool-caller module SHALL parse user input into structured commands: `list`, `exit`, `help`, `<tool_name>`, and `<tool_name> <json_args>`.

#### Scenario: list command
- **WHEN** input is "list"
- **THEN** parseCommand returns `{ type: "list" }`

#### Scenario: exit command
- **WHEN** input is "exit"
- **THEN** parseCommand returns `{ type: "exit" }`

#### Scenario: help command
- **WHEN** input is "help" or empty
- **THEN** parseCommand returns `{ type: "help" }`

#### Scenario: tool call with JSON args
- **WHEN** input is `my_tool {"key": "val"}`
- **THEN** parseCommand returns `{ type: "call", toolName: "my_tool", args: { key: "val" } }`

#### Scenario: tool call with no args
- **WHEN** input is "my_tool"
- **THEN** parseCommand returns `{ type: "call", toolName: "my_tool", args: {} }`

#### Scenario: invalid JSON args
- **WHEN** input is "my_tool invalid-json"
- **THEN** parseCommand returns `{ type: "error" }` with descriptive message

### Requirement: Help message lists available tools

When a user enters an unknown command or requests help, the agent SHALL display a help message listing all available commands and tools.

#### Scenario: help with tools
- **GIVEN** tools [{ name: "github_create_pr", description: "Create PR" }]
- **WHEN** formatHelp is called
- **THEN** output contains "Available commands:", "list", "help", "exit", and "github_create_pr"

#### Scenario: help with no tools
- **GIVEN** empty tools array
- **WHEN** formatHelp is called
- **THEN** output contains "No tools available"

### Requirement: REPL mode with credential verification

In REPL mode (default), the agent SHALL verify TEST_TOKEN is present, establish an MCP session with the proxy, and enter an interactive command loop.

#### Scenario: TEST_TOKEN present
- **WHEN** the agent starts with TEST_TOKEN set
- **THEN** it prints "[mcp-agent] Connected. TEST_TOKEN received." and enters the REPL

#### Scenario: TEST_TOKEN missing
- **WHEN** the agent starts without TEST_TOKEN
- **THEN** it exits with code 1 and prints an error

### Requirement: ACP agent mode

With the `--acp` flag, the agent SHALL start an HTTP server on a configurable port (default 3002) that accepts POST requests with `{ command: string }` body and returns `{ output: string, exit: boolean }`.

#### Scenario: ACP server starts
- **WHEN** the agent starts with `--acp --port 3002`
- **THEN** an HTTP server listens on port 3002

#### Scenario: ACP command execution
- **GIVEN** the ACP server is running
- **WHEN** a POST request with `{ "command": "list" }` is received
- **THEN** the response contains the tool listing

### Requirement: mcp-test fixture delegates to mcp-agent

The `e2e/fixtures/test-chapter/agents/mcp-test/` fixture SHALL depend on `@clawmasons/mcp-agent` and its `src/index.ts` SHALL import and run the mcp-agent's main function.

#### Scenario: fixture uses package
- **GIVEN** the mcp-test fixture package.json
- **THEN** it declares `@clawmasons/mcp-agent` as a dependency
- **AND** its `src/index.ts` imports `main` from `@clawmasons/mcp-agent`
