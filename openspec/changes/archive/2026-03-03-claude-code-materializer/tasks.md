## 1. Types & Interface

- [x] 1.1 Create `src/materializer/types.ts` with `RuntimeMaterializer` interface, `MaterializationResult` type alias, and `ComposeServiceDef` interface
- [x] 1.2 Create `src/materializer/index.ts` exporting types and the Claude Code materializer

## 2. Claude Code Materializer Implementation

- [x] 2.1 Create `src/materializer/claude-code.ts` implementing the `RuntimeMaterializer` interface
- [x] 2.2 Implement `materializeWorkspace()` — generates settings.json, slash commands, AGENTS.md, and skills directory manifest
- [x] 2.3 Implement `generateDockerfile()` — returns Dockerfile string for Claude Code runtime container
- [x] 2.4 Implement `generateComposeService()` — returns ComposeServiceDef for docker-compose

## 3. Public API

- [x] 3.1 Update `src/index.ts` to re-export materializer types and Claude Code materializer

## 4. Tests

- [x] 4.1 Create `tests/materializer/claude-code.test.ts` with tests for settings.json generation (SSE default, custom port, streamable-http, auth header)
- [x] 4.2 Add tests for slash command generation (single-role task, skill references, task short name)
- [x] 4.3 Add tests for AGENTS.md generation (multi-role agent, constraints)
- [x] 4.4 Add tests for skills directory manifest generation
- [x] 4.5 Add tests for Dockerfile generation
- [x] 4.6 Add tests for ComposeServiceDef generation
