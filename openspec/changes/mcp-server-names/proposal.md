## Why

Skills and tasks reference MCP tools using Claude's native naming convention (`mcp__{server}__{tool}`), but different agents use different MCP tool name formats. Pi coding agent expects `{server}_{tool}`, while Claude Code in the mason container uses `mcp__mason__{server}_{tool}`. Without translation, copied skill/task files contain tool names the target agent can't resolve.

## What Changes

- Add a `convertMcpFormat()` utility that rewrites `mcp__{server}__{tool}` references to an agent-specified template format to be used in the container.
- Extend `AgentPackage` with an `mcpNameTemplate` field so each agent declares its MCP tool naming convention
- During Docker build materialization, apply `convertMcpFormat()` to task and skill file content before writing to the build directory
- Default template is `${server}_${tool}` (strip the `mcp__` prefix)

## Capabilities

### New Capabilities
- `mcp-name-rewriting`: Translates MCP tool name references in skill/task content during materialization using agent-specific naming templates

### Modified Capabilities
- `agent-task-interface`: Agent packages gain an `mcpNameTemplate` field to declare their MCP tool name format
- `materializer-interface`: Materialization pipeline applies MCP name rewriting to task/skill file content

## Impact

- **Packages**: `agent-sdk` (types + helper), `shared` (utility function), `claude-code-agent` and `pi-coding-agent` (template declarations)
- **Build pipeline**: `docker-generator.ts` or materializer helpers — text replacement applied during `materializeTasks()` / `materializeSkills()`
- **Existing skills/tasks**: No changes needed — they keep using the canonical `mcp__{server}__{tool}` format as the authoring convention
