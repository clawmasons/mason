## MODIFIED Requirements

### Requirement: AcpConfig provides ACP mode command

The `AgentPackage.acp` field SHALL be an `AcpConfig` object with:
- `command: string` — the command to start the agent in ACP mode (e.g., `"claude-agent-acp"`)

The `acp.command` value SHALL be used when generating `agent-launch.json` for ACP mode sessions. It SHALL NOT be used to generate any `.chapter/acp.json` file.

#### Scenario: Agent declares ACP command used in agent-launch.json
- **WHEN** an agent package sets `acp.command` to `"claude-agent-acp"`
- **AND** `generateAgentLaunchJson` is called with `acpMode: true`
- **THEN** the generated `agent-launch.json` SHALL use `"claude-agent-acp"` as the runtime command

#### Scenario: Agent omits ACP config
- **WHEN** an agent package does not set the `acp` field
- **THEN** the agent SHALL not support ACP mode and attempting to run it in ACP mode SHALL produce an error

## REMOVED Requirements

### Requirement: generateAcpConfigJson generates .chapter/acp.json content
**Reason**: `.chapter/acp.json` has no consumer in the codebase. The helper function was exported and used by materializers but the generated file was never read at runtime.
**Migration**: Remove all calls to `generateAcpConfigJson`. Remove the function from `agent-sdk/src/helpers.ts` and its export from `agent-sdk/src/index.ts` and any re-exports in `cli/src/materializer/common.ts`.
