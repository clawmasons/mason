# Clawmasons Chapter Monorepo — Implementation Plan

**PRD:** [openspec/prds/chapter-monorepo/PRD.md](./PRD.md)
**Phase:** P0

---

## Implementation Steps

### CHANGE 1: Replace "member" Package Type with "agent"

Revert the "member" package type (introduced in chapter-members PRD) back to a simpler "agent" type with no PII fields.

**PRD refs:** REQ-005 (Remove "member" Package Type), REQ-006 ("agent" Package Type), REQ-007 (Remove Human Member Concept)

**Summary:** This is the foundational schema change — all subsequent code depends on the correct package type. Rewrite `src/schemas/member.ts` → `src/schemas/agent.ts`, removing the discriminated union on `memberType` and replacing it with a flat agent schema. The agent schema contains: `type`, `name`, `slug`, `description`, `runtimes`, `roles`, `resources`, `proxy`, and `llm`. Remove all member-specific fields: `memberType`, `email`, `authProviders`, and the human member concept entirely. Update `src/resolver/types.ts`: rename `ResolvedMember` → `ResolvedAgent`, strip member-specific fields. Update `src/resolver/resolve.ts` (`resolveMember()` → `resolveAgent()`), `src/validator/validate.ts` (`validateMember()` → `validateAgent()`), materializers, and all CLI commands that reference the member type. Update `chapter-core/members/` packages and templates to use `"type": "agent"` with the new schema. Update all test files.

**User Story:** As a package author, when I declare `"chapter": { "type": "agent", "name": "Note Taker", "slug": "note-taker", "runtimes": ["claude-code"], "roles": [...] }` in my package.json, the chapter system validates it correctly. Packages with `email`, `authProviders`, or `memberType` are rejected.

**Scope:**
- Rename/rewrite: `src/schemas/member.ts` → `src/schemas/agent.ts` — flat agent schema (no discriminated union)
- Modify: `src/schemas/chapter-field.ts` — update discriminated union to use `agent` instead of `member`
- Modify: `src/schemas/index.ts` — update exports
- Modify: `src/resolver/types.ts` — `ResolvedMember` → `ResolvedAgent`, remove `memberType`, `email`, `authProviders`
- Modify: `src/resolver/resolve.ts` — `resolveMember()` → `resolveAgent()`
- Modify: `src/validator/validate.ts` — `validateMember()` → `validateAgent()`
- Modify: all CLI commands referencing `ResolvedMember`, `resolveMember`, `validateMember`
- Modify: materializers (`src/materializer/`) — update to use `ResolvedAgent` (docker methods will be removed in CHANGE 2; update all methods here to keep each change self-contained)
- Modify: compose code (`src/compose/`) — update member references (compose module will be deleted in CHANGE 2; update here for clean compilation between changes)
- Modify: `chapter-core/members/note-taker/package.json` — use `"type": "agent"` schema
- Modify: `templates/note-taker/members/note-taker/package.json` — use `"type": "agent"` schema
- Update all test files referencing member types, schemas, and resolver functions

**Testable output:** Schema validates `{ "type": "agent", "name": "...", "slug": "...", "runtimes": [...], "roles": [...] }`. Schema rejects packages with `email`, `authProviders`, or `memberType` fields. Schema rejects `"type": "member"`. `npx tsc --noEmit` compiles. `npx vitest run` passes. Grepping source/test code for `memberType` or `ResolvedMember` returns zero results.

**Not Implemented Yet**

---

### CHANGE 2: Remove Old CLI Commands and Compose Infrastructure; Refactor Materializer and Docker Utils

Remove dead CLI commands, member registry, and compose infrastructure. Refactor the materializer into a workspace-only interface and retain general docker utilities.

**PRD refs:** REQ-008 (Remove `install`, `run`, `stop` Commands)

**Summary:** Three parts: (1) delete the old `install`, `run`, `stop`, `enable`, and `disable` CLI commands plus the member registry and compose/lock infrastructure; (2) refactor the materializer to remove docker-specific methods, keeping only workspace materialization as the core contract for the "agent" type; (3) retain general-purpose docker utilities for reuse by `docker-init` and `run-agent`. The materializer has been iterated across two runtimes (claude-code, pi-coding-agent) and represents proven, working code for translating the chapter dependency graph into runtime-native workspace configurations. Docker-specific Dockerfile and compose generation will be re-introduced as a separate concern in CHANGE 5/6.

**User Story:** As a user, when I run `chapter install`, `chapter run`, `chapter stop`, `chapter enable`, or `chapter disable`, the command is not found. Only the core commands (`init`, `add`, `remove`, `list`, `validate`, `proxy`, `publish`) remain. The materializer module still exists but only handles workspace file generation.

**Scope:**

*Delete — CLI commands:*
- Delete: `src/cli/commands/install.ts` (~306 lines)
- Delete: `src/cli/commands/run.ts` (~179 lines)
- Delete: `src/cli/commands/stop.ts` (~75 lines)
- Delete: `src/cli/commands/enable.ts`
- Delete: `src/cli/commands/disable.ts`
- Modify: `src/cli/commands/index.ts` — remove registrations for deleted commands

*Delete — Member registry:*
- Delete: `src/registry/members.ts` (~66 lines)
- Delete: `src/registry/types.ts` (~21 lines)

*Delete — Compose and old generator infrastructure:*
- Delete: `src/compose/docker-compose.ts`
- Delete: `src/compose/env.ts`
- Delete: `src/compose/lock.ts`
- Delete: `src/compose/types.ts`
- Delete: `src/compose/index.ts`
- Delete: `src/generator/proxy-dockerfile.ts` (will be reimplemented in CHANGE 6)

*Delete — Test files:*
- Delete: `tests/cli/install.test.ts`, `tests/cli/run.test.ts`, `tests/cli/stop.test.ts`, `tests/cli/enable.test.ts`, `tests/cli/disable.test.ts`
- Delete: `tests/registry/members.test.ts`
- Delete: `tests/compose/docker-compose.test.ts`, `tests/compose/env.test.ts`, `tests/compose/lock.test.ts`
- Delete: `tests/generator/proxy-dockerfile.test.ts`
- Delete: `tests/integration/install-flow.test.ts`

*Refactor — Materializer (keep, strip docker methods):*
- Modify: `src/materializer/types.ts` — Remove `generateDockerfile`, `generateComposeService`, `generateConfigJson` from `RuntimeMaterializer` interface. Remove `ComposeServiceDef` type. Interface retains only `name` and `materializeWorkspace()`. Update `ResolvedMember` → `ResolvedAgent` (from CHANGE 1).
- Modify: `src/materializer/common.ts` — Add `PROVIDER_ENV_VARS` (moved from pi-coding-agent.ts). Update `ResolvedMember` → `ResolvedAgent`. All functions retained: `formatPermittedTools`, `findRolesForTask`, `collectAllSkills`, `collectAllTasks`, `generateAgentsMd`, `generateSkillReadme`.
- Modify: `src/materializer/claude-code.ts` — Remove `generateDockerfile()`, `generateComposeService()`, `generateConfigJson()`. Keep `materializeWorkspace()` and helpers (`generateMcpJson`, `generateSettingsJson`, `generateSlashCommand`). Update member → agent.
- Modify: `src/materializer/pi-coding-agent.ts` — Remove `generateDockerfile()`, `generateComposeService()`. Move `PROVIDER_ENV_VARS` to `common.ts`. Keep `materializeWorkspace()` and helpers. Update member → agent.
- Modify: `src/materializer/index.ts` — Update exports.
- Modify: `tests/materializer/claude-code.test.ts` — Remove docker method tests, keep workspace tests, update member → agent.
- Modify: `tests/materializer/pi-coding-agent.test.ts` — Remove docker method tests, keep workspace tests, update member → agent.

*Refactor — Docker utilities (keep general functions):*
- Modify: `src/cli/commands/docker-utils.ts` — Remove `resolveMemberDir()`. Keep `checkDockerCompose()`, `validateEnvFile()`, `execDockerCompose()`.
- Modify: `tests/cli/docker-utils.test.ts` — Remove `resolveMemberDir` tests, keep general utility tests.

*Update — Package exports:*
- Modify: `src/index.ts` — Remove compose exports. Update materializer exports (remove `ComposeServiceDef`).

**Testable output:** `chapter install`, `chapter run`, `chapter stop`, `chapter enable`, `chapter disable` are all not found. `npx tsc --noEmit` compiles. `npx vitest run` passes. No imports reference deleted files. Materializer workspace tests pass. `RuntimeMaterializer` interface has only `name` and `materializeWorkspace()`. Grepping for `generateDockerfile` or `ComposeServiceDef` in materializer source returns zero results. Grepping for `resolveMemberDir` returns zero results.

**Not Implemented Yet**

---

### CHANGE 3: Extract `packages/shared`

Extract shared types, schemas, and utilities into `packages/shared` so both CLI and proxy can depend on them.

**PRD refs:** REQ-004 (`packages/shared` — `@clawmasons/shared`)

**Summary:** Create the `packages/shared` package as the first monorepo package extraction. Move Zod schemas (`src/schemas/*`), resolver types (`src/resolver/types.ts`), and tool filtering (`src/generator/toolfilter.ts`) into `packages/shared/src/`. Create a barrel export at `packages/shared/src/index.ts`. Create `packages/shared/package.json` with name `@clawmasons/shared`. Update all imports in the remaining `src/` code to reference `@clawmasons/shared` instead of relative paths to the moved files.

**User Story:** As a developer working on the CLI or proxy, when I need shared types or schemas, I import them from `@clawmasons/shared`. The shared package contains no CLI-specific or proxy-specific code.

**Scope:**
- New: `packages/shared/package.json` — `@clawmasons/shared`
- New: `packages/shared/tsconfig.json`
- New: `packages/shared/src/index.ts` — barrel export
- Move: `src/schemas/*` → `packages/shared/src/schemas/`
- Move: `src/resolver/types.ts` → `packages/shared/src/types.ts`
- Move: `src/generator/toolfilter.ts` → `packages/shared/src/toolfilter.ts`
- Modify: `src/materializer/*.ts` — update imports from `../resolver/types.js` and `../generator/toolfilter.js` to `@clawmasons/shared`
- Modify: all remaining `src/` files importing from moved locations — update to `@clawmasons/shared`
- Modify: all remaining test files importing from moved locations

**Testable output:** `packages/shared` builds independently (`cd packages/shared && npx tsc --noEmit`). Imports from `@clawmasons/shared` resolve correctly. No source file imports directly from `packages/shared/src/` (all go through the package name). `npx tsc --noEmit` at root compiles. `npx vitest run` passes.

**Not Implemented Yet**

---

### CHANGE 4: Monorepo Conversion — CLI + Proxy Packages, Root Config

Split remaining code into `packages/cli` and `packages/proxy`, convert root to npm workspaces monorepo.

**PRD refs:** REQ-001 (npm Workspaces Monorepo), REQ-002 (`packages/cli` — `@clawmasons/chapter`), REQ-003 (`packages/proxy` — `@clawmasons/proxy`)

**Summary:** Now that shared types are extracted (CHANGE 3), split the remaining source code. Move proxy code (`src/proxy/*`) into `packages/proxy/src/`. Move remaining CLI code (`src/cli/*`, `src/resolver/*`, `src/generator/*`, `src/validator/*`) into `packages/cli/src/`. Split tests between packages accordingly. Create `packages/proxy/package.json` (`@clawmasons/proxy`) and `packages/cli/package.json` (`@clawmasons/chapter`). Update root `package.json` to add `"workspaces": ["packages/*"]` and shared dev dependencies. Update root `tsconfig.json` for TypeScript project references. Both packages depend on `@clawmasons/shared`.

**User Story:** As a developer, when I run `npm install` at the monorepo root, all three packages are linked. `npm run build` builds all packages in dependency order. Each package can be published independently.

**Scope:**
- Move: `src/proxy/*` → `packages/proxy/src/`
- Move: remaining `src/` → `packages/cli/src/`
- Move: `tests/` → split between `packages/cli/tests/` and `packages/proxy/tests/`
- New: `packages/proxy/package.json` — `@clawmasons/proxy`, depends on `@clawmasons/shared`
- New: `packages/proxy/tsconfig.json`
- New: `packages/cli/package.json` — `@clawmasons/chapter`, depends on `@clawmasons/shared`
- New: `packages/cli/tsconfig.json`
- Modify: root `package.json` — add `"workspaces": ["packages/*"]`, shared dev deps, build scripts
- Modify: root `tsconfig.json` — project references to all three packages
- Modify: `bin/chapter.js` — update entry point path

**Testable output:** `npm install` at root links all packages. `npm run build` builds all packages. `npx tsc --noEmit` passes for each package and at root. `npx vitest run` passes all tests. `chapter --help` still works. Proxy starts as standalone package.

**Not Implemented Yet**

---

### CHANGE 5: `chapter docker-init` — Scaffold and Local Install

Implement the docker-init command: read chapter config, create docker directory, install local packages.

**PRD refs:** REQ-009 (Read Chapter Config), REQ-010 (Create Docker Directory), REQ-011 (Install Local Packages)

**Summary:** Create a new `docker-init` CLI command at `packages/cli/src/commands/docker-init.ts`. The command reads `.clawmasons/chapter.json` to get the chapter's full name (`<lodge-slug>.<chapter-slug>`). Creates a `docker/` directory in the chapter root with a `package.json`. Adds an `install-local` npm script to the root `package.json` (`cd docker && npm install ../dist/*.tgz`). Runs the local install to populate `docker/node_modules/` with all chapter packages from packed tgz files.

**User Story:** As a chapter author, when I run `chapter docker-init` in my chapter project (after packing to `/dist`), it creates a `docker/` directory with `package.json` and a populated `node_modules/` containing all my chapter packages.

**Scope:**
- New: `packages/cli/src/commands/docker-init.ts` — command implementation
- New: `packages/cli/tests/commands/docker-init.test.ts` — unit tests
- Modify: `packages/cli/src/commands/index.ts` — register `docker-init` command
- Reuse: `src/resolver/discover.ts` patterns for scanning packages

**Testable output:** Running `chapter docker-init` in a chapter project reads `.clawmasons/chapter.json` successfully. `docker/` directory is created with `package.json`. Root `package.json` has the `install-local` script. `docker/node_modules/` is populated after install. Error message shown when `.clawmasons/chapter.json` is missing. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**

---

### CHANGE 6: `chapter docker-init` — Dockerfile Generation

Extend docker-init to generate proxy and agent Dockerfiles for all role and agent×role combinations.

**PRD refs:** REQ-012 (Proxy Dockerfiles), REQ-013 (Agent Dockerfiles), REQ-014 (Role Dependency Resolution), REQ-015 (Local Build Only), REQ-024 (mason User), REQ-025 (Proxy Per Role), REQ-026 (Agent Per Agent × Role), REQ-027 (Local Registry Only)

**Summary:** Extend the docker-init command to scan `docker/node_modules/` for roles and agents, then generate Dockerfiles. For each role, generate a proxy Dockerfile at `docker/proxy/<role-name>/Dockerfile` that boots `@clawmasons/proxy` configured for that role's apps. For each agent×role combination, generate an agent Dockerfile at `docker/agent/<agent-name>/<role-name>/Dockerfile`. Agent Dockerfiles follow role dependencies to include all required apps, tasks, and skills. All generated images use `USER mason`. All Dockerfiles reference local paths only (no registry pulls). Create new proxy and agent Dockerfile generators. The old `src/generator/proxy-dockerfile.ts` was removed in CHANGE 2; reference its patterns from git history.

**User Story:** As a chapter author, after running `chapter docker-init`, I see proxy Dockerfiles (one per role) and agent Dockerfiles (one per agent×role pair) in the `docker/` directory. I can build these images with `docker build` and they all run as the `mason` user.

**Scope:**
- Modify: `packages/cli/src/commands/docker-init.ts` — add Dockerfile generation after install
- New: `packages/cli/src/generator/proxy-dockerfile.ts` — proxy Dockerfile generation per role (new implementation)
- New: `packages/cli/src/generator/agent-dockerfile.ts` — agent Dockerfile generation per agent×role
- Reuse: `packages/cli/src/materializer/` — call `materializeWorkspace()` to generate workspace files COPY'd into agent Docker images
- Reuse: `packages/cli/src/materializer/common.ts` — `PROVIDER_ENV_VARS` for environment variable injection
- New: `packages/cli/tests/generator/agent-dockerfile.test.ts` — unit tests
- Modify: `packages/cli/tests/commands/docker-init.test.ts` — integration tests for full Dockerfile tree
- Reuse: `src/resolver/resolve.ts` for role dependency resolution

**Testable output:** `chapter docker-init` produces `docker/proxy/<role>/Dockerfile` for each role. Produces `docker/agent/<agent>/<role>/Dockerfile` for each agent×role pair. All Dockerfiles contain `USER mason`. All Dockerfiles reference local paths only. `docker build` succeeds on generated Dockerfiles. Role dependencies are correctly resolved (all apps from role's tasks are included). `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**

---

### CHANGE 7: `chapter run-init`

Implement the run-init command to initialize a project directory for running chapter agents.

**PRD refs:** REQ-016 (Create Project Config), REQ-017 (chapter.json Format), REQ-018 (Idempotent)

**Summary:** Create a new `run-init` CLI command at `packages/cli/src/commands/run-init.ts`. The command creates `.clawmasons/` in the current directory with `chapter.json`, `logs/`, and `workspace/` subdirectories. Prompts the user for the absolute path to the chapter project's `docker/` directory (the build directory from `docker-init`). The generated `chapter.json` contains `chapter` (identifier), `docker-registries: ["local"]`, and `docker-build` (absolute path). The command is idempotent — re-running preserves existing config and sessions.

**User Story:** As a developer, when I `cd` to my project directory and run `chapter run-init`, it creates `.clawmasons/` with the correct structure. When I run it again, my existing config and sessions are preserved.

**Scope:**
- New: `packages/cli/src/commands/run-init.ts` — command implementation
- New: `packages/cli/tests/commands/run-init.test.ts` — unit tests
- Modify: `packages/cli/src/commands/index.ts` — register `run-init` command

**Testable output:** Running `chapter run-init` creates `.clawmasons/chapter.json`, `.clawmasons/logs/`, and `.clawmasons/workspace/`. `chapter.json` contains `chapter`, `docker-registries`, and `docker-build` fields. `docker-build` is an absolute path. Re-running does not overwrite existing `chapter.json`. Existing sessions are preserved. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**

---

### CHANGE 8: `chapter run-agent`

Implement the run-agent command to run a chapter agent interactively against a project directory.

**PRD refs:** REQ-019 (Session ID Generation), REQ-020 (Docker Compose Generation), REQ-021 (Proxy Detached), REQ-022 (Agent Interactive), REQ-023 (Session Retained)

**Summary:** Create a new `run-agent` CLI command at `packages/cli/src/commands/run-agent.ts`. The command reads `.clawmasons/chapter.json` from the current project directory, generates a short unique session ID, creates `.clawmasons/sessions/<sessionid>/docker/`, and generates a `docker-compose.yml` pointing at the correct proxy and agent Dockerfiles from the `docker-build` path. Starts the proxy container detached (background, logs to `.clawmasons/logs/`). Starts the agent container interactively with stdio connected to the user's terminal. When the agent exits, the proxy is torn down via `docker compose down`. The session directory is retained for debugging.

**User Story:** As a developer, when I run `chapter run-agent note-taker writer` in my project directory, it starts a proxy in the background and opens an interactive agent session. When I exit the agent, the proxy shuts down. My session directory with compose file and logs is preserved for debugging.

**Scope:**
- New: `packages/cli/src/commands/run-agent.ts` — command implementation
- New: `packages/cli/tests/commands/run-agent.test.ts` — unit tests
- Modify: `packages/cli/src/commands/index.ts` — register `run-agent` command
- Reuse: `packages/cli/src/cli/commands/docker-utils.ts` — `checkDockerCompose()` for pre-flight check, `execDockerCompose()` for `docker compose up/down`

**Testable output:** Running `chapter run-agent note-taker writer` creates `.clawmasons/sessions/<sessionid>/docker/docker-compose.yml`. The compose file references correct Dockerfiles from the `docker-build` path. Each invocation generates a unique session ID. Proxy starts detached, agent starts interactively. On agent exit, proxy is torn down. Session directory is retained after exit. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**
