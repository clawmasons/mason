## Why

The ACP proxy needs to know which agents support ACP mode and how to configure them. Currently the agent schema has no ACP-specific fields, and materializers have no concept of ACP mode. Without this, CHANGE 6 (Dockerfile ACP entrypoint) and CHANGE 8/9 (Docker session + CLI command) cannot determine the correct ACP agent command or generate ACP-aware workspace configurations.

This change adds the `acp` schema field, the `ACP_RUNTIME_COMMANDS` mapping, extends the Claude Code and pi-coding-agent materializers for ACP mode, and creates a new mcp-agent materializer.

## What Changes

- **Schema extension:** Add optional `acp: { port: number }` field to `agentChapterFieldSchema` in `packages/shared/src/schemas/agent.ts`
- **Type extension:** Add `acp?: { port: number }` to `ResolvedAgent` in `packages/shared/src/types.ts`
- **Resolver pass-through:** Pass `acp` field from schema to resolved agent in `packages/cli/src/resolver/resolve.ts`
- **ACP runtime commands:** Add `ACP_RUNTIME_COMMANDS` constant to `packages/cli/src/materializer/common.ts` mapping runtime names to their ACP agent commands
- **Claude Code materializer:** Accept optional `acpMode` option; when true, generate an ACP agent config file alongside standard workspace files
- **Pi-coding-agent materializer:** Same ACP mode extension
- **MCP agent materializer:** New materializer at `packages/cli/src/materializer/mcp-agent.ts` for the mcp-agent package from CHANGE 3
- **Materializer interface:** Add optional `acpMode` parameter to `materializeWorkspace` signature
- **Tests:** Add/update materializer tests for ACP mode behavior

## Capabilities

### New Capabilities
- `agent-schema-acp-field`: Agent schema accepts optional `acp: { port }` configuration
- `acp-runtime-commands`: Mapping from runtime names to ACP agent commands
- `materializer-acp-mode`: Materializers support `acpMode` parameter for ACP-specific config generation
- `mcp-agent-materializer`: Dedicated materializer for the mcp-agent package

### Modified Capabilities
- `claude-code-materializer`: Extended with ACP mode support
- `pi-coding-agent-materializer`: Extended with ACP mode support
- `materializer-interface`: Updated to accept `acpMode` option

## Impact

- **Modified file:** `packages/shared/src/schemas/agent.ts` -- add `acp` field
- **Modified file:** `packages/shared/src/types.ts` -- add `acp` to ResolvedAgent
- **Modified file:** `packages/cli/src/resolver/resolve.ts` -- pass through `acp` field
- **Modified file:** `packages/cli/src/materializer/types.ts` -- add `acpMode` parameter
- **Modified file:** `packages/cli/src/materializer/common.ts` -- add ACP_RUNTIME_COMMANDS
- **Modified file:** `packages/cli/src/materializer/claude-code.ts` -- ACP mode support
- **Modified file:** `packages/cli/src/materializer/pi-coding-agent.ts` -- ACP mode support
- **Modified file:** `packages/cli/src/materializer/index.ts` -- export mcp-agent materializer
- **New file:** `packages/cli/src/materializer/mcp-agent.ts` -- mcp-agent materializer
- **New/Updated tests:** materializer tests for ACP mode
- **No breaking changes** -- `acpMode` is optional, existing behavior unchanged
