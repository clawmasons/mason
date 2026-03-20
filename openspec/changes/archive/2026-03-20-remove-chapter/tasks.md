## 1. Add CLI name constants to shared

- [x] 1.1 Create `packages/shared/src/constants.ts` with `CLI_NAME_LOWERCASE`, `CLI_NAME_DISPLAY`, `CLI_NAME_UPPERCASE` exports
- [x] 1.2 Re-export constants from `packages/shared/src/index.ts`
- [x] 1.3 Verify `npx tsc --noEmit` passes for packages/shared

## 2. Rename types and schemas in packages/shared

- [x] 2.1 Rename `chapter-field.ts` → `field.ts` via `git mv`
- [x] 2.2 Rename types: `AppChapterField` → `AppField`, `SkillChapterField` → `SkillField`, `TaskChapterField` → `TaskField`, `RoleChapterField` → `RoleField`, `ChapterField` → `Field` in schema source files (`app.ts`, `skill.ts`, `task.ts`, `role.ts`, `field.ts`)
- [x] 2.3 Rename schemas: `appChapterFieldSchema` → `appFieldSchema`, `skillChapterFieldSchema` → `skillFieldSchema`, `taskChapterFieldSchema` → `taskFieldSchema`, `roleChapterFieldSchema` → `roleFieldSchema`
- [x] 2.4 Rename `parseChapterField()` → `parseField()` in `field.ts`
- [x] 2.5 Update `packages/shared/src/schemas/index.ts` to re-export new names
- [x] 2.6 Update `packages/shared/src/index.ts` to re-export new names
- [x] 2.7 Rename `DiscoveredPackage.chapterField` → `field` in `packages/shared/src/types.ts` and update JSDoc
- [x] 2.8 Verify `npx tsc --noEmit` passes for packages/shared

## 3. Update packages/cli to use new types and field name

- [x] 3.1 Update `packages/cli/src/resolver/discover.ts`: import `parseField`/`Field`, read `pkg[CLI_NAME_LOWERCASE]` instead of `pkg.chapter`, use `.field` instead of `.chapterField`
- [x] 3.2 Rename `InvalidChapterFieldError` → `InvalidFieldError` in `packages/cli/src/resolver/errors.ts`, update error message text, and update comment on `TypeMismatchError`
- [x] 3.3 Update `packages/cli/src/resolver/index.ts` and `packages/cli/src/index.ts` to export `InvalidFieldError`
- [x] 3.4 Update all other CLI source files importing old type/function names (resolver, materializer, commands)
- [x] 3.5 Verify `npx tsc --noEmit` passes for packages/cli

## 4. Update packages/proxy class and env var names

- [x] 4.1 Rename `ChapterProxyServer` → `ProxyServer` and `ChapterProxyServerConfig` → `ProxyServerConfig` in `packages/proxy/src/server.ts`
- [x] 4.2 Update MCP server name from `"chapter"` to use `CLI_NAME_LOWERCASE` in `server.ts`
- [x] 4.3 Update `CHAPTER_DB_PATH` → `` `${CLI_NAME_UPPERCASE}_DB_PATH` `` and default path to `` `~/.${CLI_NAME_LOWERCASE}/data/${CLI_NAME_LOWERCASE}.db` `` in `packages/proxy/src/db.ts`
- [x] 4.4 Update `packages/proxy/src/index.ts` to export `ProxyServer` instead of `ChapterProxyServer`
- [x] 4.5 Update all proxy source files importing old names
- [x] 4.6 Verify `npx tsc --noEmit` passes for packages/proxy

## 5. Update environment variables across packages

- [x] 5.1 Update `CHAPTER_PROXY_TOKEN` → `` `${CLI_NAME_UPPERCASE}_PROXY_TOKEN` `` in `packages/cli/src/acp/session.ts`, `packages/cli/src/cli/commands/proxy.ts`, `packages/cli/src/materializer/docker-generator.ts`
- [x] 5.2 Update `CHAPTER_SESSION_TYPE` → `` `${CLI_NAME_UPPERCASE}_SESSION_TYPE` `` in `packages/cli/src/acp/session.ts`
- [x] 5.3 Update `CHAPTER_ACP_CLIENT` → `` `${CLI_NAME_UPPERCASE}_ACP_CLIENT` `` in `packages/cli/src/acp/session.ts`
- [x] 5.4 Update `CHAPTER_DECLARED_CREDENTIALS` → `` `${CLI_NAME_UPPERCASE}_DECLARED_CREDENTIALS` `` in `packages/cli/src/acp/session.ts`
- [x] 5.5 Update env var references in `packages/cli/src/materializer/proxy-dependencies.ts`
- [x] 5.6 Update env generation to use `MASON_PROXY_TOKEN` and `MASON_PROXY_PORT` in env template output

## 6. Update MCP server config key in materializers

- [x] 6.1 Update `packages/mcp-agent/src/materializer.ts`: change `chapter:` key to `[CLI_NAME_LOWERCASE]:` (computed property)
- [x] 6.2 Update `packages/claude-code-agent/src/materializer.ts`: change `chapter:` key to `[CLI_NAME_LOWERCASE]:`
- [x] 6.3 Update `packages/pi-coding-agent/src/materializer.ts`: change `chapter:` key to `[CLI_NAME_LOWERCASE]:`
- [x] 6.4 Update `packages/cli/src/acp/rewriter.ts`: change `chapter:` key to `[CLI_NAME_LOWERCASE]:`
- [x] 6.5 Update `packages/cli/src/materializer/proxy-dependencies.ts`: change `chapter` references to `CLI_NAME_LOWERCASE`

## 7. Update role discovery and package reader in shared

- [x] 7.1 Update `packages/shared/src/role/package-reader.ts`: change `chapter.type`, `chapter.dialect` references to use `CLI_NAME_LOWERCASE` field name
- [x] 7.2 Update `packages/shared/src/role/discovery.ts`: change `pkg.chapter?.type` to `pkg[CLI_NAME_LOWERCASE]?.type`

## 8. Update credential service

- [x] 8.1 Update `packages/credential-service/src/audit.ts`: change default DB path from `~/.chapter/data/chapter.db` to use `CLI_NAME_LOWERCASE`
- [x] 8.2 Update `packages/credential-service/src/schemas.ts`: update any comment references to `chapter.db`

## 9. Update materializer ACP config paths

- [x] 9.1 Update `.chapter/acp.json` references to `.${CLI_NAME_LOWERCASE}/acp.json` in all materializer workspace generation code

## 10. Update package.json metadata fields

- [x] 10.1 Update all `"chapter": { ... }` fields to `"mason": { ... }` in template package.json files — N/A (templates/ directory doesn't exist)
- [x] 10.2 Update `"chapter"` key references in any workspace package.json files within the monorepo (apps, tasks, skills, roles, members)
- [x] 10.3 Update package.json `description` fields that reference "chapter" to use "mason" or generic terms

## 11. Update comments, logs, and documentation

- [x] 11.1 Update JSDoc comments referencing "chapter" in packages/shared, packages/cli, packages/proxy
- [x] 11.2 Update `docs/security.md`, `docs/development.md`, `docs/component-mcp-proxy.md` and all other docs to remove "chapter" references
- [x] 11.3 Update log prefixes from `[chapter]` to `[mason]` in proxy hooks

## 12. Rename test files and update test fixtures

- [x] 12.1 `git mv` `packages/cli/tests/schemas/chapter-field.test.ts` → `field.test.ts`
- [x] 12.2 `git mv` `packages/proxy/tests/integration-chapter-proxy.test.ts` → `integration-proxy.test.ts`
- [x] 12.3 Update all test files importing `ChapterField`, `parseChapterField`, `ChapterProxyServer`, etc. to use new names
- [x] 12.4 Update test mock objects using `chapter: { type: "..." }` to `mason: { type: "..." }` across all packages
- [x] 12.5 Update materializer test assertions checking for `mcpServers.chapter` to check `mcpServers.mason`
- [x] 12.6 E2E setup/teardown scripts already named `setup.ts`/`teardown.ts`
- [x] 12.7 Update `packages/tests/package.json` scripts verified correct
- [x] 12.8 Update E2E test assertions referencing `.chapter/` paths or `chapter` CLI invocations

## 13. Update proxy test script

- [x] 13.1 Update `packages/proxy/tests/mcp-proxy.sh`: change `CHAPTER_PROXY_TOKEN` to `MASON_PROXY_TOKEN`

## 14. Clean build and verify

- [x] 14.1 Clean dist directories
- [x] 14.2 Run `npx tsc --noEmit` — 1 pre-existing error only (unrelated to our changes)
- [x] 14.3 Linting verified
- [x] 14.4 All unit tests pass: shared 198/198, cli 642/642, proxy 224/224, mcp-agent 48/48, claude-code-agent 52/52, pi-coding-agent 41/41, credential-service 54/54
- [x] 14.5 Zero "chapter" references remaining in source code, tests, and docs (only openspec archive and package-lock.json)
