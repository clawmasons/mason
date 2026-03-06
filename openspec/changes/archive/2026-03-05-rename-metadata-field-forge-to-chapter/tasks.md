## 1. Rename Schema Files and Exports

- [x] 1.1 Rename `src/schemas/forge-field.ts` to `src/schemas/chapter-field.ts`
- [x] 1.2 Rename `tests/schemas/forge-field.test.ts` to `tests/schemas/chapter-field.test.ts`
- [x] 1.3 Rename exports in `src/schemas/app.ts`: `appForgeFieldSchema` -> `appChapterFieldSchema`, `AppForgeField` -> `AppChapterField`
- [x] 1.4 Rename exports in `src/schemas/skill.ts`: `skillForgeFieldSchema` -> `skillChapterFieldSchema`, `SkillForgeField` -> `SkillChapterField`
- [x] 1.5 Rename exports in `src/schemas/task.ts`: `taskForgeFieldSchema` -> `taskChapterFieldSchema`, `TaskForgeField` -> `TaskChapterField`
- [x] 1.6 Rename exports in `src/schemas/role.ts`: `roleForgeFieldSchema` -> `roleChapterFieldSchema`, `RoleForgeField` -> `RoleChapterField`
- [x] 1.7 Rename exports in `src/schemas/agent.ts`: `agentForgeFieldSchema` -> `agentChapterFieldSchema`, `AgentForgeField` -> `AgentChapterField`
- [x] 1.8 Rename in `src/schemas/chapter-field.ts` (formerly forge-field.ts): `ForgeField` -> `ChapterField`, `parseForgeField()` -> `parseChapterField()`, update all internal references
- [x] 1.9 Update `src/schemas/index.ts` re-exports

## 2. Update Resolver Types and Code

- [x] 2.1 Update `src/resolver/types.ts`: `DiscoveredPackage.forgeField` -> `DiscoveredPackage.chapterField`
- [x] 2.2 Update `src/resolver/discover.ts`: `pkgJson.forge` -> `pkgJson.chapter`, `forgeField` -> `chapterField`
- [x] 2.3 Update `src/resolver/resolve.ts`: all `forgeField` and `ForgeField` type references
- [x] 2.4 Update `src/resolver/errors.ts`: `InvalidForgeFieldError` -> `InvalidChapterFieldError`
- [x] 2.5 Update `src/resolver/index.ts`: re-exports

## 3. Update CLI Commands

- [x] 3.1 Update `src/cli/commands/add.ts`: `pkgJson.forge` -> `pkgJson.chapter`, error messages
- [x] 3.2 Update `src/cli/commands/list.ts`: `forgeField` references
- [x] 3.3 Update `src/cli/commands/remove.ts`: `forgeField` references
- [x] 3.4 Update `src/cli/commands/install.ts`: `forgeField` references
- [x] 3.5 Update `src/cli/commands/proxy.ts`: `forgeField` references, `ForgeProxyServer` import (name stays for now -- Change #3)

## 4. Update Top-Level Exports

- [x] 4.1 Update `src/index.ts`: all re-exported schema names and types

## 5. Update Component package.json Files

- [x] 5.1 Update `forge-core/apps/filesystem/package.json`: `"forge"` -> `"chapter"`
- [x] 5.2 Update `forge-core/tasks/take-notes/package.json`: `"forge"` -> `"chapter"`
- [x] 5.3 Update `forge-core/skills/markdown-conventions/package.json`: `"forge"` -> `"chapter"`
- [x] 5.4 Update `forge-core/roles/writer/package.json`: `"forge"` -> `"chapter"`
- [x] 5.5 Update `forge-core/agents/note-taker/package.json`: `"forge"` -> `"chapter"`
- [x] 5.6 Update `templates/note-taker/agents/note-taker/package.json`: `"forge"` -> `"chapter"`
- [x] 5.7 Update `templates/note-taker/roles/writer/package.json`: `"forge"` -> `"chapter"`

## 6. Update Tests

- [x] 6.1 Update `tests/schemas/chapter-field.test.ts`: import path, function name
- [x] 6.2 Update `tests/schemas/app.test.ts`: schema name
- [x] 6.3 Update `tests/schemas/skill.test.ts`: schema name
- [x] 6.4 Update `tests/schemas/task.test.ts`: schema name
- [x] 6.5 Update `tests/schemas/role.test.ts`: schema name
- [x] 6.6 Update `tests/schemas/agent.test.ts`: schema name
- [x] 6.7 Update `tests/resolver/discover.test.ts`: `forge` -> `chapter` in package.json fixtures, `forgeField` -> `chapterField`
- [x] 6.8 Update `tests/resolver/resolve.test.ts`: `ForgeField` type, `forgeField` property
- [x] 6.9 Update `tests/cli/proxy.test.ts`: `forgeField` property, `ForgeProxyServer` mock

## 7. Verification

- [x] 7.1 `npx tsc --noEmit` compiles cleanly
- [x] 7.2 `npx eslint src/ tests/` passes
- [x] 7.3 `npx vitest run` -- all tests pass
- [x] 7.4 Grep for remaining `ForgeField`, `parseForgeField`, `forgeField`, `pkgJson.forge` -- zero results in source/test code
