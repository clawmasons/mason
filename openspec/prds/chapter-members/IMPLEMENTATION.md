# Clawmasons Chapter — Implementation Plan

**PRD:** [openspec/prds/chapter-members/PRD.md](./PRD.md)
**Phase:** P0

---

## Implementation Steps

### CHANGE 1: Rename Package Metadata Field — `forge` → `chapter`

Rename the package.json metadata field from `"forge"` to `"chapter"` across the entire type system, schemas, resolver, and all component package.json files.

**PRD refs:** REQ-003 (Rename Package Metadata Field), REQ-010 (Rename Internal References — type system portion)

**Summary:** This is the foundational change. Rename `forge-field.ts` → `chapter-field.ts`. Rename all Zod schemas: `appForgeFieldSchema` → `appChapterFieldSchema`, `ForgeField` → `ChapterField`, `parseForgeField()` → `parseChapterField()`, etc. Update the two critical locations where `pkgJson.forge` is accessed (`src/resolver/discover.ts`, `src/cli/commands/add.ts`) to read `pkgJson.chapter` instead. Update all component package.json files in `forge-core/` and `templates/` to use `"chapter"` as the metadata key. Update all imports and type references across ~46 source files and ~26 test files.

**User Story:** As a package author, when I declare `"chapter": { "type": "app", ... }` in my package.json, the chapter system discovers, parses, and validates it correctly.

**Scope:**
- Rename file: `src/schemas/forge-field.ts` → `src/schemas/chapter-field.ts`
- Rename file: `tests/schemas/forge-field.test.ts` → `tests/schemas/chapter-field.test.ts`
- Modify all schema files: `src/schemas/app.ts`, `skill.ts`, `task.ts`, `role.ts`, `agent.ts`, `index.ts` — rename exported types and schemas
- Modify: `src/resolver/discover.ts` — `pkgJson.forge` → `pkgJson.chapter`
- Modify: `src/resolver/types.ts` — `ForgeField` → `ChapterField`, `forgeField` → `chapterField`
- Modify: `src/resolver/resolve.ts` — update field access patterns
- Modify: `src/cli/commands/add.ts` — `pkgJson.forge` → `pkgJson.chapter`
- Update all imports across source and test files referencing the old type names
- Update all component package.json files: `forge-core/apps/filesystem/`, `forge-core/tasks/take-notes/`, `forge-core/skills/markdown-conventions/`, `forge-core/roles/writer/`, `forge-core/agents/note-taker/`, and templates
- ~46 source files + ~26 test files impacted

**Testable output:** `npx tsc --noEmit` compiles. `npx vitest run` passes all tests. All component package.json files use `"chapter"` as the metadata key. `parseChapterField()` successfully parses `{ "chapter": { "type": "app", ... } }` from package.json. Grepping source/test code for `ForgeField` or `parseForgeField` returns zero results.

**Implemented** -- [Archived Change](../../changes/archive/2026-03-05-rename-metadata-field-forge-to-chapter/)

**Artifacts:**
- [Proposal](../../changes/archive/2026-03-05-rename-metadata-field-forge-to-chapter/proposal.md)
- [Design](../../changes/archive/2026-03-05-rename-metadata-field-forge-to-chapter/design.md)
- [Tasks](../../changes/archive/2026-03-05-rename-metadata-field-forge-to-chapter/tasks.md)

**Specs updated:**
- [package-schema-validation](../../specs/package-schema-validation/spec.md) -- renamed `ForgeField` → `ChapterField`, `parseForgeField` → `parseChapterField`
- [package-discovery](../../specs/package-discovery/spec.md) -- renamed `forge` field → `chapter` field, `forgeField` → `chapterField`
- [add-command](../../specs/add-command/spec.md) -- renamed `forge` field validation → `chapter` field validation
- [remove-command](../../specs/remove-command/spec.md) -- renamed `forge` field references → `chapter` field
- [workspace-init](../../specs/workspace-init/spec.md) -- renamed `forge` field references → `chapter` field
- [forge-core-package](../../specs/forge-core-package/spec.md) -- renamed `forge` field references → `chapter` field

---

### CHANGE 2: Rename npm Packages & Directory — `@clawmasons/forge` → `@clawmasons/chapter`, `forge-core/` → `chapter-core/`

Rename the npm package names and the forge-core directory to chapter-core.

**PRD refs:** REQ-004 (Rename npm Packages), REQ-001 (Rename CLI Binary)

**Summary:** Rename root package from `@clawmasons/forge` to `@clawmasons/chapter`. Rename `forge-core/` directory to `chapter-core/` and its package from `@clawmasons/forge-core` to `@clawmasons/chapter-core`. Update the root workspace config. Rename `bin/forge.js` → `bin/chapter.js` and update the `bin` field in package.json. Rename agent packages from `@clawmasons/agent-*` to `@clawmasons/member-*`. Update all cross-references in templates, component packages, and test fixtures.

**User Story:** As a user, I install `@clawmasons/chapter` and run `chapter init` to bootstrap my workspace.

**Scope:**
- Rename directory: `forge-core/` → `chapter-core/`
- Rename file: `bin/forge.js` → `bin/chapter.js`
- Modify: root `package.json` — name, bin, workspaces, description
- Modify: `chapter-core/package.json` — name, description
- Modify: `chapter-core/members/note-taker/package.json` — name `@clawmasons/agent-note-taker` → `@clawmasons/member-note-taker`
- Modify: templates `package.json` files — forge-core dependency → chapter-core, agent → member references
- Update all test files referencing `forge-core` paths or `@clawmasons/forge-core` package name
- Update all source files referencing these package names

**Testable output:** `npm install` succeeds at root. `npm pack` produces `clawmasons-chapter-*.tgz`. `chapter-core/package.json` has `name: "@clawmasons/chapter-core"`. `bin/chapter.js` exists and is referenced in package.json. All tests pass.

**Implemented** -- [Archived Change](../../changes/archive/2026-03-05-rename-npm-packages-and-directory/)

**Artifacts:**
- [Proposal](../../changes/archive/2026-03-05-rename-npm-packages-and-directory/proposal.md)
- [Design](../../changes/archive/2026-03-05-rename-npm-packages-and-directory/design.md)
- [Tasks](../../changes/archive/2026-03-05-rename-npm-packages-and-directory/tasks.md)

**Specs updated:**
- [chapter-core-package](../../specs/chapter-core-package/spec.md) -- renamed from `forge-core-package/`, all references updated to `@clawmasons/chapter-core`, `members/`, `@clawmasons/member-note-taker`
- [docker-install-pipeline](../../specs/docker-install-pipeline/spec.md) -- updated `forge-proxy/` → `chapter-proxy/`, `forge/` → `chapter/`, ENTRYPOINT paths, `getChapterProjectRoot()`
- [workspace-init](../../specs/workspace-init/spec.md) -- updated template references: `@clawmasons/chapter-core` dep, `members/` directory, `member-note-taker` package names
- [package-discovery](../../specs/package-discovery/spec.md) -- updated `forge-core` → `chapter-core` in node_modules examples
- [cli-framework](../../specs/cli-framework/spec.md) -- updated `bin/forge.js` → `bin/chapter.js`, `@clawmasons/forge` → `@clawmasons/chapter`
- [docker-compose-generation](../../specs/docker-compose-generation/spec.md) -- updated `./forge-proxy` → `./chapter-proxy` build context paths

---

### CHANGE 3: Rename `.forge/` → `.chapter/` and Environment Variables `FORGE_*` → `CHAPTER_*`

Rename the workspace config directory, global data directory, and all environment variables.

**PRD refs:** REQ-002 (Rename `.forge/` → `.chapter/`), REQ-009 (Rename Global Data Directory), REQ-010 (Rename Internal References — directory and env var portion)

**Summary:** Update `src/cli/commands/init.ts` to create `.chapter/` instead of `.forge/`. Update `src/cli/commands/docker-utils.ts` and `install.ts` to use `.chapter/members/` paths. Update `src/proxy/db.ts` to use `~/.chapter/data/chapter.db` as default and `CHAPTER_DB_PATH` as env var. Rename all `FORGE_*` environment variables to `CHAPTER_*` across compose generation, materializer, env template, and proxy code. Rename `ForgeProxyServer` → `ChapterProxyServer`. Rename MCP server name from `"forge"` to `"chapter"`. Rename Docker network from `agent-net` to `chapter-net`. Rename `forge.lock.json` → `chapter.lock.json`, `forge.config.json` → `chapter.config.json`. Rename `tests/integration/forge-proxy.test.ts` → `tests/integration/chapter-proxy.test.ts`.

**User Story:** As a user, when I run `chapter init`, it creates `.chapter/` (not `.forge/`). My proxy data is stored at `~/.chapter/data/chapter.db`. Docker Compose uses `CHAPTER_*` environment variables.

**Scope:**
- Modify: `src/cli/commands/init.ts` — `.forge` → `.chapter` directory creation
- Modify: `src/cli/commands/docker-utils.ts` — `.forge/agents/` → `.chapter/members/` paths
- Modify: `src/cli/commands/install.ts` — directory paths
- Modify: `src/proxy/db.ts` — `~/.forge/data/forge.db` → `~/.chapter/data/chapter.db`, `FORGE_DB_PATH` → `CHAPTER_DB_PATH`
- Modify: `src/proxy/server.ts` — `ForgeProxyServer` → `ChapterProxyServer`, MCP server name
- Modify: `src/compose/docker-compose.ts` — `FORGE_*` → `CHAPTER_*`, network name
- Modify: `src/compose/env.ts` — `FORGE_*` → `CHAPTER_*`
- Modify: `src/compose/lock.ts` — `forge.lock.json` → `chapter.lock.json`
- Modify: `src/materializer/claude-code.ts` — `FORGE_PROXY_TOKEN` → `CHAPTER_PROXY_TOKEN`, `FORGE_ROLES` → `CHAPTER_ROLES`
- Modify: `src/generator/proxy-dockerfile.ts` — any forge references
- Rename file: `tests/integration/forge-proxy.test.ts` → `tests/integration/chapter-proxy.test.ts`
- Update all test files with updated env var names, paths, and class names
- ~20+ env var references, ~12 CLI files, ~8 proxy files

**Testable output:** `npx tsc --noEmit` compiles. All tests pass. Grepping source/test code for `FORGE_` returns zero results. Grepping for `\.forge[/"]` returns zero results in source (excluding historical PRDs). `chapter init` creates `.chapter/`. Proxy uses `~/.chapter/data/chapter.db`.

**Implemented** -- [Archived Change](../../changes/archive/2026-03-05-rename-dotforge-and-env-vars/)

**Artifacts:**
- [Proposal](../../changes/archive/2026-03-05-rename-dotforge-and-env-vars/proposal.md)
- [Design](../../changes/archive/2026-03-05-rename-dotforge-and-env-vars/design.md)
- [Tasks](../../changes/archive/2026-03-05-rename-dotforge-and-env-vars/tasks.md)

**Specs updated:**
- [workspace-init](../../specs/workspace-init/spec.md) -- `.forge/` → `.chapter/` directory references
- [docker-compose-generation](../../specs/docker-compose-generation/spec.md) -- `FORGE_*` → `CHAPTER_*`, `agent-net` → `chapter-net`
- [env-generation](../../specs/env-generation/spec.md) -- `FORGE_PROXY_TOKEN` → `CHAPTER_PROXY_TOKEN`, `FORGE_PROXY_PORT` → `CHAPTER_PROXY_PORT`
- [lock-file-generation](../../specs/lock-file-generation/spec.md) -- `forge.lock.json` → `chapter.lock.json`
- [proxy-cli](../../specs/proxy-cli/spec.md) -- `~/.forge/forge.db` → `~/.chapter/data/chapter.db`, `ForgeProxyServer` → `ChapterProxyServer`
- [proxy-server](../../specs/proxy-server/spec.md) -- `ForgeProxyServer` → `ChapterProxyServer`, MCP name `"forge"` → `"chapter"`
- [claude-code-materializer](../../specs/claude-code-materializer/spec.md) -- `FORGE_*` → `CHAPTER_*`, `agent-net` → `chapter-net`, `mcpServers.forge` → `mcpServers.chapter`
- [forge-install-command](../../specs/forge-install-command/spec.md) -- `FORGE_PROXY_TOKEN` → `CHAPTER_PROXY_TOKEN`, `.forge/agents/` → `.chapter/agents/`
- [build-command](../../specs/build-command/spec.md) -- `forge.lock.json` → `chapter.lock.json`
- [run-command](../../specs/run-command/spec.md) -- `.forge/agents/` → `.chapter/agents/`
- [stop-command](../../specs/stop-command/spec.md) -- `.forge/agents/` → `.chapter/agents/`
- [mcp-proxy-integration-test](../../specs/mcp-proxy-integration-test/spec.md) -- `ForgeProxyServer` → `ChapterProxyServer`, test file rename
- [resource-prompt-passthrough](../../specs/resource-prompt-passthrough/spec.md) -- `ForgeProxyServer` → `ChapterProxyServer`
- [sqlite-database](../../specs/sqlite-database/spec.md) -- `~/.forge/forge.db` → `~/.chapter/data/chapter.db`
- [proxy-config-generation](../../specs/proxy-config-generation/spec.md) -- `FORGE_PROXY_TOKEN` → `CHAPTER_PROXY_TOKEN`
- [docker-install-pipeline](../../specs/docker-install-pipeline/spec.md) -- `FORGE_PROXY_TOKEN` → `CHAPTER_PROXY_TOKEN`

---

### CHANGE 4: Rename CLI Help Text, Output Messages, and Documentation

Update all user-facing strings from "forge" to "chapter" across CLI output, help text, error messages, and README.

**PRD refs:** REQ-001 (Rename CLI Binary — help text), REQ-010 (Rename Internal References — string literals)

**Summary:** Audit all CLI command files for string literals containing "forge" — help text, description, success/error messages, console.log output. Update to reference "chapter" instead. Update README.md with new CLI commands (`chapter init`, `chapter install`, etc.), new package names, and new directory structures. Update any remaining string references in source code (comments, log messages).

**User Story:** As a user, when I run `chapter --help` or `chapter init`, all output consistently references "chapter" — no leftover "forge" mentions.

**Scope:**
- Modify: all files in `src/cli/commands/` — help text strings, console output
- Modify: `src/cli/index.ts` — program name, description
- Modify: `README.md` — full documentation update
- Modify: any remaining source files with forge string literals in comments or log messages
- Update openspec spec files that contain example output with forge references

**Testable output:** All tests pass (563/563). Running `chapter --help` shows "chapter" in all output. Grepping all source/test files for the word "forge" (case-insensitive) returns zero results outside of historical PRDs/CHANGELOG and the openspec archive directory.

**Implemented** -- [Archived Change](../../changes/archive/2026-03-05-rename-cli-help-text-and-docs/)

**Artifacts:**
- [Proposal](../../changes/archive/2026-03-05-rename-cli-help-text-and-docs/proposal.md)
- [Design](../../changes/archive/2026-03-05-rename-cli-help-text-and-docs/design.md)
- [Tasks](../../changes/archive/2026-03-05-rename-cli-help-text-and-docs/tasks.md)

**Specs updated:**
- [cli-framework](../../specs/cli-framework/spec.md) -- program name `"chapter"`, description `"Clawmasons Chapter"`
- [workspace-init](../../specs/workspace-init/spec.md) -- all init output references use "chapter"
- [add-command](../../specs/add-command/spec.md) -- command references use "chapter"
- [remove-command](../../specs/remove-command/spec.md) -- command references use "chapter"
- [forge-install-command](../../specs/forge-install-command/spec.md) -- title and command references use "chapter"
- [run-command](../../specs/run-command/spec.md) -- command references use "chapter"
- [stop-command](../../specs/stop-command/spec.md) -- command references use "chapter"
- [build-command](../../specs/build-command/spec.md) -- command references use "chapter"
- [list-command](../../specs/list-command/spec.md) -- command references use "chapter"
- [permissions-command](../../specs/permissions-command/spec.md) -- command references use "chapter"
- [proxy-cli](../../specs/proxy-cli/spec.md) -- command references use "chapter"
- [docker-compose-generation](../../specs/docker-compose-generation/spec.md) -- proxy references use "chapter"
- [claude-code-materializer](../../specs/claude-code-materializer/spec.md) -- generated content references "chapter"
- [mcp-proxy-integration-test](../../specs/mcp-proxy-integration-test/spec.md) -- test description uses "chapter"
- [graph-validation](../../specs/graph-validation/spec.md) -- command references use "chapter"
- [proxy-config-generation](../../specs/proxy-config-generation/spec.md) -- proxy name uses "chapter"
- [dependency-graph-resolution](../../specs/dependency-graph-resolution/spec.md) -- field references use "chapter"
- [credential-loading](../../specs/credential-loading/spec.md) -- command references use "chapter"
- [sqlite-database](../../specs/sqlite-database/spec.md) -- proxy references use "chapter"

---

### CHANGE 5: Member Package Type — Schema & Resolver

Replace the `agent` package type with `member`. Add the discriminated union schema for `memberType: "human" | "agent"` with new fields: `name`, `slug`, `email`, `authProviders`.

**PRD refs:** REQ-005 (Member Package Type)

**Summary:** Replace `src/schemas/agent.ts` with `src/schemas/member.ts`. Define the `memberChapterFieldSchema` as a Zod discriminated union on `memberType`. Agent members require `runtimes` and optionally `proxy`; human members have only `roles`. Update `parseChapterField()` to handle `type: "member"` instead of `type: "agent"`. Update `src/resolver/types.ts`: rename `ResolvedAgent` → `ResolvedMember`, add member-specific fields. Update `src/resolver/resolve.ts`: rename `resolveAgent()` → `resolveMember()`, handle both member types. Update validator to validate member packages. Update all consuming code (CLI commands, materializers, compose, proxy).

**User Story:** As a package author, I create a member package with `"memberType": "agent"` or `"memberType": "human"`. The chapter system validates the schema correctly — agent members require runtimes, human members do not.

**Scope:**
- Rename/rewrite: `src/schemas/agent.ts` → `src/schemas/member.ts`
- Modify: `src/schemas/chapter-field.ts` (from CHANGE 1) — update discriminated union to include `member` instead of `agent`
- Modify: `src/schemas/index.ts` — exports
- Modify: `src/resolver/types.ts` — `ResolvedAgent` → `ResolvedMember`, add `memberType`, `name`, `slug`, `email`, `authProviders`
- Modify: `src/resolver/resolve.ts` — `resolveAgent()` → `resolveMember()`
- Modify: `src/validator/validate.ts` — `validateAgent()` → `validateMember()`
- Update all CLI commands that reference `resolveAgent`, `ResolvedAgent`, `validateAgent`
- Update materializers, compose, proxy code
- Update `chapter-core/members/note-taker/package.json` with new schema fields (directory already renamed in Change #2)
- Update templates similarly
- Update all tests

**Testable output:** Schema validation passes for `{ type: "member", memberType: "agent", name: "...", slug: "...", email: "...", runtimes: [...], roles: [...] }`. Schema validation passes for `{ type: "member", memberType: "human", name: "...", slug: "...", email: "...", roles: [...] }`. Schema rejects human members with `runtimes`. Schema rejects members without `name`, `slug`, or `email`. All existing agent-related tests updated and passing. `npx tsc --noEmit` and `npx vitest run` pass.

**Implemented** -- [Archived Change](../../changes/archive/2026-03-05-member-package-type-schema-resolver/)

**Artifacts:**
- [Proposal](../../changes/archive/2026-03-05-member-package-type-schema-resolver/proposal.md)
- [Design](../../changes/archive/2026-03-05-member-package-type-schema-resolver/design.md)
- [Tasks](../../changes/archive/2026-03-05-member-package-type-schema-resolver/tasks.md)

**Specs updated:**
- [package-schema-validation](../../specs/package-schema-validation/spec.md) -- `AgentChapterField` → `MemberChapterField`, discriminated union on `memberType`
- [dependency-graph-resolution](../../specs/dependency-graph-resolution/spec.md) -- `resolveAgent()` → `resolveMember()`, `ResolvedAgent` → `ResolvedMember` with member identity fields
- [graph-validation](../../specs/graph-validation/spec.md) -- `validateAgent()` → `validateMember()`
- [materializer-interface](../../specs/materializer-interface/spec.md) -- `ResolvedAgent` → `ResolvedMember`
- [forge-install-command](../../specs/forge-install-command/spec.md) -- `<agent>` → `<member>`, `.chapter/agents/` → `.chapter/members/`
- [build-command](../../specs/build-command/spec.md) -- `<agent>` → `<member>`, `resolveAgent` → `resolveMember`
- [workspace-init](../../specs/workspace-init/spec.md) -- template `type: "agent"` → `type: "member"` with `memberType`
- [chapter-core-package](../../specs/chapter-core-package/spec.md) -- `type: "agent"` → `type: "member"` with `memberType: "agent"`
- [proxy-cli](../../specs/proxy-cli/spec.md) -- `--agent` → `--member`, `resolveAgent()` → `resolveMember()`

---

### CHANGE 6: Per-Member Directory Structure & Install Pipeline

Update `chapter install` to scaffold per-member directories under `.chapter/members/<slug>/` with `log/`, `proxy/`, and runtime directories for agent members, and only `log/` for human members.

**PRD refs:** REQ-008 (Per-Member Directory Structure)

**Summary:** Updated the install pipeline in `src/cli/commands/install.ts` to use `member.slug` for directory naming, create `log/` directories for all members, rename the proxy build context from `chapter-proxy/` to `proxy/`, and handle human member installs (log/ only, no docker artifacts). Updated `src/compose/docker-compose.ts` to reference `build: ./proxy` and `./proxy/logs:/logs`. Updated all related tests and the E2E integration test. No changes needed to `docker-utils.ts`, `run.ts`, or `stop.ts` (they already used `resolveMemberDir()` which derives from package name, aligning with slug).

**User Story:** As a user, when I run `chapter install @acme/member-note-taker`, the scaffolded directory is at `.chapter/members/note-taker/` with `log/`, `proxy/`, and `claude-code/` subdirectories. When I install a human member, only `log/` is created.

**Scope:**
- Modify: `src/cli/commands/install.ts` — use member.slug for dir naming, create log/, handle human members, rename chapter-proxy/ to proxy/
- Modify: `src/compose/docker-compose.ts` — build path `./proxy`, log mount `./proxy/logs:/logs`
- Updated tests: `tests/cli/install.test.ts`, `tests/compose/docker-compose.test.ts`, `tests/compose/lock.test.ts`, `tests/integration/install-flow.test.ts`

**Testable output:** `chapter install @member-note-taker` creates `.chapter/members/note-taker/log/`, `.chapter/members/note-taker/proxy/Dockerfile`, `.chapter/members/note-taker/claude-code/workspace/`. Human member install creates only `.chapter/members/<slug>/log/`. All 583 tests pass. Docker Compose generation references `build: ./proxy`.

**Implemented** -- [Archived Change](../../changes/archive/2026-03-06-per-member-directory-structure/)

**Artifacts:**
- [Proposal](../../changes/archive/2026-03-06-per-member-directory-structure/proposal.md)
- [Design](../../changes/archive/2026-03-06-per-member-directory-structure/design.md)
- [Tasks](../../changes/archive/2026-03-06-per-member-directory-structure/tasks.md)

**Specs updated:**
- [forge-install-command](../../specs/forge-install-command/spec.md) -- per-member layout, log/ dir, human member handling, proxy/ build path, slug-based directory naming
- [docker-install-pipeline](../../specs/docker-install-pipeline/spec.md) -- `chapter-proxy/` replaced with `proxy/`
- [docker-compose-generation](../../specs/docker-compose-generation/spec.md) -- `build: ./chapter-proxy` replaced with `build: ./proxy`
- [run-command](../../specs/run-command/spec.md) -- updated to member terminology, `.chapter/members/<slug>/` paths
- [stop-command](../../specs/stop-command/spec.md) -- updated to member terminology, `.chapter/members/<slug>/` paths

---

### CHANGE 7: Members Registry — `.chapter/members.json`

Implement the members registry file and integrate it with `chapter install`.

**PRD refs:** REQ-006 (Members Registry)

**Summary:** Created a members registry module at `src/registry/members.ts` that manages `.chapter/members.json`. When `chapter install` runs (for both agent and human members), it adds or updates an entry in the registry with: package name, member type, status (`"enabled"`), and installation timestamp. The registry is a simple JSON file keyed by member slug. Created functions: `readMembersRegistry()`, `writeMembersRegistry()`, `addMember()`, `updateMemberStatus()`, `getMember()`. Integrated with `chapter install` -- after successful installation, the registry is updated. Integrated with `chapter list` -- shows member type and status (enabled/disabled) alongside the member name and version.

**User Story:** As a user, after running `chapter install @acme/member-note-taker`, I can see in `.chapter/members.json` that `note-taker` is installed and enabled. Running `chapter list` shows the enabled/disabled status of each member.

**Scope:**
- New file: `src/registry/types.ts` — MembersRegistry, MemberEntry types
- New file: `src/registry/members.ts` — registry CRUD functions
- New test: `tests/registry/members.test.ts` — 17 unit tests
- Modify: `src/cli/commands/install.ts` — call `addMember()` after install (both agent and human paths)
- Modify: `src/cli/commands/list.ts` — read registry and show member type and status
- Modify: `tests/cli/install.test.ts` — 3 new tests for registry integration
- Modify: `tests/cli/list.test.ts` — 3 new tests for status display
- ~100 lines new source code, ~200 lines new test code

**Testable output:** After `chapter install`, `.chapter/members.json` exists with correct entry. Reinstalling the same member updates (not duplicates) the entry. `chapter list` output includes member type and status. Unit tests for all registry functions pass. All 606 tests pass.

**Implemented** -- [Archived Change](../../changes/archive/2026-03-06-members-registry/)

**Artifacts:**
- [Proposal](../../changes/archive/2026-03-06-members-registry/proposal.md)
- [Design](../../changes/archive/2026-03-06-members-registry/design.md)
- [Tasks](../../changes/archive/2026-03-06-members-registry/tasks.md)

**Specs updated:**
- [members-registry](../../specs/members-registry/spec.md) -- new spec for registry module
- [forge-install-command](../../specs/forge-install-command/spec.md) -- added registry integration requirement
- [list-command](../../specs/list-command/spec.md) -- updated to member terminology, added status display requirement

---

### CHANGE 8: `chapter enable` / `chapter disable` Commands

Implement the enable and disable CLI commands for managing member lifecycle.

**PRD refs:** REQ-007 (`chapter enable` / `chapter disable` Commands)

**Summary:** Add two new CLI commands: `chapter enable @<member>` and `chapter disable @<member>`. Both read `.chapter/members.json`, find the member by slug (stripping `@` prefix), update the status, and write back. Error if member is not installed. Update `chapter run` to check member status before starting — disabled members return an error.

**User Story:** As a user, I've installed 3 agent members but want to temporarily disable one. I run `chapter disable @note-taker`. The agent stays installed but `chapter run @note-taker` refuses to start it. When I'm ready, `chapter enable @note-taker` re-enables it.

**Scope:**
- New file: `src/cli/commands/enable.ts`
- New file: `src/cli/commands/disable.ts`
- Modify: `src/cli/commands/index.ts` — register new commands
- Modify: `src/cli/commands/run.ts` — check member status before starting
- New test: `tests/cli/enable.test.ts`
- New test: `tests/cli/disable.test.ts`
- ~50-80 lines new code per command

**Testable output:** `chapter enable @note-taker` sets status to `"enabled"` in `members.json`. `chapter disable @note-taker` sets status to `"disabled"`. Running enable/disable on non-installed member shows error. `chapter run` on a disabled member shows error. All 627 tests pass.

**Implemented** -- [Archived Change](../../changes/archive/2026-03-06-chapter-enable-disable-commands/)

**Artifacts:**
- [Proposal](../../changes/archive/2026-03-06-chapter-enable-disable-commands/proposal.md)
- [Design](../../changes/archive/2026-03-06-chapter-enable-disable-commands/design.md)
- [Tasks](../../changes/archive/2026-03-06-chapter-enable-disable-commands/tasks.md)

**Specs updated:**
- [enable-disable-commands](../../specs/enable-disable-commands/spec.md) -- new spec for enable/disable CLI commands
- [run-command](../../specs/run-command/spec.md) -- added requirement for disabled member rejection
- [cli-framework](../../specs/cli-framework/spec.md) -- added enable/disable to registered commands list

---

### CHANGE 9: Update Templates for Chapter + Member Model

Update the `templates/note-taker/` template to use chapter terminology, member package type, and new directory structure.

**PRD refs:** REQ-004 (Rename npm Packages — template portion), REQ-005 (Member Package Type — template component)

**Summary:** Update `templates/note-taker/package.json` to depend on `@clawmasons/chapter-core` instead of `@clawmasons/forge-core`. Rename `templates/note-taker/agents/` directory to `templates/note-taker/members/`. Update the template member package.json to use the new member schema (`type: "member"`, `memberType: "agent"`, `name`, `slug`, `email` fields with `{{projectName}}` and `{{projectScope}}` placeholders). Update all `"chapter"` metadata keys (instead of `"forge"`). Update `chapter init` template copying logic if directory names changed.

**User Story:** As a new user, when I run `chapter init --template note-taker --name @acme/my-project`, the generated workspace has members (not agents), uses the `chapter` metadata field, and depends on `@clawmasons/chapter-core`.

**Scope:**
- Modify: `templates/note-taker/members/note-taker/package.json` — member schema with placeholders (directory already renamed in Change #2, dependency already updated in Change #2)
- Modify: `templates/note-taker/roles/writer/package.json` — `chapter` field
- Modify: `src/cli/commands/init.ts` — update template detection if needed (look for `members/` instead of `agents/`)
- Update tests: `tests/cli/init.test.ts`

**Testable output:** `chapter init --template note-taker` produces a workspace with `members/note-taker/package.json` using `"chapter"` metadata key and `"type": "member"`. The generated `package.json` depends on `@clawmasons/chapter-core`. `chapter validate` succeeds on the init output. All init tests pass.

**Not Implemented Yet**

---

### CHANGE 10: Update OpenSpec Specs for Chapter Terminology

Update the openspec specification files to reflect the chapter + member terminology.

**PRD refs:** REQ-010 (Rename Internal References — documentation portion)

**Summary:** Update the main spec files under `openspec/specs/` that contain forge-specific examples, variable names, or terminology. Focus on specs that are actively referenced (not archived changes). Update examples to use `chapter` field, `CHAPTER_*` env vars, `.chapter/` paths, and member references. This is a documentation-only change — no source code modified.

**User Story:** As a developer reading the specs, all examples and references are consistent with the chapter terminology — no confusion between "forge" and "chapter" in active documentation.

**Scope:**
- Modify: spec files under `openspec/specs/` that contain `forge`/`FORGE_` references in examples
- Key specs: `docker-compose-generation/`, `env-generation/`, `claude-code-materializer/`, `workspace-init/`, `package-discovery/`, `proxy-server/`, etc.
- Do NOT modify archived changes (historical record)
- ~15-20 spec files

**Testable output:** Grepping `openspec/specs/` for `[Ff]orge` returns zero results (excluding filenames that reference historical PRDs). All spec examples use `chapter` terminology consistently.

**Not Implemented Yet**

---

### CHANGE 11: End-to-End Validation — Full Chapter Workflow

Create or update integration tests that exercise the complete chapter workflow with the new member model.

**PRD refs:** PRD §11 Phase 5 (End-to-End Validation)

**Summary:** Update the existing integration test (`tests/integration/install-flow.test.ts`) and proxy integration test for the chapter workflow. Test the full sequence: `chapter init --template note-taker` → `chapter validate @<member>` → `chapter list` → `chapter install @<member>` → verify per-member directory structure → verify `members.json` → `chapter disable @<member>` → verify `chapter run` rejects → `chapter enable @<member>`. Verify no "forge" references leak into generated output.

**User Story:** As a developer, when I run the integration test suite, I have confidence that the entire chapter workflow — from init to install to enable/disable — works end-to-end with no forge remnants.

**Scope:**
- Modify: `tests/integration/install-flow.test.ts` (or equivalent) — full chapter workflow
- Modify: `tests/integration/chapter-proxy.test.ts` — proxy with member model
- New assertions: verify `.chapter/members.json` content, per-member directory structure, no "forge" in generated files
- Verify: `npx tsc --noEmit`, `npx eslint src/ tests/`, `npx vitest run` all pass

**Testable output:** Integration tests pass. The full sequence (init → validate → list → install → enable/disable) completes without errors. Generated files contain no "forge" references. All ~550+ tests pass.

**Not Implemented Yet**
