## MODIFIED Requirements

### Requirement: Runtime materializer registration
The `getMaterializer()` function in docker-init SHALL return `mcpAgentMaterializer` when the runtime is `"mcp-agent"`, enabling workspace file generation (`.mcp.json`, `AGENTS.md`) for mcp-agent runtime agents.

#### Scenario: mcp-agent runtime materializes workspace
- **WHEN** `chapter build` processes an agent with `runtimes: ["mcp-agent"]`
- **THEN** the build SHALL generate workspace files including `.mcp.json` with proxy endpoint configuration

## ADDED Requirements

### Requirement: mcp-agent runtime Dockerfile generation
The agent Dockerfile generator SHALL recognize `"mcp-agent"` as a runtime and produce an entrypoint of `["npx", "mcp-agent"]`.

#### Scenario: mcp-agent Dockerfile entrypoint
- **WHEN** an agent Dockerfile is generated for runtime `"mcp-agent"`
- **THEN** the Dockerfile SHALL contain `ENTRYPOINT ["npx", "mcp-agent"]`

### Requirement: mcp-agent ACP runtime command
The `ACP_RUNTIME_COMMANDS` mapping SHALL include `"mcp-agent"` mapped to `"npx mcp-agent --acp"` for ACP mode entrypoint generation.

#### Scenario: ACP mode Dockerfile entrypoint
- **WHEN** an agent Dockerfile is generated for runtime `"mcp-agent"` in ACP mode
- **THEN** the Dockerfile SHALL use the ACP command `"npx mcp-agent --acp"` as the entrypoint
