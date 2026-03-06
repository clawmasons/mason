## 1. Extract shared helpers into common.ts

- [x] 1.1 Create `src/materializer/common.ts`
- [x] 1.2 Move `formatPermittedTools()` from claude-code.ts to common.ts (export)
- [x] 1.3 Move `findRolesForTask()` from claude-code.ts to common.ts (export)
- [x] 1.4 Move `collectAllSkills()` from claude-code.ts to common.ts (export)
- [x] 1.5 Move `collectAllTasks()` from claude-code.ts to common.ts (export)
- [x] 1.6 Move `generateAgentsMd()` from claude-code.ts to common.ts (export)
- [x] 1.7 Move `generateSkillReadme()` from claude-code.ts to common.ts (export)

## 2. Update claude-code.ts to import from common.ts

- [x] 2.1 Replace local function definitions with imports from `./common.js`
- [x] 2.2 Verify claude-code tests still pass (no behavioral change) -- 56 tests pass

## 3. Implement pi-coding-agent materializer

- [x] 3.1 Create `src/materializer/pi-coding-agent.ts`
- [x] 3.2 Implement `materializeWorkspace()`:
  - [x] 3.2.1 Generate `AGENTS.md` using `generateAgentsMd()` from common
  - [x] 3.2.2 Generate `.pi/settings.json` with model ID from `member.llm`
  - [x] 3.2.3 Generate `.pi/extensions/chapter-mcp/package.json`
  - [x] 3.2.4 Generate `.pi/extensions/chapter-mcp/index.ts` with MCP server registration + task commands
  - [x] 3.2.5 Generate `skills/{name}/README.md` using `generateSkillReadme()` from common
- [x] 3.3 Implement `generateDockerfile()` (placeholder for CHANGE 4)
- [x] 3.4 Implement `generateComposeService()` (placeholder for CHANGE 4)

## 4. Export pi materializer

- [x] 4.1 Export `piCodingAgentMaterializer` from `src/materializer/index.ts`

## 5. Create tests

- [x] 5.1 Create `tests/materializer/pi-coding-agent.test.ts`
- [x] 5.2 Test: materializer name is "pi-coding-agent"
- [x] 5.3 Test: AGENTS.md is generated with correct content (reuses common helper)
- [x] 5.4 Test: `.pi/settings.json` contains correct model ID (`provider/model`)
- [x] 5.5 Test: `.pi/settings.json` throws when `member.llm` is undefined
- [x] 5.6 Test: extension `package.json` has correct structure
- [x] 5.7 Test: extension `index.ts` includes `registerMcpServer()` call
- [x] 5.8 Test: extension `index.ts` includes `registerCommand()` for each task
- [x] 5.9 Test: command prompt includes role context and permitted tools
- [x] 5.10 Test: command prompt includes skill references when task has skills
- [x] 5.11 Test: command prompt omits skills section when task has no skills
- [x] 5.12 Test: command prompt includes task prompt reference
- [x] 5.13 Test: skills directory has README for each unique skill
- [x] 5.14 Test: skills are deduplicated across roles
- [x] 5.15 Test: result contains all expected file keys
- [x] 5.16 Test: Dockerfile installs pi-coding-agent
- [x] 5.17 Test: Dockerfile uses pi command
- [x] 5.18 Test: ComposeService has correct structure
- [x] 5.19 Test: proxy defaults to SSE when no proxy type specified
- [x] 5.20 Test: proxy token baked into extension when provided

## 6. Verify

- [x] 6.1 `npx tsc --noEmit` passes
- [x] 6.2 `npx eslint src/ tests/` passes
- [x] 6.3 `npx vitest run` passes -- 697 tests, 41 test files, 0 failures
