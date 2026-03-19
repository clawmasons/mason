## 1. Remove .mcp.json — merge MCP config into .claude.json

- [x] 1.1 In `packages/claude-code-agent/src/materializer.ts` `materializeWorkspace`: remove `result.set(".mcp.json", generateMcpJson(...))` and instead merge MCP config into `.claude.json` (same as `materializeSupervisor` already does)
- [x] 1.2 Update `generateSettingsJson()` docstring/comment to clarify it contains permissions only (no mcpServers)
- [x] 1.3 Update `packages/claude-code-agent/tests/materializer.test.ts`: remove assertions expecting `.mcp.json` key; add assertions that `.claude.json` contains `mcpServers.chapter`

## 2. Remove AGENTS.md generation

- [x] 2.1 In `packages/claude-code-agent/src/materializer.ts`: remove `result.set("AGENTS.md", generateAgentsMd(agent))` from both `materializeWorkspace` and `materializeSupervisor`
- [x] 2.2 Remove `generateAgentsMd` from `packages/agent-sdk/src/helpers.ts`
- [x] 2.3 Remove `generateAgentsMd` export from `packages/agent-sdk/src/index.ts`
- [x] 2.4 Remove `generateAgentsMd` import from `packages/claude-code-agent/src/materializer.ts`
- [x] 2.5 Check `packages/pi-coding-agent/src/materializer.ts` and `packages/mcp-agent/src/materializer.ts` for `generateAgentsMd` calls — remove if present
- [x] 2.6 Remove `generateAgentsMd` test cases from `packages/agent-sdk/tests/helpers.test.ts`
- [x] 2.7 Remove AGENTS.md assertions from `packages/claude-code-agent/tests/materializer.test.ts`
- [x] 2.8 Check `packages/cli/src/materializer/common.ts` for any re-export of `generateAgentsMd` — remove if present

## 3. Fix compose restart policy

- [x] 3.1 In `packages/cli/src/materializer/docker-generator.ts`: change agent service `restart` from `"on-failure:3"` to `"no"`
- [x] 3.2 Update `packages/cli/tests/materializer/docker-generator.test.ts` (if it asserts `restart: "on-failure:3"`) to expect `"no"`

## 4. Implement OCI-gated restart loop in run command

- [x] 4.1 In `packages/cli/src/cli/commands/run-agent.ts`: wrap the `docker compose run --rm <runtime>` invocation to capture combined output
- [x] 4.2 Implement OCI restart loop: check output for `"OCI runtime"` substring; if matched, wait 2000ms then retry (max 3 attempts); on non-OCI failure exit immediately
- [x] 4.3 On OCI restart: collect all single-file volume entries from the active compose config (host path resolves to a file via `fs.statSync`); print the list and a recommendation to convert to directory mounts
- [x] 4.4 Print message when max restarts exceeded and exit non-zero

## 5. Update claude-code-materializer spec (main specs)

- [x] 5.1 Update `openspec/specs/claude-code-materializer/spec.md`: replace the `.mcp.json` / `settings.json mcpServers` requirement with the new `.claude.json` MCP merge requirement (matches delta spec)
- [x] 5.2 Update `openspec/specs/claude-code-materializer/spec.md`: move AGENTS.md requirement to REMOVED section

## 6. Verification

- [x] 6.1 Run `npx tsc --noEmit` from repo root — zero errors
- [x] 6.2 Run `npx vitest run packages/agent-sdk/tests/`
- [x] 6.3 Run `npx vitest run packages/claude-code-agent/tests/`
- [x] 6.4 Run `npx vitest run packages/cli/tests/`
