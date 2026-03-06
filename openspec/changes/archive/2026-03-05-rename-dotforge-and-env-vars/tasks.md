## 1. Rename `.forge/` to `.chapter/` in CLI Commands

- [ ] 1.1 Update `src/cli/commands/init.ts`: `WORKSPACE_DIRS` array `.forge` -> `.chapter`, all `.forge/` path references -> `.chapter/`, `forgeDir` variable -> `chapterDir`, `getForgeProjectRoot()` -> `getChapterProjectRoot()`
- [ ] 1.2 Update `src/cli/commands/init.ts`: `.gitignore` content `.forge/.env` -> `.chapter/.env`
- [ ] 1.3 Update `src/cli/commands/docker-utils.ts`: `.forge/agents/` -> `.chapter/agents/` path, JSDoc comment
- [ ] 1.4 Update `src/cli/commands/install.ts`: `.forge/agents/` -> `.chapter/agents/` path, `FORGE_PROXY_TOKEN` -> `CHAPTER_PROXY_TOKEN` in env content replace
- [ ] 1.5 Update `src/cli/commands/install.ts`: `forge.lock.json` -> `chapter.lock.json`

## 2. Rename Environment Variables

- [ ] 2.1 Update `src/compose/env.ts`: `FORGE_PROXY_TOKEN` -> `CHAPTER_PROXY_TOKEN`, `FORGE_PROXY_PORT` -> `CHAPTER_PROXY_PORT`, JSDoc comment
- [ ] 2.2 Update `src/compose/docker-compose.ts`: `FORGE_PROXY_PORT` -> `CHAPTER_PROXY_PORT`, `FORGE_DB_PATH` -> `CHAPTER_DB_PATH`, `FORGE_PROXY_TOKEN` -> `CHAPTER_PROXY_TOKEN`, `forge.db` -> `chapter.db`, `agent-net` -> `chapter-net`
- [ ] 2.3 Update `src/materializer/claude-code.ts`: `FORGE_PROXY_TOKEN` -> `CHAPTER_PROXY_TOKEN`, `FORGE_ROLES` -> `CHAPTER_ROLES`, `agent-net` -> `chapter-net`, MCP server key `"forge"` -> `"chapter"`, `mcp__forge__*` -> `mcp__chapter__*`

## 3. Rename Proxy Server Class and Config

- [ ] 3.1 Update `src/proxy/server.ts`: `ForgeProxyServer` -> `ChapterProxyServer`, `ForgeProxyServerConfig` -> `ChapterProxyServerConfig`, MCP server name `"forge"` -> `"chapter"`
- [ ] 3.2 Update `src/cli/commands/proxy.ts`: `ForgeProxyServer` import and usage -> `ChapterProxyServer`

## 4. Rename Database Path

- [ ] 4.1 Update `src/proxy/db.ts`: `FORGE_DB_PATH` -> `CHAPTER_DB_PATH`, `~/.forge/data/forge.db` -> `~/.chapter/data/chapter.db`

## 5. Rename Lock File and Types

- [ ] 5.1 Update `src/cli/commands/build.ts`: `forge.lock.json` -> `chapter.lock.json` in description and output path
- [ ] 5.2 Update `src/compose/lock.ts`: JSDoc comment `forge.lock.json` -> `chapter.lock.json`
- [ ] 5.3 Update `src/compose/types.ts`: JSDoc comment `forge.lock.json` -> `chapter.lock.json`

## 6. Update Tests

- [ ] 6.1 Rename `tests/integration/forge-proxy.test.ts` -> `tests/integration/chapter-proxy.test.ts`
- [ ] 6.2 Update `tests/integration/chapter-proxy.test.ts`: `ForgeProxyServer` -> `ChapterProxyServer`, `ForgeProxyServerConfig` -> `ChapterProxyServerConfig`
- [ ] 6.3 Update `tests/cli/init.test.ts`: `.forge` -> `.chapter` in all path references and assertions
- [ ] 6.4 Update `tests/cli/install.test.ts`: `.forge` -> `.chapter` paths, `FORGE_PROXY_TOKEN` -> `CHAPTER_PROXY_TOKEN`, `forge.lock.json` -> `chapter.lock.json`
- [ ] 6.5 Update `tests/cli/build.test.ts`: `forge.lock.json` -> `chapter.lock.json`
- [ ] 6.6 Update `tests/cli/docker-utils.test.ts`: `.forge/agents/` -> `.chapter/agents/`
- [ ] 6.7 Update `tests/cli/proxy.test.ts`: `ForgeProxyServer` -> `ChapterProxyServer`
- [ ] 6.8 Update `tests/cli/run.test.ts`: `.forge/agents/` -> `.chapter/agents/`
- [ ] 6.9 Update `tests/cli/stop.test.ts`: `.forge/agents/` -> `.chapter/agents/`
- [ ] 6.10 Update `tests/compose/docker-compose.test.ts`: `FORGE_*` -> `CHAPTER_*`, `agent-net` -> `chapter-net`, `forge.db` -> `chapter.db`
- [ ] 6.11 Update `tests/compose/env.test.ts`: `FORGE_*` -> `CHAPTER_*`
- [ ] 6.12 Update `tests/proxy/server.test.ts`: `ForgeProxyServer` -> `ChapterProxyServer`, MCP server name assertions
- [ ] 6.13 Update `tests/proxy/db.test.ts`: `FORGE_DB_PATH` -> `CHAPTER_DB_PATH` if referenced
- [ ] 6.14 Update `tests/materializer/claude-code.test.ts`: `FORGE_*` -> `CHAPTER_*`, `agent-net` -> `chapter-net`, `mcp__forge__*` -> `mcp__chapter__*`, MCP server key assertions
- [ ] 6.15 Update `tests/integration/install-flow.test.ts`: `.forge` -> `.chapter`, `FORGE_*` -> `CHAPTER_*`, `forge.lock.json` -> `chapter.lock.json`

## 7. Verification

- [ ] 7.1 `npx tsc --noEmit` compiles cleanly
- [ ] 7.2 `npx eslint src/ tests/` passes
- [ ] 7.3 `npx vitest run` -- all tests pass
- [ ] 7.4 Grep for remaining `FORGE_` in source/test code -- zero results
- [ ] 7.5 Grep for remaining `\.forge[/"]` in source/test code -- zero results
- [ ] 7.6 Grep for remaining `ForgeProxy` in source/test code -- zero results
- [ ] 7.7 Grep for remaining `agent-net` in source/test code -- zero results
- [ ] 7.8 Grep for remaining `forge.lock` in source/test code -- zero results
- [ ] 7.9 Grep for remaining `forge.db` in source/test code -- zero results
