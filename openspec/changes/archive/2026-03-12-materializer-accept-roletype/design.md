# Design: Materializer Refactor — Accept RoleType Input

## Architecture

The design introduces two concepts:

### 1. Materializer Registry

A lookup table mapping agent type strings to their `RuntimeMaterializer` instances. This decouples the orchestration function from specific materializer imports.

```typescript
// Registry maps agentType -> RuntimeMaterializer
const materializerRegistry: Map<string, RuntimeMaterializer> = new Map([
  ["claude-code", claudeCodeMaterializer],
  ["pi-coding-agent", piCodingAgentMaterializer],
  ["mcp-agent", mcpAgentMaterializer],
]);
```

Public functions:
- `getMaterializer(agentType: string): RuntimeMaterializer | undefined`
- `getRegisteredAgentTypes(): string[]`

### 2. materializeForAgent() Orchestration Function

Composes the adapter with materializer lookup:

```typescript
function materializeForAgent(
  role: RoleType,
  agentType: string,
  proxyEndpoint?: string,
  proxyToken?: string,
  options?: MaterializeOptions,
): MaterializationResult
```

Flow:
1. Look up materializer from registry — throw if not found
2. Call `adaptRoleToResolvedAgent(role, agentType)` from `@clawmasons/shared`
3. Call `materializer.materializeWorkspace(agent, proxyEndpoint, proxyToken, options)`
4. Return the result

### Design Decisions

1. **Default proxy endpoint**: When `proxyEndpoint` is not provided, default to `"http://mcp-proxy:9090"` (the standard Docker Compose proxy address).

2. **Agent type validation**: The function validates against both the materializer registry AND the dialect registry (via the adapter). If the agent type is not in the materializer registry, it throws `MaterializerError`. The adapter throws `AdapterError` for unknown dialects.

3. **No materializer interface changes**: The `RuntimeMaterializer` interface stays the same. Existing code that calls `materializeWorkspace()` with a `ResolvedAgent` continues to work unchanged.

4. **Single file**: All new code goes in `packages/cli/src/materializer/role-materializer.ts` — the registry and the orchestration function. This keeps the change minimal and focused.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/cli/src/materializer/role-materializer.ts` | New | Registry + `materializeForAgent()` |
| `packages/cli/src/materializer/index.ts` | Modify | Export new function and registry |
| `packages/cli/tests/materializer/role-materializer.test.ts` | New | Tests for the orchestration function |

## Testing Strategy

1. **Claude Code materialization from RoleType**: Build a RoleType with tasks/apps/skills, call `materializeForAgent(role, "claude-code")`, verify output has `.mcp.json`, `.claude/settings.json`, `.claude/commands/`, `AGENTS.md`, `skills/`.

2. **Cross-agent materialization**: Same RoleType materialized for `"mcp-agent"` produces MCP-agent-specific output (no `.claude/` directory, only `.mcp.json` and `AGENTS.md`).

3. **Equivalence test**: Build a `ResolvedAgent` manually, also build a `RoleType` with the same logical data. Materialize both via old path and new path, compare outputs match.

4. **Error cases**: Unknown agent type throws `MaterializerError`. Invalid role data throws `AdapterError`.

5. **Registry functions**: `getMaterializer()` returns correct materializer, `getRegisteredAgentTypes()` returns all types.
