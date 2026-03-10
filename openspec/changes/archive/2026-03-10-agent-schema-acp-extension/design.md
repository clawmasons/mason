## Context

CHANGE 5 of the ACP Proxy PRD adds ACP awareness to the agent schema and materializer layer. This enables downstream changes (CHANGE 6-9) to generate ACP-mode Dockerfiles and orchestrate ACP sessions.

The existing materializer interface uses `materializeWorkspace(agent, proxyEndpoint, proxyToken?)`. ACP mode needs one additional signal: whether to generate ACP-specific configuration files. Rather than adding a boolean flag to the interface signature, we pass an options object to keep the interface extensible.

## Goals / Non-Goals

**Goals:**
- Add `acp` field to agent schema and resolved type
- Define `ACP_RUNTIME_COMMANDS` mapping
- Extend Claude Code materializer for ACP mode
- Extend pi-coding-agent materializer for ACP mode
- Create mcp-agent materializer
- Update materializer interface for extensibility

**Non-Goals:**
- Dockerfile ACP entrypoints (CHANGE 6)
- Docker session orchestration (CHANGE 8)
- ACP bridge or CLI command (CHANGE 7, 9)

## Decisions

### D1: Options object instead of positional parameter

**Choice:** Change `materializeWorkspace` signature to accept an options object as the fourth parameter: `materializeWorkspace(agent, proxyEndpoint, proxyToken?, options?)` where `options` includes `acpMode?: boolean`.

**Rationale:** Adding a boolean parameter directly would make the signature grow. An options object is forward-compatible for future extensions (e.g., extra metadata for CHANGE 8). Using optional parameter keeps backward compatibility.

### D2: ACP config file format

**Choice:** In ACP mode, the Claude Code materializer generates an additional `.chapter/acp.json` file containing `{ "port": <acp-port>, "command": "<acp-command>" }`. Same for pi-coding-agent.

**Rationale:** The ACP agent command needs to know which port to listen on and what command to run. A JSON config file is simple, machine-readable, and follows the existing pattern of `.mcp.json` for MCP config.

### D3: MCP agent materializer is minimal

**Choice:** The mcp-agent materializer generates `.mcp.json` (proxy config) and `AGENTS.md` only. No slash commands, no pi extensions, no settings.json.

**Rationale:** The mcp-agent is a tool-calling REPL, not a full coding agent. It doesn't need slash commands or IDE-specific settings. It just needs to know how to connect to the proxy.

### D4: ACP_RUNTIME_COMMANDS lives in materializer/common.ts

**Choice:** Place the constant alongside `PROVIDER_ENV_VARS` in `common.ts`.

**Rationale:** Both are constants used by materializers and Dockerfile generators. Keeps related configuration together. CHANGE 6 will import it from here for Dockerfile generation.

### D5: Default ACP port is 3002

**Choice:** The agent schema's `acp.port` defaults to 3002.

**Rationale:** PRD section 7.6 specifies this default. Port 3000 is the proxy, 3001 is the host ACP endpoint, 3002 is the container agent ACP port.

## Design

### Schema Changes

```typescript
// packages/shared/src/schemas/agent.ts
const acpSchema = z.object({
  port: z.number().int().positive().optional().default(3002),
});

// Added to agentChapterFieldSchema:
acp: acpSchema.optional(),
```

### Type Changes

```typescript
// packages/shared/src/types.ts — ResolvedAgent
acp?: {
  port: number;
};
```

### Materializer Interface

```typescript
// packages/cli/src/materializer/types.ts
export interface MaterializeOptions {
  acpMode?: boolean;
}

export interface RuntimeMaterializer {
  name: string;
  materializeWorkspace(
    agent: ResolvedAgent,
    proxyEndpoint: string,
    proxyToken?: string,
    options?: MaterializeOptions,
  ): MaterializationResult;
}
```

### ACP Runtime Commands

```typescript
// packages/cli/src/materializer/common.ts
export const ACP_RUNTIME_COMMANDS: Record<string, string> = {
  "claude-code": "claude-agent-acp",
  "pi-coding-agent": "pi-agent-acp",
  "node": "node src/index.js --acp",
};
```

### ACP Config File (generated in ACP mode)

```json
// .chapter/acp.json
{
  "port": 3002,
  "command": "claude-agent-acp"
}
```

### File Locations

- `packages/shared/src/schemas/agent.ts` — add `acp` field
- `packages/shared/src/types.ts` — add `acp` to ResolvedAgent
- `packages/cli/src/resolver/resolve.ts` — pass through `acp`
- `packages/cli/src/materializer/types.ts` — add MaterializeOptions, update interface
- `packages/cli/src/materializer/common.ts` — add ACP_RUNTIME_COMMANDS
- `packages/cli/src/materializer/claude-code.ts` — add ACP mode
- `packages/cli/src/materializer/pi-coding-agent.ts` — add ACP mode
- `packages/cli/src/materializer/mcp-agent.ts` — new materializer
- `packages/cli/src/materializer/index.ts` — export new materializer
- `packages/cli/tests/materializer/claude-code.test.ts` — ACP mode tests
- `packages/cli/tests/materializer/pi-coding-agent.test.ts` — ACP mode tests
- `packages/cli/tests/materializer/mcp-agent.test.ts` — new tests

### Dependencies

- Agent schema change: `zod` (already a dependency)
- No new external dependencies
