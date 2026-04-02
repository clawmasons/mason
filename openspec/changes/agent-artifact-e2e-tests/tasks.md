## 1. Shared Helper (mason repo)

- [x] 1.1 Add `testWorkspaceArtifacts(workspaceDir, role, agentType, checks)` to `packages/agent-sdk/src/testing/index.ts` — resolves paths relative to `.mason/docker/<role>/<agentType>/`, checks `buildFiles` against `build/workspace/project/`, `homeFiles` against `home/`, `workspaceFiles` against `workspace/`
- [x] 1.2 Export `testWorkspaceArtifacts` from the testing module's public API
- [x] 1.3 Throw descriptive errors on missing file (include full path + category) and content mismatch (include expected string + truncated actual content) — matching `testFileContents` error style

## 2. Claude-code-agent e2e test (mason-extensions repo)

- [x] 2.1 Create `agents/claude-code-agent/tests/e2e/artifacts.test.ts` with `copyFixtureWorkspace("claude-code-agent", { fixture: "claude-test-project" })` setup
- [x] 2.2 Add test: run `mason run --role writer --agent claude -p "what is 2+2"` then verify task at `.claude/commands/take-notes.md` contains "Take Notes"
- [x] 2.3 Add test: verify skill at `.claude/skills/markdown-conventions/SKILL.md` contains "Markdown Conventions"
- [x] 2.4 Add test: verify MCP config at home `.claude.json` contains "mcpServers"
- [x] 2.5 Add test: verify `agent-launch.json` in workspace contains "claude"

## 3. Codex-agent e2e test (mason-extensions repo)

- [x] 3.1 Create `agents/codex-agent/tests/e2e/artifacts.test.ts` with `copyFixtureWorkspace("codex-agent", { fixture: "claude-test-project" })` setup
- [x] 3.2 Add test: run `mason run --role writer --agent codex --source claude -p "what is 2+2"` then verify codex prompt at home `.codex/prompts/take-notes.md` contains "take-notes"
- [x] 3.3 Add test: verify `AGENTS.md` contains "/prompts:take-notes" and ".agents/skills/markdown-conventions/"
- [x] 3.4 Add test: verify skill at `.agents/skills/markdown-conventions/SKILL.md` contains "Markdown Conventions"
- [x] 3.5 Add test: verify MCP config at home `.codex/config.toml` contains "mcp_servers" and "bearer_token_env_var"
- [x] 3.6 Add test: verify `agent-launch.json` in workspace contains "codex"

## 4. Pi-coding-agent e2e test (mason-extensions repo)

- [x] 4.1 Create `agents/pi-coding-agent/tests/e2e/artifacts.test.ts` with `copyFixtureWorkspace("pi-coding-agent", { fixture: "claude-test-project" })` setup and LLM config in `.mason/config.json`
- [x] 4.2 Add test: run `mason run --role writer --agent pi --source claude --build -p "what is 2+2"` then verify `registerCommand("take-notes"` in `.pi/extensions/mason-mcp/index.ts`
- [x] 4.3 Add test: verify `registerTool(` present in `.pi/extensions/mason-mcp/index.ts`
- [x] 4.4 Add test: verify `.pi/extensions/mason-mcp/package.json` contains "mason-mcp"
- [x] 4.5 Add test: verify skill at `skills/markdown-conventions/SKILL.md` contains "Markdown Conventions"
- [x] 4.6 Add test: verify `.pi/mcp.json` contains "mcpServers" and "mason"
- [x] 4.7 Add test: verify `.pi/settings.json` exists
- [x] 4.8 Add test: verify `.pi/APPEND_SYSTEM.md` contains "note-taking assistant" (role instructions)
- [x] 4.9 Add test: verify `agent-launch.json` in workspace contains "pi"

## 5. Verification

- [x] 5.1 Run `npx tsc --noEmit` in mason repo to verify helper compiles
- [x] 5.2 Run `npx tsc --noEmit` in mason-extensions repo to verify test files compile
- [ ] 5.3 Run artifact e2e tests locally with Docker for at least one agent to confirm pass
