# materializer-interface Specification

## Purpose
TBD - created by archiving change claude-code-materializer. Update Purpose after archive.
## Requirements
### Requirement: RuntimeMaterializer interface defines the contract for all materializers

The system SHALL define a `RuntimeMaterializer` interface with the following properties and methods:
- `name: string` — the runtime identifier (e.g., `"claude-code"`, `"codex"`)
- `materializeWorkspace(agent: ResolvedMember, proxyEndpoint: string, proxyToken?: string): MaterializationResult` — generates workspace file content. When `proxyToken` is provided, the actual token value SHALL be baked into configuration files instead of using environment variable placeholders.
- `generateDockerfile(agent: ResolvedMember): string` — generates a Dockerfile string
- `generateComposeService(agent: ResolvedMember): ComposeServiceDef` — generates a docker-compose service definition

#### Scenario: Interface has correct shape
- **WHEN** a materializer implements the RuntimeMaterializer interface
- **THEN** it MUST provide `name`, `materializeWorkspace`, `generateDockerfile`, and `generateComposeService`

### Requirement: MaterializationResult is a map of relative paths to file content

The `materializeWorkspace` method SHALL return a `MaterializationResult` which is a `Map<string, string>` where keys are relative file paths (from the workspace root) and values are the file content as strings.

#### Scenario: Result contains workspace files
- **WHEN** `materializeWorkspace()` is called on a valid resolved agent
- **THEN** the result SHALL be a Map where each key is a relative path (e.g., `.claude/settings.json`) and each value is the string content of that file

### Requirement: MaterializeOptions supports ACP mode

The `materializeWorkspace` method SHALL accept an optional fourth parameter `options?: MaterializeOptions` where `MaterializeOptions` contains `acpMode?: boolean`. When `acpMode` is true, materializers SHALL generate additional ACP agent configuration files (e.g., `.chapter/acp.json`).

#### Scenario: Options parameter is optional
- **WHEN** `materializeWorkspace()` is called without the `options` parameter
- **THEN** the materializer SHALL behave identically to pre-ACP behavior (no `.chapter/acp.json` generated)

#### Scenario: ACP mode generates ACP config
- **WHEN** `materializeWorkspace()` is called with `{ acpMode: true }`
- **THEN** the result SHALL contain `.chapter/acp.json` with port and command fields

### Requirement: ComposeServiceDef captures docker-compose service fields

The `ComposeServiceDef` type SHALL include fields for a docker-compose service: `build`, `restart`, `volumes`, `working_dir`, `environment`, `depends_on`, `stdin_open`, `tty`, and `networks`.

#### Scenario: ComposeServiceDef has required fields
- **WHEN** `generateComposeService()` is called
- **THEN** the result SHALL include `build`, `volumes`, `working_dir`, `depends_on`, and `networks` at minimum

### Requirement: materializeForAgent accepts RoleType input

The system SHALL provide a `materializeForAgent(role: RoleType, agentType: string, proxyEndpoint?: string, proxyToken?: string, options?: MaterializeOptions): MaterializationResult` function that accepts a `RoleType` from the ROLE_TYPES pipeline and produces workspace files for the specified agent runtime.

#### Scenario: RoleType is converted to ResolvedAgent via adapter
- **WHEN** `materializeForAgent()` is called with a valid `RoleType` and registered `agentType`
- **THEN** it SHALL internally call `adaptRoleToResolvedAgent()` and delegate to the registered `RuntimeMaterializer`

#### Scenario: Default proxy endpoint
- **WHEN** `materializeForAgent()` is called without a `proxyEndpoint`
- **THEN** it SHALL default to `"http://mcp-proxy:9090"`

#### Scenario: Unknown agent type throws MaterializerError
- **WHEN** `materializeForAgent()` is called with an unregistered `agentType`
- **THEN** it SHALL throw a `MaterializerError` listing the registered agent types

#### Scenario: Output equivalence between old and new pipeline
- **WHEN** a `RoleType` and its equivalent `ResolvedAgent` are materialized for the same agent type
- **THEN** the output `MaterializationResult` SHALL be identical

### Requirement: Materializer registry provides agent type lookup

The system SHALL maintain a materializer registry mapping agent type strings to `RuntimeMaterializer` instances, with the following public functions:
- `getMaterializer(agentType: string): RuntimeMaterializer | undefined` — look up by agent type
- `getRegisteredAgentTypes(): string[]` — list all registered agent types

#### Scenario: Registry contains built-in materializers
- **WHEN** `getRegisteredAgentTypes()` is called
- **THEN** it SHALL return `["claude-code", "pi-coding-agent", "mcp-agent"]`

