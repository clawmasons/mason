## ADDED Requirements

### Requirement: AgentPackage interface defines the contract for agent packages

The system SHALL define an `AgentPackage` interface that all agent packages MUST implement. The interface SHALL include:
- `name: string` — the primary agent type identifier used in `mason run --agent <name>`
- `aliases?: string[]` — optional alternative names for the agent
- `materializer: RuntimeMaterializer` — the workspace materialization implementation
- `dockerfile?: DockerfileConfig` — optional Dockerfile generation hooks
- `acp?: AcpConfig` — optional ACP mode configuration
- `runtime?: RuntimeConfig` — optional runtime command configuration

#### Scenario: Agent package implements full interface
- **WHEN** an agent package exports an `AgentPackage` object with `name` and `materializer`
- **THEN** it SHALL be accepted by the agent registry

#### Scenario: Agent package with optional fields omitted
- **WHEN** an agent package exports an `AgentPackage` with only `name` and `materializer` (no `dockerfile`, `acp`, or `runtime`)
- **THEN** it SHALL be accepted and the CLI SHALL use default values for omitted fields

### Requirement: DockerfileConfig provides Dockerfile generation hooks

The `AgentPackage.dockerfile` field SHALL be a `DockerfileConfig` object with:
- `baseImage?: string` — default base Docker image (e.g., `"node:22-slim"`)
- `installSteps?: string` — Dockerfile RUN instructions to install the agent runtime (raw Dockerfile lines)
- `aptPackages?: string[]` — additional apt packages required by the agent runtime

#### Scenario: Agent declares install steps
- **WHEN** an agent package sets `dockerfile.installSteps` to `"RUN npm install -g @anthropic-ai/claude-code"`
- **THEN** the Dockerfile generator SHALL include that line in the generated Dockerfile

#### Scenario: Agent declares no install steps
- **WHEN** an agent package omits `dockerfile.installSteps`
- **THEN** the Dockerfile generator SHALL produce a Dockerfile with no agent-specific install step

#### Scenario: Agent declares apt packages
- **WHEN** an agent package sets `dockerfile.aptPackages` to `["git", "curl"]`
- **THEN** the Dockerfile generator SHALL include an `apt-get install` step for those packages, merged with any role-declared apt packages

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

### Requirement: RuntimeConfig provides agent-launch.json configuration

The `AgentPackage.runtime` field SHALL be a `RuntimeConfig` object with:
- `command: string` — the default command to run the agent (e.g., `"claude"`)
- `args?: string[]` — default command arguments (e.g., `["--effort", "max"]`)
- `credentials?: Array<{ key: string; type: "env" | "file"; path?: string }>` — additional credentials the runtime always requires

#### Scenario: Agent declares runtime command and args
- **WHEN** an agent package sets `runtime.command` to `"claude"` and `runtime.args` to `["--effort", "max"]`
- **THEN** the generated `agent-launch.json` SHALL use these values for the command and args fields

#### Scenario: Agent declares runtime credentials
- **WHEN** an agent package sets `runtime.credentials` with a file credential
- **THEN** the generated `agent-launch.json` SHALL include those credentials merged with role-declared credentials

#### Scenario: Agent omits runtime config
- **WHEN** an agent package does not set the `runtime` field
- **THEN** the generated `agent-launch.json` SHALL use the agent `name` as the default command with no args

### Requirement: Agent packages use default export convention

Each agent package SHALL export its `AgentPackage` object as the default export of the package's main entry point. Named exports for individual components (e.g., the materializer) SHALL also be available.

#### Scenario: Default import resolves AgentPackage
- **WHEN** the CLI runs `import agent from "@clawmasons/claude-code-agent"`
- **THEN** the `agent` variable SHALL be an `AgentPackage` object with `name`, `materializer`, and other fields

#### Scenario: Named import for materializer
- **WHEN** the CLI runs `import { claudeCodeMaterializer } from "@clawmasons/claude-code-agent"`
- **THEN** the import SHALL resolve to the `RuntimeMaterializer` implementation

### Requirement: SDK exports common helper functions

The `@clawmasons/agent-sdk` package SHALL export the following helper functions for use by agent materializer implementations:
- `generateAgentsMd(agent: ResolvedAgent): string`
- `generateSkillReadme(skill: ResolvedSkill): string`
- `generateAgentLaunchJson(runtime: string, roleCredentials: string[], acpMode?: boolean): string`
- `formatPermittedTools(permissions): string`
- `collectAllSkills(roles: ResolvedRole[]): Map<string, ResolvedSkill>`
- `collectAllTasks(roles: ResolvedRole[]): Array<[ResolvedTask, ResolvedRole[]]>`

These functions SHALL be moved from `packages/cli/src/materializer/common.ts` into the SDK package.

#### Scenario: Agent package uses SDK helpers
- **WHEN** an agent materializer calls `generateAgentsMd(agent)` from `@clawmasons/agent-sdk`
- **THEN** it SHALL produce the same AGENTS.md content as the current CLI implementation

#### Scenario: generateAgentLaunchJson uses AgentPackage runtime config
- **WHEN** `generateAgentLaunchJson()` is called
- **THEN** it SHALL accept runtime config from the `AgentPackage.runtime` field instead of hardcoded `RUNTIME_COMMANDS` and `RUNTIME_CREDENTIALS` maps

### Requirement: SDK re-exports shared types for convenience

The `@clawmasons/agent-sdk` package SHALL re-export the following types from `@clawmasons/shared`:
- `ResolvedAgent`, `ResolvedRole`, `ResolvedTask`, `ResolvedSkill`
- `MaterializationResult`, `MaterializeOptions`, `RuntimeMaterializer`

#### Scenario: Agent package imports types from SDK only
- **WHEN** an agent package needs `ResolvedAgent` and `RuntimeMaterializer`
- **THEN** it SHALL be able to import both from `@clawmasons/agent-sdk` without a direct `@clawmasons/shared` dependency

## REMOVED Requirements

### Requirement: generateAcpConfigJson generates .chapter/acp.json content
**Reason**: `.chapter/acp.json` has no consumer in the codebase. The helper function was exported and used by materializers but the generated file was never read at runtime.
**Migration**: Remove all calls to `generateAcpConfigJson`. Remove the function from `agent-sdk/src/helpers.ts` and its export from `agent-sdk/src/index.ts` and any re-exports in `cli/src/materializer/common.ts`.

### Requirement: SDK exports generateAgentsMd helper
**Reason**: `AGENTS.md` generation is removed from all agents. The helper has no remaining callers and retaining it invites accidental use.
**Migration**: Remove `generateAgentsMd` from `agent-sdk/src/helpers.ts`. Remove its export from `agent-sdk/src/index.ts`. Remove any re-export in `cli/src/materializer/common.ts`. Remove test cases for `generateAgentsMd` in `agent-sdk/tests/helpers.test.ts`.
