## MODIFIED Requirements

### Requirement: MaterializeOptions supports ACP mode
The `materializeWorkspace` method SHALL accept an optional fourth parameter `options?: MaterializeOptions` where `MaterializeOptions` contains `acpMode?: boolean`. When `acpMode` is true, materializers SHALL generate additional ACP agent configuration files using the CLI name for the config directory.

#### Scenario: Options parameter is optional
- **WHEN** `materializeWorkspace()` is called without the `options` parameter
- **THEN** the materializer SHALL behave identically to pre-ACP behavior (no `.mason/acp.json` generated)

#### Scenario: ACP mode generates ACP config
- **WHEN** `materializeWorkspace()` is called with `{ acpMode: true }`
- **THEN** the result SHALL contain `.mason/acp.json` (using `.${CLI_NAME_LOWERCASE}/acp.json`) with port and command fields

### Requirement: MCP server config key uses CLI name
All materializers SHALL use `CLI_NAME_LOWERCASE` (currently `"mason"`) as the MCP server configuration key when generating workspace files, instead of a hardcoded product name.

#### Scenario: MCP server config key matches CLI name
- **WHEN** any materializer generates an MCP server configuration (e.g., claude-code-agent, mcp-agent, pi-coding-agent)
- **THEN** the server entry SHALL use the key `"mason"` (from `CLI_NAME_LOWERCASE`)
- **AND** the key SHALL NOT be hardcoded as `"chapter"` or any other legacy name
