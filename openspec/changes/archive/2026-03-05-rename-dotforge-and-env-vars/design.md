## Context

The chapter-members PRD requires renaming workspace directories (`.forge/` -> `.chapter/`), global data directories (`~/.forge/` -> `~/.chapter/`), and all `FORGE_*` environment variables to `CHAPTER_*` (REQ-002, REQ-009, REQ-010). This is Change #3 in the implementation plan, building on the metadata field rename (Change #1) and npm package/directory rename (Change #2).

The codebase currently uses `.forge/` for workspace config directories, `FORGE_*` environment variables in Docker Compose generation and env templates, `ForgeProxyServer` as the proxy class name, and `forge.lock.json` / `forge.db` as file names.

## Goals / Non-Goals

**Goals:**
- Rename `.forge/` to `.chapter/` in init, install, and docker-utils commands
- Rename `~/.forge/data/forge.db` to `~/.chapter/data/chapter.db` as the default proxy database path
- Rename `FORGE_DB_PATH` to `CHAPTER_DB_PATH` environment variable
- Rename `FORGE_PROXY_TOKEN` to `CHAPTER_PROXY_TOKEN` in env templates, Docker Compose, and materializer
- Rename `FORGE_PROXY_PORT` to `CHAPTER_PROXY_PORT` in env and Docker Compose
- Rename `FORGE_ROLES` to `CHAPTER_ROLES` in claude-code materializer
- Rename `ForgeProxyServer` class and config interface to `ChapterProxyServer`
- Rename MCP server name from `"forge"` to `"chapter"`
- Rename Docker network from `agent-net` to `chapter-net`
- Rename `forge.lock.json` to `chapter.lock.json`
- Rename `forge.config.json` reference to `chapter.config.json` (in compose/types.ts comment)
- Update `.mcp.json` server key from `"forge"` to `"chapter"`
- Update `.claude/settings.json` permissions from `mcp__forge__*` to `mcp__chapter__*`
- Rename test file `tests/integration/forge-proxy.test.ts` to `tests/integration/chapter-proxy.test.ts`
- Update all test files referencing old names
- All tests pass, TypeScript compiles, linter passes

**Non-Goals:**
- Renaming the `agent` package type to `member` -- that is Change #5
- Per-member directory structure under `.chapter/members/` -- that is Change #6
- Renaming CLI help text and user-facing strings -- that is Change #4
- Any backward compatibility for `.forge/` or `FORGE_*` names

## Decisions

**1. Mechanical rename of environment variables**
- All `FORGE_*` variables become `CHAPTER_*` consistently
- `FORGE_PROXY_TOKEN` -> `CHAPTER_PROXY_TOKEN`
- `FORGE_PROXY_PORT` -> `CHAPTER_PROXY_PORT`
- `FORGE_DB_PATH` -> `CHAPTER_DB_PATH`
- `FORGE_ROLES` -> `CHAPTER_ROLES`
- Rationale: Consistent prefix matching the product name.

**2. Class rename: ForgeProxyServer -> ChapterProxyServer**
- Both the class and its config interface are renamed
- `ForgeProxyServerConfig` -> `ChapterProxyServerConfig`
- All imports and usages updated
- Rationale: The class name should match the product name.

**3. MCP server name and related identifiers**
- MCP server `{ name: "forge" }` -> `{ name: "chapter" }`
- `.mcp.json` server key `"forge"` -> `"chapter"`
- `.claude/settings.json` `mcp__forge__*` -> `mcp__chapter__*`
- Rationale: MCP server name is visible to clients and should match branding.

**4. Docker network rename**
- `agent-net` -> `chapter-net`
- Rationale: The network name should reflect the chapter terminology, not agent.

**5. Lock file rename**
- `forge.lock.json` -> `chapter.lock.json`
- Updated in `install.ts` (write), `build.ts` (write), `lock.ts` (JSDoc comment), `types.ts` (JSDoc comment)
- Rationale: File name should match product name.

**6. Database path rename**
- Default path: `~/.forge/data/forge.db` -> `~/.chapter/data/chapter.db`
- Env var: `FORGE_DB_PATH` -> `CHAPTER_DB_PATH`
- Inside Docker container, the path remains `/home/node/data/chapter.db` (filename updated)
- Rationale: Consistent naming across all file paths.

## Risks / Trade-offs

- [Risk: Missed references] -> Mitigated by grepping for `FORGE_`, `\.forge`, `ForgeProxy`, `agent-net`, `forge.lock`, `forge.db`, `forge.config` after all changes and verifying zero results in source/test code
- [Risk: Docker Compose env var breakage] -> The env template and docker-compose generation must stay in sync. Both are updated as part of the same change.
- [Risk: MCP client configuration] -> The `.mcp.json` server key and settings permissions pattern must match. Both are updated together in the materializer.
