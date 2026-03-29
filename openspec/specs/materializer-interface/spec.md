# materializer-interface Specification

## Purpose
TBD - created by archiving change claude-code-agent-materializer. Update Purpose after archive.
## Requirements
### Requirement: RuntimeMaterializer interface defines the contract for all materializers

The `RuntimeMaterializer` interface SHALL be defined in the `@clawmasons/agent-sdk` package (moved from `packages/cli/src/materializer/types.ts`). The interface SHALL include:
- `name: string` — the runtime identifier (e.g., `"claude-code-agent"`, `"mcp-agent"`)
- `materializeWorkspace(agent: ResolvedAgent, proxyEndpoint: string, proxyToken?: string, options?: MaterializeOptions): MaterializationResult` — generates workspace file content
- `materializeHome?(projectDir: string, homePath: string): void` — optional home directory materialization

The `generateDockerfile` and `generateComposeService` methods SHALL be removed from the interface. Dockerfile configuration is now provided via `AgentPackage.dockerfile` declarative config. Compose generation is handled by the CLI using `AgentPackage` metadata.

#### Scenario: Interface has correct shape
- **WHEN** a materializer implements the RuntimeMaterializer interface
- **THEN** it MUST provide `name` and `materializeWorkspace`
- **AND** it MAY optionally provide `materializeHome`

### Requirement: MaterializationResult is a map of relative paths to file content

The `materializeWorkspace` method SHALL return a `MaterializationResult` which is a `Map<string, string>` where keys are relative file paths (from the workspace root) and values are the file content as strings.

After materialization produces the file map, the Docker build pipeline SHALL apply `convertMcpFormat()` to the content of all task and skill files using the agent's `mcpNameTemplate` before writing them to the build directory. The template SHALL be resolved in this order:
1. `AgentTaskConfig.mcpNameTemplate` (if set)
2. `AgentPackage.mcpNameTemplate` (if set)
3. Default: `"${server}_${tool}"`

#### Scenario: Result contains workspace files
- **WHEN** `materializeWorkspace()` is called on a valid resolved agent
- **THEN** the result SHALL be a Map where each key is a relative path (e.g., `.claude/settings.json`) and each value is the string content of that file

#### Scenario: Task files have MCP names rewritten during build
- **WHEN** the Docker build pipeline writes materialized task files to the build directory
- **AND** the task content contains `mcp__filesystem__read_file`
- **AND** the agent's resolved `mcpNameTemplate` is `"mcp__mason__${server}_${tool}"`
- **THEN** the written file SHALL contain `mcp__mason__filesystem_read_file`

#### Scenario: Skill files have MCP names rewritten during build
- **WHEN** the Docker build pipeline writes materialized skill files (including SKILL.md) to the build directory
- **AND** the skill content contains MCP tool name references
- **THEN** all `mcp__{server}__{tool}` references SHALL be rewritten using the agent's resolved template

#### Scenario: Non-task non-skill files are not rewritten
- **WHEN** the Docker build pipeline writes non-task, non-skill files (e.g., settings.json, .mcp.json)
- **THEN** the content SHALL NOT be modified by `convertMcpFormat()`

### Requirement: MaterializeOptions supports ACP mode

The `materializeWorkspace` method SHALL accept an optional fourth parameter `options?: MaterializeOptions` where `MaterializeOptions` contains `acpMode?: boolean`. When `acpMode` is true, materializers SHALL generate additional ACP agent configuration files using the CLI name for the config directory.

#### Scenario: Options parameter is optional
- **WHEN** `materializeWorkspace()` is called without the `options` parameter
- **THEN** the materializer SHALL behave identically to pre-ACP behavior (no `.mason/acp.json` generated)

#### Scenario: ACP mode generates ACP config
- **WHEN** `materializeWorkspace()` is called with `{ acpMode: true }`
- **THEN** the result SHALL contain `.mason/acp.json` (using `.${CLI_NAME_LOWERCASE}/acp.json`) with port and command fields

### Requirement: materializeForAgent accepts Role input

The system SHALL provide a `materializeForAgent(role: Role, agentType: string, proxyEndpoint?: string, proxyToken?: string, options?: MaterializeOptions): MaterializationResult` function that accepts a `Role` from the ROLE_TYPES pipeline and produces workspace files for the specified agent runtime.

#### Scenario: Role is converted to ResolvedAgent via adapter
- **WHEN** `materializeForAgent()` is called with a valid `Role` and registered `agentType`
- **THEN** it SHALL internally call `adaptRoleToResolvedAgent()` and delegate to the registered `RuntimeMaterializer`

#### Scenario: Default proxy endpoint
- **WHEN** `materializeForAgent()` is called without a `proxyEndpoint`
- **THEN** it SHALL default to `"http://mcp-proxy:9090"`

#### Scenario: Unknown agent type throws MaterializerError
- **WHEN** `materializeForAgent()` is called with an unregistered `agentType`
- **THEN** it SHALL throw a `MaterializerError` listing the registered agent types

### Requirement: Materializer registry provides agent type lookup

The materializer registry SHALL be backed by the agent discovery module. `getMaterializer(agentType)` SHALL look up the `AgentPackage` from the agent registry and return its `materializer` field. `getRegisteredAgentTypes()` SHALL delegate to the agent registry.

The registry SHALL no longer be a hardcoded `Map` with static imports. It SHALL be dynamically populated from discovered `AgentPackage` instances.

#### Scenario: Registry contains built-in materializers
- **WHEN** `getRegisteredAgentTypes()` is called
- **THEN** it SHALL return at minimum `["claude-code-agent", "pi-coding-agent", "mcp-agent"]`
- **AND** it SHALL also include any agents loaded from `.mason/config.json`

#### Scenario: getMaterializer returns materializer from AgentPackage
- **WHEN** `getMaterializer("claude-code-agent")` is called
- **THEN** it SHALL return the `RuntimeMaterializer` from the `@clawmasons/claude-code-agent` package's `AgentPackage.materializer` field

### Requirement: MCP server config key uses CLI name
All materializers SHALL use `CLI_NAME_LOWERCASE` (currently `"mason"`) as the MCP server configuration key when generating workspace files, instead of a hardcoded product name.

#### Scenario: MCP server config key matches CLI name
- **WHEN** any materializer generates an MCP server configuration (e.g., claude-code-agent, mcp-agent, pi-coding-agent)
- **THEN** the server entry SHALL use the key `"mason"` (from `CLI_NAME_LOWERCASE`)
- **AND** the key SHALL NOT be hardcoded as `"chapter"` or any other legacy name

