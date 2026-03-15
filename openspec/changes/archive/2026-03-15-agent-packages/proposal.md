## Why

Agent materialization logic (workspace file generation, Dockerfile creation, home directory setup) is currently embedded inside `packages/cli`. Adding a new agent requires modifying CLI internals across multiple files — materializer implementations, ACP command mappings, type aliases, and Docker generation. This tight coupling makes it difficult for third parties to contribute agents and slows down our own agent development velocity. We need a plugin-based agent architecture where each agent is a self-contained npm package implementing a well-defined SDK.

## What Changes

- **New `@clawmasons/agent-sdk` package**: Defines the contract (TypeScript interfaces + base utilities) that all agent packages must implement. Covers materialization, Dockerfile generation hooks, home directory setup, ACP configuration, and agent metadata.
- **Extract `claude-code` agent into `@clawmasons/claude-code` package**: Move the Claude Code materializer, home materializer, and agent-specific logic from `packages/cli/src/materializer/claude-code.ts` into a standalone package at `packages/claude-code/`.
- **Extract `pi-coding-agent` into `@clawmasons/pi-coding-agent` package**: Move the Pi coding agent materializer from `packages/cli/src/materializer/pi-coding-agent.ts` into `packages/pi-coding-agent/`.
- **Extract `mcp-agent` materializer into existing `@clawmasons/mcp-agent` package**: The package already exists but only contains the REPL runtime. Add the materializer implementation to it.
- **BREAKING**: Refactor `packages/cli` to consume agents via the SDK interface instead of hard-coded imports. The CLI's materializer registry, `AGENT_TYPE_ALIASES`, `ACP_RUNTIME_COMMANDS`, and Dockerfile generation will delegate to agent packages.
- **Third-party agent support**: The CLI will discover agent packages from `.mason/config.json` in addition to its built-in agents. Any installed npm package implementing `@clawmasons/agent-sdk` can be used with `mason run --agent <name>`.

## Capabilities

### New Capabilities
- `agent-sdk`: The SDK interface specification that all agent packages must implement. Covers `AgentPackage` interface with methods for materialization, Dockerfile hooks, home setup, ACP commands, metadata (name, aliases, default base image), and agent discovery/registration.
- `agent-discovery`: The mechanism by which the CLI discovers and loads agent packages — built-in agents via direct dependencies, third-party agents via `.mason/config.json` pointing to installed npm packages.

### Modified Capabilities
- `materializer-interface`: The `RuntimeMaterializer` interface moves into the SDK and becomes the core contract for agent packages rather than a CLI-internal type.
- `run-command`: Agent type resolution changes from hardcoded aliases/registry to dynamic discovery from loaded agent packages.
- `agent-dockerfile`: Dockerfile generation gains extension points so agent packages can declare custom install steps, base images, and build-time configuration.

## Impact

- **Code**: Major refactor of `packages/cli/src/materializer/` (extract 3 materializers) and `packages/cli/src/generator/agent-dockerfile.ts` (add extension points). `run-agent.ts` agent resolution logic changes.
- **New packages**: `packages/agent-sdk/`, `packages/claude-code/`, `packages/pi-coding-agent/`. Existing `packages/mcp-agent/` gains materializer code.
- **Dependencies**: CLI adds dependency on `@clawmasons/agent-sdk` and the three agent packages. Agent packages depend on `@clawmasons/agent-sdk` and `@clawmasons/shared`.
- **Configuration**: New `.mason/config.json` `agents` field for third-party agent registration.
- **Monorepo**: 2 new packages added to workspace. Build order updated for new dependency edges.
- **Breaking**: Direct imports of materializer internals from CLI will no longer work. All agent interaction goes through the SDK interface.

## Test Changes

### Relocated Tests (move from CLI to agent packages)
- `packages/cli/tests/materializer/claude-code.test.ts` → `packages/claude-code/tests/materializer.test.ts`
- `packages/cli/tests/materializer/pi-coding-agent.test.ts` → `packages/pi-coding-agent/tests/materializer.test.ts`
- `packages/cli/tests/materializer/mcp-agent.test.ts` → `packages/mcp-agent/tests/materializer.test.ts`

### Modified Tests
- `packages/cli/tests/materializer/role-materializer.test.ts`: Update to test the new SDK-based registry that discovers and loads agent packages instead of hardcoded materializer map.
- `packages/cli/tests/materializer/docker-generator.test.ts`: Update to use SDK extension points for agent-specific Dockerfile generation hooks.
- `packages/cli/tests/cli/run-agent.test.ts`: Update agent type resolution tests to use dynamic discovery from loaded agent packages instead of `AGENT_TYPE_ALIASES`.
- `packages/cli/tests/generator/agent-dockerfile.test.ts`: Update to test Dockerfile generation with pluggable agent install steps from SDK.

### New Tests
- `packages/agent-sdk/tests/`: SDK interface validation tests — verify that agent packages conforming to the interface are correctly typed and callable.
- `packages/agent-sdk/tests/discovery.test.ts`: Agent discovery tests — loading built-in agents, loading from `.mason/config.json`, handling missing/invalid packages.
- Each agent package (`claude-code`, `pi-coding-agent`, `mcp-agent`): Integration tests verifying the package correctly implements the full `AgentPackage` interface and produces expected materialization output.

### E2E Tests
- Existing e2e tests should continue to pass unchanged since the external behavior (Docker workspace generation, agent container startup) remains the same — only the internal package boundaries shift.
