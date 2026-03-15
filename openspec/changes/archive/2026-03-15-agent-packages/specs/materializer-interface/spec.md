## MODIFIED Requirements

### Requirement: RuntimeMaterializer interface defines the contract for all materializers

The `RuntimeMaterializer` interface SHALL be defined in the `@clawmasons/agent-sdk` package (moved from `packages/cli/src/materializer/types.ts`). The interface SHALL include:
- `name: string` — the runtime identifier (e.g., `"claude-code"`, `"mcp-agent"`)
- `materializeWorkspace(agent: ResolvedAgent, proxyEndpoint: string, proxyToken?: string, options?: MaterializeOptions): MaterializationResult` — generates workspace file content
- `materializeHome?(projectDir: string, homePath: string): void` — optional home directory materialization

The `generateDockerfile` and `generateComposeService` methods SHALL be removed from the interface. Dockerfile configuration is now provided via `AgentPackage.dockerfile` declarative config. Compose generation is handled by the CLI using `AgentPackage` metadata.

#### Scenario: Interface has correct shape
- **WHEN** a materializer implements the RuntimeMaterializer interface
- **THEN** it MUST provide `name` and `materializeWorkspace`
- **AND** it MAY optionally provide `materializeHome`

### Requirement: Materializer registry provides agent type lookup

The materializer registry SHALL be backed by the agent discovery module. `getMaterializer(agentType)` SHALL look up the `AgentPackage` from the agent registry and return its `materializer` field. `getRegisteredAgentTypes()` SHALL delegate to the agent registry.

The registry SHALL no longer be a hardcoded `Map` with static imports. It SHALL be dynamically populated from discovered `AgentPackage` instances.

#### Scenario: Registry contains built-in materializers
- **WHEN** `getRegisteredAgentTypes()` is called
- **THEN** it SHALL return at minimum `["claude-code", "pi-coding-agent", "mcp-agent"]`
- **AND** it SHALL also include any agents loaded from `.mason/config.json`

#### Scenario: getMaterializer returns materializer from AgentPackage
- **WHEN** `getMaterializer("claude-code")` is called
- **THEN** it SHALL return the `RuntimeMaterializer` from the `@clawmasons/claude-code` package's `AgentPackage.materializer` field

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
