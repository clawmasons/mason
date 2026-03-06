## Why

The `chapter-members` PRD (REQ-002, REQ-009, REQ-010) requires renaming the workspace config directory from `.forge/` to `.chapter/`, the global data directory from `~/.forge/` to `~/.chapter/`, and all `FORGE_*` environment variables to `CHAPTER_*`. This is Change #3 in the implementation plan -- building on the metadata field rename (Change #1) and the npm package/directory rename (Change #2).

The current codebase still uses `.forge/` for workspace scaffolding, `~/.forge/data/forge.db` for the proxy database, `FORGE_*` environment variables in Docker Compose and env templates, and `ForgeProxyServer` as the proxy class name.

## What Changes

- **BREAKING**: `.forge/` directory renamed to `.chapter/` in `init.ts`, `install.ts`, `docker-utils.ts`
- **BREAKING**: `~/.forge/data/forge.db` renamed to `~/.chapter/data/chapter.db` in `db.ts`
- **BREAKING**: All `FORGE_*` env vars renamed to `CHAPTER_*` (`FORGE_PROXY_TOKEN` -> `CHAPTER_PROXY_TOKEN`, `FORGE_PROXY_PORT` -> `CHAPTER_PROXY_PORT`, `FORGE_DB_PATH` -> `CHAPTER_DB_PATH`, `FORGE_ROLES` -> `CHAPTER_ROLES`)
- `ForgeProxyServer` class renamed to `ChapterProxyServer`
- MCP server name `"forge"` renamed to `"chapter"`
- Docker network `agent-net` renamed to `chapter-net`
- `forge.lock.json` renamed to `chapter.lock.json`
- `.claude/settings.json` permissions pattern `mcp__forge__*` renamed to `mcp__chapter__*`
- `.mcp.json` server key `"forge"` renamed to `"chapter"`
- Test file `tests/integration/forge-proxy.test.ts` renamed to `tests/integration/chapter-proxy.test.ts`

## Capabilities

### Modified Capabilities
- `workspace-init`: Creates `.chapter/` directory instead of `.forge/`
- `docker-install-pipeline`: Scaffolds to `.chapter/agents/` path, writes `chapter.lock.json`
- `docker-compose-generation`: Uses `CHAPTER_*` env vars and `chapter-net` network
- `env-generation`: Generates `CHAPTER_PROXY_TOKEN` and `CHAPTER_PROXY_PORT`
- `claude-code-materializer`: References `CHAPTER_PROXY_TOKEN`, `CHAPTER_ROLES`, `mcp__chapter__*`
- `proxy-server`: Class renamed to `ChapterProxyServer`, MCP server name `"chapter"`
- `sqlite-database`: Default path `~/.chapter/data/chapter.db`, env var `CHAPTER_DB_PATH`
- `lock-file-generation`: Output filename `chapter.lock.json`
- `cli-framework`: Build command references `chapter.lock.json`

## Impact

- **CLI commands**: `src/cli/commands/init.ts`, `install.ts`, `build.ts`, `run.ts`, `stop.ts`, `proxy.ts`, `docker-utils.ts`
- **Proxy**: `src/proxy/server.ts`, `src/proxy/db.ts`
- **Compose**: `src/compose/docker-compose.ts`, `src/compose/env.ts`, `src/compose/lock.ts`, `src/compose/types.ts`
- **Materializer**: `src/materializer/claude-code.ts`
- **Tests**: ~15 test files with `FORGE_*`, `.forge`, `ForgeProxyServer` references
