# Agent Schema ACP Extension & Materializer ACP Mode

## Purpose

Adds ACP awareness to the agent schema and materializer layer, enabling materializers to generate ACP-specific configuration files and providing the `ACP_RUNTIME_COMMANDS` mapping for downstream Dockerfile generation.

## Requirements

### Requirement: Agent schema accepts optional acp field

The `agentChapterFieldSchema` SHALL include an optional `acp` field with a nested `port` property that defaults to 3002.

#### Scenario: Agent with acp field
- **GIVEN** a package.json with `chapter.acp.port = 4000`
- **WHEN** the schema is validated
- **THEN** validation succeeds and `acp.port` is 4000

#### Scenario: Agent without acp field
- **GIVEN** a package.json without the `acp` field
- **WHEN** the schema is validated
- **THEN** validation succeeds and `acp` is undefined

#### Scenario: Agent with acp but no port
- **GIVEN** a package.json with `chapter.acp = {}`
- **WHEN** the schema is validated
- **THEN** validation succeeds and `acp.port` defaults to 3002

### Requirement: ResolvedAgent includes acp field

The `ResolvedAgent` type SHALL include an optional `acp?: { port: number }` field that is passed through from the agent schema during resolution.

#### Scenario: acp field flows through resolution
- **GIVEN** an agent package with `chapter.acp.port = 5000`
- **WHEN** the agent is resolved via `resolveAgent()`
- **THEN** `resolvedAgent.acp.port` is 5000

### Requirement: ACP_RUNTIME_COMMANDS maps runtimes to ACP commands

The `ACP_RUNTIME_COMMANDS` constant SHALL map runtime identifiers to their ACP agent commands:
- `"claude-code"` -> `"claude-agent-acp"`
- `"pi-coding-agent"` -> `"pi-agent-acp"`
- `"node"` -> `"node src/index.js --acp"`

#### Scenario: All three runtimes mapped
- **WHEN** `ACP_RUNTIME_COMMANDS` is inspected
- **THEN** it contains exactly 3 entries with the correct mappings

### Requirement: MCP agent materializer generates minimal workspace

The `mcpAgentMaterializer` SHALL generate a minimal workspace containing only `.mcp.json` (proxy config) and `AGENTS.md` (agent documentation). It SHALL NOT generate slash commands, IDE settings, or extension files.

#### Scenario: Minimal workspace files
- **WHEN** `materializeWorkspace()` is called for an mcp-agent
- **THEN** the result contains exactly `.mcp.json` and `AGENTS.md`

#### Scenario: MCP config points to proxy
- **WHEN** `materializeWorkspace()` is called with proxy endpoint `http://mcp-proxy:3000`
- **THEN** `.mcp.json` contains a single `chapter` MCP server entry with the correct URL

#### Scenario: ACP mode adds .chapter/acp.json
- **WHEN** `materializeWorkspace()` is called with `{ acpMode: true }`
- **THEN** the result also contains `.chapter/acp.json` with `command: "node src/index.js --acp"` and the configured port
