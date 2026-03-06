## 1. Rename Directories and Files

- [x] 1.1 Rename `forge-core/` -> `chapter-core/` via `git mv`
- [x] 1.2 Rename `chapter-core/agents/` -> `chapter-core/members/` via `git mv`
- [x] 1.3 Rename `bin/forge.js` -> `bin/chapter.js` via `git mv`
- [x] 1.4 Rename `templates/note-taker/agents/` -> `templates/note-taker/members/` via `git mv`

## 2. Update Root package.json

- [x] 2.1 Change `name` from `@clawmasons/forge` to `@clawmasons/chapter`
- [x] 2.2 Change `description` from "Agent Forge System" to "Clawmasons Chapter"
- [x] 2.3 Change `bin` from `{ "forge": "./bin/forge.js" }` to `{ "chapter": "./bin/chapter.js" }`
- [x] 2.4 Change `workspaces` from `["forge-core"]` to `["chapter-core"]`
- [x] 2.5 Update `keywords` to replace forge-specific terms

## 3. Update chapter-core Package

- [x] 3.1 Update `chapter-core/package.json`: name `@clawmasons/chapter-core`, description, files array (`"agents"` -> `"members"`)
- [x] 3.2 Update `chapter-core/members/note-taker/package.json`: name `@clawmasons/member-note-taker`, description

## 4. Update Templates

- [x] 4.1 Update `templates/note-taker/package.json`: dependency `@clawmasons/forge-core` -> `@clawmasons/chapter-core`, workspaces `"agents/*"` -> `"members/*"`
- [x] 4.2 Update `templates/note-taker/members/note-taker/package.json`: name prefix `agent-` -> `member-`, description

## 5. Update Source Code

- [x] 5.1 Update `src/generator/proxy-dockerfile.ts`: WORKDIR `/app/forge` -> `/app/chapter`, COPY paths, ENTRYPOINT `bin/forge.js` -> `bin/chapter.js`, comments
- [x] 5.2 Update `src/cli/commands/install.ts`: `forge-proxy/` -> `chapter-proxy/` paths, `forge-proxy/forge/` -> `chapter-proxy/chapter/` paths, comments
- [x] 5.3 Update `src/compose/docker-compose.ts`: `./forge-proxy` -> `./chapter-proxy`, `./forge-proxy/logs` -> `./chapter-proxy/logs`
- [x] 5.4 Update `src/generator/toolfilter.ts`: comment referencing `@clawmasons/agent-` -> `@clawmasons/member-`

## 6. Update Tests

- [x] 6.1 Update `tests/generator/proxy-dockerfile.test.ts`: expected ENTRYPOINT path, agent name references
- [x] 6.2 Update `tests/resolver/discover.test.ts`: `@clawmasons/forge-core` -> `@clawmasons/chapter-core`, paths
- [x] 6.3 Update `tests/integration/install-flow.test.ts`: all forge-core references, FORGE_CORE_DIR, package names, paths
- [x] 6.4 Update `tests/cli/install.test.ts`: `forge-core` paths in node_modules fixtures
- [x] 6.5 Update `tests/cli/init.test.ts`: `@clawmasons/forge-core` -> `@clawmasons/chapter-core` in expected output
- [x] 6.6 Update `tests/resolver/resolve.test.ts`: `@clawmasons/agent-` -> `@clawmasons/member-` in test fixtures
- [x] 6.7 Update `tests/schemas/agent.test.ts`: agent package name references
- [x] 6.8 Update `tests/validator/validate.test.ts`: agent package name references
- [x] 6.9 Update `tests/materializer/claude-code.test.ts`: agent package name references
- [x] 6.10 Update `tests/compose/lock.test.ts`: agent package name references
- [x] 6.11 Update `tests/compose/env.test.ts`: agent package name references
- [x] 6.12 Update `tests/compose/docker-compose.test.ts`: agent package name references, `forge-proxy` paths
- [x] 6.13 Update `tests/cli/docker-utils.test.ts`: agent package name references
- [x] 6.14 Update `tests/generator/toolfilter.test.ts`: agent package name references

## 7. Regenerate Lock File

- [x] 7.1 Delete `package-lock.json` and run `npm install` to regenerate

## 8. Verification

- [x] 8.1 `npx tsc --noEmit` compiles cleanly
- [x] 8.2 `npx eslint src/ tests/` passes
- [x] 8.3 `npx vitest run` -- all tests pass
- [x] 8.4 Grep for remaining `@clawmasons/forge` (excluding archive, PRDs, CHANGELOG) -- zero results in source/test code
- [x] 8.5 Grep for remaining `forge-core` (excluding archive, PRDs) -- zero results in source/test code
- [x] 8.6 Grep for remaining `bin/forge.js` -- zero results in source/test code
- [x] 8.7 Verify `chapter-core/` directory exists and `forge-core/` does not
- [x] 8.8 Verify `bin/chapter.js` exists and `bin/forge.js` does not
