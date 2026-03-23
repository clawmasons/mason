## Context

Skills and tasks are authored with Claude's native MCP tool naming convention (`mcp__{server}__{tool}`). When these files are materialized into a Docker build directory for a specific agent, the tool names need to match what that agent's runtime expects.

Currently, `materializeTasks()` and `materializeSkills()` in `packages/agent-sdk/src/helpers.ts` produce file content as-is — no tool name translation occurs. The Docker build pipeline in `packages/cli/src/materializer/docker-generator.ts` writes these files verbatim.

## Goals / Non-Goals

**Goals:**
- Allow each agent to declare its MCP tool naming convention via `mcpNameTemplate`
- Automatically rewrite `mcp__{server}__{tool}` references in task/skill content during materialization
- Keep the authoring format unchanged — authors always write `mcp__{server}__{tool}`

**Non-Goals:**
- Rewriting tool names in non-task/skill files (settings.json, .mcp.json, etc.)
- Runtime tool name translation (this is build-time only)
- Changing how MCP servers are configured or discovered

## Decisions

### 1. Place `convertMcpFormat()` in `packages/shared/src/`

The utility is a pure string transform with no agent-sdk dependencies. Placing it in `shared` makes it available to both `agent-sdk` helpers and `cli` materializer code without circular dependencies.

**Alternative considered**: Putting it in `agent-sdk` — rejected because `shared` is the right layer for stateless utilities used across packages.

### 2. Apply rewriting inside `materializeTasks()` and `materializeSkills()`

Rather than modifying the Docker generator, apply `convertMcpFormat()` at the point where file content is produced. Both functions already receive the config object and return `MaterializationResult` maps. Adding the rewrite here keeps the logic co-located with file content generation.

The functions will accept an optional `mcpNameTemplate` parameter. When provided, each file's content is passed through `convertMcpFormat()` before being added to the result map.

**Alternative considered**: Rewriting in `docker-generator.ts` after materialization — rejected because it would require the generator to distinguish task/skill files from other workspace files, adding fragile path-matching logic.

### 3. Add `mcpNameTemplate` to `AgentPackage` interface

Add an optional `mcpNameTemplate?: string` field to `AgentPackage` in `packages/agent-sdk/src/types.ts`. Each agent package sets this in its default export:

- `claude-code-agent`: `"mcp__mason__${server}_${tool}"`
- `pi-coding-agent`: `"${server}_${tool}"`
- `mcp-agent`: omitted (uses default `"${server}_${tool}"`)

### 4. Template resolution order

When materializing, resolve the template in this order:
1. `AgentTaskConfig.mcpNameTemplate` (per-config override, not used initially)
2. `AgentPackage.mcpNameTemplate` (agent-level default)
3. Fallback: `"${server}_${tool}"`

This gives flexibility for future per-config overrides without over-engineering now.

### 5. Pass template through materializer call chain

The `materializeForAgent()` function in the CLI already looks up the `AgentPackage`. It will read `mcpNameTemplate` from the package and pass it to `materializeTasks()` / `materializeSkills()`. The materializer's `materializeWorkspace()` method receives it via the existing options pattern or a new parameter.

## Risks / Trade-offs

- **Regex false positives** → The pattern `mcp__X__Y` is distinctive enough that false matches in natural language are negligible. Mitigation: the regex requires non-underscore chars for server and word chars for tool.
- **Template typos in agent packages** → A bad template silently produces wrong tool names. Mitigation: unit tests for each agent's template output.
- **Performance on large files** → Single regex pass per file, negligible cost. No mitigation needed.
