## Context

Agent-specific logic is currently spread across `packages/cli`:
- **Materializers** (`src/materializer/claude-code.ts`, `pi-coding-agent.ts`, `mcp-agent.ts`): Generate runtime-specific workspace files (MCP configs, settings, AGENTS.md, slash commands, extensions, agent-launch.json).
- **Common maps** (`src/materializer/common.ts`): `ACP_RUNTIME_COMMANDS`, `RUNTIME_COMMANDS`, `RUNTIME_CREDENTIALS` — hardcoded per-agent dictionaries.
- **Dockerfile generator** (`src/generator/agent-dockerfile.ts`): `getRuntimeInstall()` switch statement with per-agent npm install commands.
- **Run command** (`src/commands/run-agent.ts`): `AGENT_TYPE_ALIASES` hardcoded map, agent type inference.
- **Materializer registry** (`src/materializer/role-materializer.ts`): Hardcoded `Map<string, RuntimeMaterializer>` with static imports of all three materializers.

The existing `RuntimeMaterializer` interface (in `src/materializer/types.ts`) already defines the core contract: `materializeWorkspace()` and optional `materializeHome()`. This is a solid foundation — the SDK extends it with metadata and Dockerfile hooks.

## Goals / Non-Goals

**Goals:**
- Each agent is a self-contained npm package that can be developed, tested, and published independently
- A clear SDK interface (`AgentPackage`) that captures everything the CLI needs from an agent: metadata, materialization, Dockerfile hooks, and ACP config
- The CLI discovers agents dynamically: built-in agents via direct npm dependencies, third-party agents via `.mason/config.json`
- Zero CLI code changes required to add a new agent — just install the package and register it
- Common utilities (AGENTS.md generation, skill READMEs, agent-launch.json) stay in the SDK as shared helpers

**Non-Goals:**
- Remote agent package registries or auto-installation — users must `npm install` packages themselves
- Runtime isolation between agent packages — they share the CLI process
- Versioned SDK compatibility negotiation — all packages must match the installed SDK version
- Changing the Docker container architecture (agent-entry, workspace mount, etc.)
- Modifying the `ResolvedAgent`/`RoleType` type system in `@clawmasons/shared`

## Decisions

### 1. SDK as a separate `@clawmasons/agent-sdk` package

The SDK lives in `packages/agent-sdk/` and exports:
- The `AgentPackage` interface (the primary contract)
- The existing `RuntimeMaterializer`, `MaterializationResult`, `MaterializeOptions` types (moved from CLI)
- Common helper functions (moved from `common.ts`): `generateAgentsMd()`, `generateSkillReadme()`, `generateAgentLaunchJson()`, `generateAcpConfigJson()`, `formatPermittedTools()`, `collectAllSkills()`, `collectAllTasks()`
- Re-exports of `ResolvedAgent`, `ResolvedRole`, etc. from `@clawmasons/shared` for convenience

**Why a separate package vs. exporting from `@clawmasons/shared`**: The SDK has a different audience (agent implementors) and different dependencies. `@clawmasons/shared` is a foundational types package with no opinions about materialization. The SDK builds on top of it.

**Alternative considered**: Embedding the SDK in `@clawmasons/shared`. Rejected because it would bloat the shared package with materialization-specific utilities and create a circular concern — shared shouldn't know about agent packaging.

### 2. `AgentPackage` interface design

```typescript
interface AgentPackage {
  /** Primary agent type name used in `mason run --agent <name>` */
  name: string;

  /** Alternative names (e.g., "claude" for "claude-code") */
  aliases?: string[];

  /** The materializer implementation */
  materializer: RuntimeMaterializer;

  /** Dockerfile generation hooks */
  dockerfile?: {
    /** Default base Docker image (e.g., "node:22-slim") */
    baseImage?: string;
    /** Dockerfile RUN instructions to install the agent runtime */
    installSteps?: string;
    /** Additional apt packages required by the agent */
    aptPackages?: string[];
  };

  /** ACP mode configuration */
  acp?: {
    /** Command to start the agent in ACP mode (e.g., "claude-agent-acp") */
    command: string;
  };

  /** Runtime command configuration for agent-launch.json */
  runtime?: {
    /** Default command to run the agent (e.g., "claude") */
    command: string;
    /** Default args (e.g., ["--effort", "max"]) */
    args?: string[];
    /** Additional credentials the runtime always needs */
    credentials?: Array<{
      key: string;
      type: "env" | "file";
      path?: string;
    }>;
  };
}
```

**Why flat metadata instead of methods**: Dockerfile generation, ACP commands, and runtime config are declarative data, not behavioral logic. Keeping them as data makes it easy for the CLI to compose them without callback spaghetti. The materializer methods handle the behavioral part.

**Alternative considered**: A single `generate()` method that returns everything (workspace files + Dockerfile + compose config). Rejected because it conflates concerns and makes it impossible for the CLI to orchestrate the build pipeline.

### 3. Agent package default export convention

Each agent package's main entry point exports an `AgentPackage` object as the default export:

```typescript
// packages/claude-code/src/index.ts
import { type AgentPackage } from "@clawmasons/agent-sdk";
import { claudeCodeMaterializer } from "./materializer.js";

const claudeCodeAgent: AgentPackage = {
  name: "claude-code",
  aliases: ["claude"],
  materializer: claudeCodeMaterializer,
  dockerfile: {
    installSteps: "RUN npm install -g @anthropic-ai/claude-code",
  },
  acp: { command: "claude-agent-acp" },
  runtime: {
    command: "claude",
    args: ["--effort", "max"],
    credentials: [
      { key: "CLAUDE_CODE_OAUTH_TOKEN", type: "env" },
    ],
  },
};

export default claudeCodeAgent;
```

**Why default export**: Simple `import agent from "@clawmasons/claude-code"`. The CLI can dynamically `import()` any package and get the agent. Named exports are also available for direct access to the materializer.

### 4. Discovery mechanism

The CLI discovers agents in two phases:

**Phase 1 — Built-in agents**: Direct imports of `@clawmasons/claude-code`, `@clawmasons/pi-coding-agent`, `@clawmasons/mcp-agent`. These are listed in the CLI's `package.json` dependencies.

**Phase 2 — Config-declared agents**: Read `.mason/config.json` (if it exists):
```json
{
  "agents": {
    "openclaw": { "package": "@clawmasons/openclaw" }
  }
}
```
For each entry, attempt `import(packageName)`. If the module exports a valid `AgentPackage`, register it. If not, warn and skip.

**Registry**: A `Map<string, AgentPackage>` built at CLI startup. Aliases are expanded into the map (e.g., both `"claude"` and `"claude-code"` point to the same `AgentPackage`). Config-declared agents can override built-in agents by name (explicit user intent).

**Why not a plugin system with hooks/lifecycle**: Over-engineering. The current need is just "give me the materializer and metadata for agent type X." A registry map is the simplest thing that works.

### 5. Refactoring the CLI to consume the SDK

**`role-materializer.ts`**: Replace hardcoded registry with the discovery-built registry. `getMaterializer(agentType)` looks up from the dynamic registry. `materializeForAgent()` is unchanged in signature.

**`common.ts`**: Move `RUNTIME_COMMANDS`, `RUNTIME_CREDENTIALS`, `ACP_RUNTIME_COMMANDS` lookups to read from `AgentPackage.runtime`, `AgentPackage.acp` fields via the registry. Helper functions (`generateAgentsMd`, etc.) move to SDK.

**`agent-dockerfile.ts`**: Replace `getRuntimeInstall()` switch with `agentPackage.dockerfile?.installSteps ?? ""`. Base image from `agentPackage.dockerfile?.baseImage ?? role.baseImage ?? "node:22-slim"`.

**`run-agent.ts`**: Replace `AGENT_TYPE_ALIASES` with registry alias lookup. `inferAgentType()` unchanged (uses role's `agentDialect`).

### 6. Package structure

```
packages/agent-sdk/
├── package.json          (@clawmasons/agent-sdk)
├── tsconfig.json
├── src/
│   ├── index.ts          (exports AgentPackage, RuntimeMaterializer, helpers)
│   ├── types.ts          (AgentPackage, RuntimeMaterializer, MaterializationResult)
│   ├── helpers.ts        (generateAgentsMd, generateSkillReadme, etc.)
│   └── discovery.ts      (loadBuiltinAgents, loadConfigAgents, createAgentRegistry)
└── tests/
    ├── discovery.test.ts
    └── helpers.test.ts

packages/claude-code/
├── package.json          (@clawmasons/claude-code)
├── tsconfig.json
├── src/
│   ├── index.ts          (default export: AgentPackage)
│   └── materializer.ts   (moved from cli/src/materializer/claude-code.ts)
└── tests/
    └── materializer.test.ts

packages/pi-coding-agent/
├── package.json          (@clawmasons/pi-coding-agent)
├── tsconfig.json
├── src/
│   ├── index.ts          (default export: AgentPackage)
│   └── materializer.ts   (moved from cli/src/materializer/pi-coding-agent.ts)
└── tests/
    └── materializer.test.ts

packages/mcp-agent/        (existing — add materializer)
├── src/
│   ├── index.ts          (add default AgentPackage export)
│   └── materializer.ts   (moved from cli/src/materializer/mcp-agent.ts)
└── tests/
    └── materializer.test.ts
```

## Risks / Trade-offs

- **Breaking change for internal imports** → Mitigation: This is a monorepo refactor; all consumers are internal. Update all imports in a single PR. No external API surface changes.
- **Dynamic import of third-party packages could fail at runtime** → Mitigation: Wrap in try/catch, log a clear warning with package name and error, skip the agent. Built-in agents always work regardless.
- **SDK version mismatch between CLI and agent packages** → Mitigation: All packages are in the same monorepo with workspace-linked versions. For third-party packages, use TypeScript's structural typing — if the shape matches, it works. Add a `sdkVersion` field to `AgentPackage` for future compat checks if needed.
- **Moving common.ts helpers to SDK creates a dependency from agent packages on SDK** → This is intentional and desirable. Agent packages should depend on the SDK, not on CLI internals.
- **Performance of dynamic imports at CLI startup** → Mitigation: Built-in agents use static imports. Only config-declared agents use dynamic import, and there will typically be 0-2 of these.
