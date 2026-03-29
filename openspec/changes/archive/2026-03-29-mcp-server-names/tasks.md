## 1. Utility Function

- [x] 1.1 Add `convertMcpFormat(input: string, template: string): string` to `packages/shared/src/mcp-name-rewriter.ts`
- [x] 1.2 Export `convertMcpFormat` from `packages/shared/src/index.ts`
- [x] 1.3 Add unit tests for `convertMcpFormat` in `packages/shared/tests/mcp-name-rewriter.test.ts` — cover default template, claude-code template, multiple references, no matches

## 2. AgentPackage Type Extension

- [x] 2.1 Add optional `mcpNameTemplate?: string` field to `AgentPackage` interface in `packages/agent-sdk/src/types.ts`
- [x] 2.2 Set `mcpNameTemplate: "mcp__mason__${server}_${tool}"` in `packages/claude-code-agent/` default export
- [x] 2.3 Set `mcpNameTemplate: "${server}_${tool}"` in `packages/pi-coding-agent/` default export

## 3. Materialization Integration

- [x] 3.1 Update `materializeTasks()` in `packages/agent-sdk/src/helpers.ts` to accept optional `mcpNameTemplate` parameter and apply `convertMcpFormat()` to each file's content
- [x] 3.2 Update `materializeSkills()` in `packages/agent-sdk/src/helpers.ts` to accept optional `mcpNameTemplate` parameter and apply `convertMcpFormat()` to each file's content
- [x] 3.3 Update callers of `materializeTasks()` / `materializeSkills()` to pass the agent's `mcpNameTemplate` through the call chain
- [x] 3.4 Add unit tests for `materializeTasks()` and `materializeSkills()` with MCP name rewriting

## 4. Verification

- [x] 4.1 Run `npx tsc --noEmit` across affected packages
- [x] 4.2 Run `npx eslint src/ tests/` across affected packages
- [x] 4.3 Run unit tests for `packages/shared/`, `packages/agent-sdk/`, `packages/cli/`
