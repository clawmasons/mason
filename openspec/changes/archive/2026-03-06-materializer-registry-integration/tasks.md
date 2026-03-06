## 1. Register pi materializer in install command

- [x] 1.1 Import `piCodingAgentMaterializer` from `../../materializer/pi-coding-agent.js` in `src/cli/commands/install.ts`
- [x] 1.2 Add `["pi-coding-agent", piCodingAgentMaterializer]` entry to the `materializerRegistry` Map

## 2. Add pi-coding-agent install tests

- [x] 2.1 Add `setupPiMember()` helper that creates fixture packages with a pi-coding-agent member (runtimes: ["pi-coding-agent"], llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" })
- [x] 2.2 Test: pi member installs successfully (no exit(1))
- [x] 2.3 Test: pi workspace files exist (pi-coding-agent/Dockerfile, pi-coding-agent/workspace/AGENTS.md, pi-coding-agent/workspace/.pi/settings.json)
- [x] 2.4 Test: pi workspace contains extension files (.pi/extensions/chapter-mcp/index.ts, .pi/extensions/chapter-mcp/package.json)
- [x] 2.5 Test: .env includes OPENROUTER_API_KEY for openrouter LLM provider
- [x] 2.6 Test: docker-compose.yml includes pi-coding-agent service
- [x] 2.7 Test: pi member does NOT generate .claude.json or .claude/ directory
- [x] 2.8 Test: multi-runtime member (claude-code + pi-coding-agent) generates both workspaces
- [x] 2.9 Test: pi member bakes proxy token into extension index.ts
- [x] 2.10 Test: .pi/settings.json has correct model ID
- [x] 2.11 Test: prints pi-coding-agent in success summary
- [x] 2.12 Test: multi-runtime docker-compose includes both services
- [x] 2.13 Test: multi-runtime creates .claude/ for claude-code but not pi-coding-agent

## 3. Verify

- [x] 3.1 `npx tsc --noEmit` passes
- [x] 3.2 `npx eslint src/ tests/` passes
- [x] 3.3 `npx vitest run` passes -- 733 tests, 41 test files, 0 failures
