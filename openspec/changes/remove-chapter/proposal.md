## Why

The codebase uses "chapter" as the internal name for package metadata fields, types, schemas, file paths, database paths, and environment variables. The project is called "mason" and the CLI binary is `mason` — the internal naming should match. Additionally, the CLI name may change in the future, so hardcoding any name deep into the type system is fragile. This change removes "chapter" references entirely, replacing them with generic names (e.g., `Field` not `MasonField`) and centralizing the CLI name into shared constants (`CLI_NAME_LOWERCASE`, `CLI_NAME_DISPLAY`, `CLI_NAME_UPPERCASE`) for runtime paths, env vars, logs, and user-facing strings.

## What Changes

### Shared CLI name constants (**NEW**)
- Add `CLI_NAME_LOWERCASE` (`"mason"`), `CLI_NAME_DISPLAY` (`"Mason"`), `CLI_NAME_UPPERCASE` (`"MASON"`) to `packages/shared`
- All packages import these constants instead of hardcoding any product name in paths, env vars, or logs

### Types and schemas rename (**BREAKING**)
- `ChapterField` → `Field`
- `AppChapterField` → `AppField`
- `SkillChapterField` → `SkillField`
- `TaskChapterField` → `TaskField`
- `RoleChapterField` → `RoleField`
- `appChapterFieldSchema` → `appFieldSchema`
- `skillChapterFieldSchema` → `skillFieldSchema`
- `taskChapterFieldSchema` → `taskFieldSchema`
- `roleChapterFieldSchema` → `roleFieldSchema`
- `parseChapterField()` → `parseField()`
- `InvalidChapterFieldError` → `InvalidFieldError`
- `ChapterProxyServer` → `ProxyServer`
- `ChapterProxyServerConfig` → `ProxyServerConfig`

### File renames (**BREAKING**)
- `packages/shared/src/schemas/chapter-field.ts` → `field.ts`
- `packages/cli/tests/schemas/chapter-field.test.ts` → `field.test.ts`
- `packages/proxy/tests/integration-chapter-proxy.test.ts` → `integration-proxy.test.ts`

### Package.json `"chapter"` field → `CLI_NAME_LOWERCASE` (**BREAKING**)
- The metadata field in all package.json files currently named `"chapter"` changes to the CLI name (currently `"mason"`)
- Discovery, validation, and all code reading this field must use the constant

### Runtime paths (**BREAKING**)
- `.chapter/` → `.${CLI_NAME_LOWERCASE}/` (workspace config directory)
- `~/.chapter/data/chapter.db` → `~/.${CLI_NAME_LOWERCASE}/data/${CLI_NAME_LOWERCASE}.db`

### Environment variables (**BREAKING**)
- `CHAPTER_DB_PATH` → `${CLI_NAME_UPPERCASE}_DB_PATH`
- `CHAPTER_PROXY_TOKEN` → `${CLI_NAME_UPPERCASE}_PROXY_TOKEN`
- `CHAPTER_SESSION_TYPE` → `${CLI_NAME_UPPERCASE}_SESSION_TYPE`
- `CHAPTER_ACP_CLIENT` → `${CLI_NAME_UPPERCASE}_ACP_CLIENT`
- `CHAPTER_DECLARED_CREDENTIALS` → `${CLI_NAME_UPPERCASE}_DECLARED_CREDENTIALS`

### MCP server config key
- The hardcoded `"chapter"` key in materializer MCP server configs → `CLI_NAME_LOWERCASE`

### DiscoveredPackage type
- `chapterField: ChapterField` property → `field: Field`

### Comments, logs, and docs
- All `[chapter]` log prefixes → `[${CLI_NAME_LOWERCASE}]`
- All doc references to "chapter" updated to use the product name or generic terms
- JSDoc comments updated

### Test fixtures
- All test mocks using `chapter: { type: "..." }` updated to use the new field name
- E2E setup/teardown scripts renamed: `setup-chapter.ts` → `setup.ts`, `teardown-chapter.ts` → `teardown.ts`

## Capabilities

### New Capabilities
- `cli-name-constants`: Shared constants (`CLI_NAME_LOWERCASE`, `CLI_NAME_DISPLAY`, `CLI_NAME_UPPERCASE`) that all packages use for runtime paths, env vars, log prefixes, and user-facing strings

### Modified Capabilities
- `package-schema-validation`: The package.json metadata field name changes from `"chapter"` to the CLI name constant
- `package-discovery`: Discovery reads the new field name and uses `Field` types instead of `ChapterField`
- `proxy-server`: Class renames from `ChapterProxyServer` to `ProxyServer`, config interface renamed, env vars use constants
- `sqlite-database`: Default DB path changes from `~/.chapter/data/chapter.db` to `~/.${CLI_NAME_LOWERCASE}/data/${CLI_NAME_LOWERCASE}.db`, env var renamed
- `env-generation`: All `CHAPTER_*` env vars renamed to `${CLI_NAME_UPPERCASE}_*`
- `e2e-chapter-workflow`: All CLI invocations and path assertions change from `chapter` to the CLI name
- `acp-session`: Session env vars renamed from `CHAPTER_*` to `${CLI_NAME_UPPERCASE}_*`
- `materializer-interface`: MCP server config key changes from `"chapter"` to `CLI_NAME_LOWERCASE`
- `workspace-init`: `.chapter/` directory becomes `.${CLI_NAME_LOWERCASE}/`
- `role-core-type-system`: `chapter.type` and `chapter.dialect` field references in role validation change to the new field name
- `credential-service-package`: Audit logging DB path references updated

## Impact

- **All packages**: Every package in the monorepo touches "chapter" in some form — types, imports, env vars, or paths
- **Breaking for consumers**: Any external code reading the `"chapter"` field from package.json, using `ChapterField` types, or relying on `CHAPTER_*` env vars will break
- **Database migration**: Users with existing `~/.chapter/` directories need migration guidance (out of scope for this change — document only)
- **Docker/compose**: Generated Dockerfiles and compose files that reference `CHAPTER_*` env vars will change
- **OpenSpec specs**: Multiple spec files reference "chapter" and will need updates after this change lands
- **Dist artifacts**: Built output in `dist/` and `packages/*/dist/` will change — clean build required
