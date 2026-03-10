# ACP Session CWD & Host-Wide Runtime — Implementation Plan

**PRD:** [openspec/prds/acp-session-cwd/PRD.md](./PRD.md)
**Phase:** P0 (Core Changes)

---

## Implementation Steps

### CHANGE 1: CLAWMASONS_HOME Utility & chapters.json

Create a shared utility module for resolving `CLAWMASONS_HOME` and reading/writing `chapters.json`. This is the foundation used by all subsequent changes.

**PRD refs:** REQ-002 (CLAWMASONS_HOME Environment Variable), PRD §4.1, §4.2

**Summary:** Create `packages/cli/src/runtime/home.ts` — a utility module that: (1) resolves `CLAWMASONS_HOME` from env var or defaults to `~/.clawmasons`, (2) reads/writes/updates `chapters.json` with type-safe entries for initialized chapter/role combinations, (3) resolves role directories from `chapters.json` (handling `targetDir` overrides), (4) ensures the `CLAWMASONS_HOME` directory exists with a `.gitignore` ignoring log subdirectories.

**User Story:** As the `init-role` command, I call `getClawmasonsHome()` to get the resolved base directory, then `readChaptersJson()` to check existing entries, and `updateChaptersJson(entry)` to register a new role. As `run-agent`, I call `findRoleEntry(lodge, chapter, role)` to look up where the role's docker-compose lives.

Types:
```typescript
interface ChapterEntry {
  lodge: string;
  chapter: string;
  role: string;
  dockerBuild: string;
  roleDir: string;
  targetDir?: string;
  agents: string[];
  createdAt: string;
  updatedAt: string;
}
interface ChaptersJson {
  chapters: ChapterEntry[];
}
function getClawmasonsHome(): string;
function readChaptersJson(home: string): ChaptersJson;
function writeChaptersJson(home: string, data: ChaptersJson): void;
function findRoleEntry(home: string, lodge: string, chapter: string, role: string): ChapterEntry | undefined;
function upsertRoleEntry(home: string, entry: ChapterEntry): void;
function ensureClawmasonsHome(home: string): void;
```

**Testable output:** Unit tests: (a) `getClawmasonsHome()` reads `CLAWMASONS_HOME` env var, (b) defaults to `~/.clawmasons` when unset, (c) `readChaptersJson` returns empty chapters array when file doesn't exist, (d) `upsertRoleEntry` creates new entry, (e) `upsertRoleEntry` updates existing entry by lodge/chapter/role key, (f) `findRoleEntry` returns matching entry or undefined, (g) `ensureClawmasonsHome` creates directory and `.gitignore`.

**Implemented** -- [Archived change](../../changes/archive/2026-03-10-clawmasons-home-utility/) ([proposal](../../changes/archive/2026-03-10-clawmasons-home-utility/proposal.md), [design](../../changes/archive/2026-03-10-clawmasons-home-utility/design.md), [tasks](../../changes/archive/2026-03-10-clawmasons-home-utility/tasks.md)). Source: `packages/cli/src/runtime/home.ts`. Tests: `packages/cli/tests/runtime/home.test.ts` (18 tests).

---

### CHANGE 2: .gitignore Auto-Management Utility

Create a shared utility for automatically managing `.gitignore` entries when `.clawmasons/` is created in project directories.

**PRD refs:** PRD §4.3 (Per-Project .clawmasons), US-6

**Summary:** Create `packages/cli/src/runtime/gitignore.ts` — utility functions to: (1) check if a directory's `.gitignore` already contains a given pattern, (2) append a pattern to an existing `.gitignore`, (3) orchestrate the "ensure `.clawmasons` is gitignored" logic used by `run-agent`, `run-acp-agent`, and `init-role`. This is a small, focused module used by multiple later changes.

Functions:
```typescript
function ensureGitignoreEntry(dir: string, pattern: string): boolean;  // returns true if appended
function hasGitignoreEntry(gitignorePath: string, pattern: string): boolean;
```

**Testable output:** Unit tests: (a) appends pattern when `.gitignore` exists but doesn't contain it, (b) no-op when pattern already present, (c) no-op when `.gitignore` doesn't exist, (d) handles `.gitignore` with trailing newline and without.

**Implemented** -- [Archived change](../../changes/archive/2026-03-10-gitignore-auto-management/) ([proposal](../../changes/archive/2026-03-10-gitignore-auto-management/proposal.md), [design](../../changes/archive/2026-03-10-gitignore-auto-management/design.md), [tasks](../../changes/archive/2026-03-10-gitignore-auto-management/tasks.md)). Source: `packages/cli/src/runtime/gitignore.ts`. Tests: `packages/cli/tests/runtime/gitignore.test.ts` (11 tests).

---

### CHANGE 3: Enhanced `chapter build` Command

Enhance the existing `build` command to include `pack` and `docker-init` steps, making it the single command needed after `chapter init`. Remove `docker-init` and `run-init` as CLI entry points.

**PRD refs:** REQ-006 (`chapter build` Enhanced), REQ-007 (Remove CLI Entry Points), US-1, US-8

**Summary:** Modify `packages/cli/src/cli/commands/build.ts` to: (1) make the `<agent>` argument optional (auto-detect single agent, build all for multiple), (2) after lock file generation, run `pack` logic to create `dist/*.tgz`, (3) run `docker-init` logic to generate Docker artifacts, (4) display completion instructions showing how to run agents interactively and how to configure an ACP client. Remove `docker-init`, `run-init`, and `acp-proxy` command registrations from `packages/cli/src/cli/commands/index.ts`. Internal functions in `docker-init.ts`, `run-init.ts`, and `docker-utils.ts` remain importable.

**User Story:** As a developer who just ran `chapter init --template note-taker`, I run `chapter build` and everything is prepared — lock file, packed tarballs, Docker artifacts. The output tells me exactly how to run my agent or configure an ACP client.

**Testable output:** (a) `chapter build` with single agent auto-detects it, (b) `chapter build` produces `chapter.lock.json`, `dist/*.tgz`, and `docker/` with Dockerfiles, (c) output includes `run-agent` and ACP client configuration instructions, (d) `chapter docker-init` is an unknown command, (e) `chapter run-init` is an unknown command, (f) `chapter acp-proxy` is an unknown command, (g) internal imports from `docker-init.ts` and `docker-utils.ts` still work.

**Implemented** -- [Archived change](../../changes/archive/2026-03-10-enhanced-chapter-build/) ([proposal](../../changes/archive/2026-03-10-enhanced-chapter-build/proposal.md), [design](../../changes/archive/2026-03-10-enhanced-chapter-build/design.md), [tasks](../../changes/archive/2026-03-10-enhanced-chapter-build/tasks.md)). Source: `packages/cli/src/cli/commands/build.ts`, `packages/cli/src/cli/commands/index.ts`. Tests: `packages/cli/tests/cli/build.test.ts` (947 total tests passing).

---

### CHANGE 4: `chapter init-role` Command

Create the new `init-role` command that initializes a host-wide runtime directory for a chapter role at `CLAWMASONS_HOME/<lodge>/<chapter>/<role>/`.

**PRD refs:** REQ-001 (`chapter init-role`), US-2, US-3, US-7

**Summary:** Create `packages/cli/src/cli/commands/init-role.ts`. The command: (1) reads `CLAWMASONS_HOME` via the utility from CHANGE 1, (2) discovers packages and resolves the agent/role from the current chapter workspace, (3) determines the role directory (default or `--target-dir`), (4) generates a `docker-compose.yaml` with services for proxy, credential-service, and all agents for the role, (5) backs up existing `docker-compose.yaml` if re-running, (6) updates `chapters.json`, (7) ensures `CLAWMASONS_HOME/.gitignore` exists. Register in the command index.

The docker-compose.yaml uses environment variable substitution for `PROJECT_DIR` (set at runtime by `run-agent`/`run-acp-agent`) so it's reusable across projects. Tokens are generated fresh per session, not baked into the compose file.

**User Story:** As an operator, I run `chapter init-role --role writer` from my chapter workspace. It creates `~/.clawmasons/acme/platform/writer/docker-compose.yaml` with services for all agents that use the `writer` role. I can then `run-agent` or `run-acp-agent` from any project directory.

**Testable output:** (a) Creates role directory at `CLAWMASONS_HOME/<lodge>/<chapter>/<role>/`, (b) generates `docker-compose.yaml` with proxy, credential-service, and agent services, (c) `chapters.json` updated with new entry, (d) `--target-dir` overrides role directory location, (e) re-running backs up existing `docker-compose.yaml`, (f) `CLAWMASONS_HOME/.gitignore` created if missing, (g) multiple agents for same role all appear in compose.

**Implemented** -- [Archived change](../../changes/archive/2026-03-10-chapter-init-role/) ([proposal](../../changes/archive/2026-03-10-chapter-init-role/proposal.md), [design](../../changes/archive/2026-03-10-chapter-init-role/design.md), [tasks](../../changes/archive/2026-03-10-chapter-init-role/tasks.md)). Source: `packages/cli/src/cli/commands/init-role.ts`. Tests: `packages/cli/tests/cli/init-role.test.ts` (18 tests).

---

### CHANGE 5: `run-agent` CLAWMASONS_HOME & Auto-Init

Update `run-agent` to use `CLAWMASONS_HOME` for role resolution, create per-project `.clawmasons/` for session state, auto-invoke `init-role` when needed, and manage `.gitignore`.

**PRD refs:** REQ-003 (`run-agent` Changes), US-5, US-6

**Summary:** Modify `packages/cli/src/cli/commands/run-agent.ts` to: (1) on invocation, read `CLAWMASONS_HOME/chapters.json` to find the matching role entry, (2) if not found, automatically run `init-role` logic (from CHANGE 4), (3) use `roleDir` from `chapters.json` (respecting `targetDir` overrides) for docker-build path, (4) create `.clawmasons/` in the current project directory for session-specific state (sessions, logs), (5) use the `.gitignore` utility from CHANGE 2 to ensure `.clawmasons` is ignored in the project.

The key behavioral change: `run-agent` no longer requires a pre-existing `.clawmasons/chapter.json` in the project directory. Instead, it looks up the role from the host-wide `chapters.json` and creates session state locally.

**User Story:** As a developer, I `cd /projects/myapp` and run `chapter run-agent note-taker writer`. Even though I never ran `init-role`, it auto-initializes, creates `~/.clawmasons/acme/platform/writer/`, then starts my agent with `/projects/myapp` mounted as the workspace. `.clawmasons` is added to my project's `.gitignore`.

**Testable output:** (a) Reads role from `chapters.json` when initialized, (b) auto-invokes `init-role` when role not found, (c) creates per-project `.clawmasons/sessions/<id>/` for session state, (d) appends `.clawmasons` to project `.gitignore`, (e) uses `targetDir` from `chapters.json` when set, (f) mounts CWD as `/workspace` (unchanged behavior).

**Implemented** -- [Archived change](../../changes/archive/2026-03-10-run-agent-clawmasons-home/) ([proposal](../../changes/archive/2026-03-10-run-agent-clawmasons-home/proposal.md), [design](../../changes/archive/2026-03-10-run-agent-clawmasons-home/design.md), [tasks](../../changes/archive/2026-03-10-run-agent-clawmasons-home/tasks.md)). Source: `packages/cli/src/cli/commands/run-agent.ts`, `packages/cli/src/runtime/home.ts`. Tests: `packages/cli/tests/cli/run-agent.test.ts` (50 tests), `packages/cli/tests/runtime/home.test.ts` (22 tests). 974 total tests passing.

---

### CHANGE 6: Rename `acp-proxy` to `run-acp-agent`

Rename the `acp-proxy` command to `run-acp-agent` and add `CLAWMASONS_HOME` support with auto-init behavior.

**PRD refs:** REQ-004 (Rename `acp-proxy` to `run-acp-agent`), US-5

**Summary:** Rename `packages/cli/src/cli/commands/acp-proxy.ts` to `run-acp-agent.ts`. Update the command registration to use `run-acp-agent` as the command name. Add the same `CLAWMASONS_HOME` + auto-init logic from CHANGE 5. The old `acp-proxy` registration was already removed in CHANGE 3. Update all imports and references throughout the codebase.

At this stage, `run-acp-agent` still starts the Docker session immediately at startup (same as current behavior). CWD support from `session/new` is added in CHANGE 7.

**User Story:** As an operator, I run `chapter run-acp-agent --role writer` and it behaves identically to the old `chapter acp-proxy --role writer`, but with the new name, `CLAWMASONS_HOME` support, and auto-init if the role isn't initialized yet.

**Testable output:** (a) `chapter run-acp-agent --role writer` starts ACP endpoint, (b) auto-inits role if not in `chapters.json`, (c) uses `CLAWMASONS_HOME` for role resolution, (d) all existing ACP proxy tests pass under new command name, (e) old `acp-proxy` command does not exist.

**Implemented** -- [Archived change](../../changes/archive/2026-03-10-rename-acp-proxy-run-acp-agent/) ([proposal](../../changes/archive/2026-03-10-rename-acp-proxy-run-acp-agent/proposal.md), [design](../../changes/archive/2026-03-10-rename-acp-proxy-run-acp-agent/design.md), [tasks](../../changes/archive/2026-03-10-rename-acp-proxy-run-acp-agent/tasks.md)). Source: `packages/cli/src/cli/commands/run-acp-agent.ts`. Tests: `packages/cli/tests/cli/run-acp-agent.test.ts` (26 tests). Warning prefix updated in `packages/cli/src/acp/warnings.ts`. 980 total tests passing.

---

### CHANGE 7: ACP Session CWD Support — Bridge Intercepts `session/new`

Modify the ACP bridge to intercept `session/new` requests, extract the `cwd` field, and launch per-session agent containers with the correct workspace mount.

**PRD refs:** REQ-005 (ACP Session CWD Support), US-4, PRD §7.4 (Sequence Diagram)

**Summary:** This is the core architectural change. Modify `run-acp-agent` startup to: (1) start proxy and credential-service containers at launch (long-lived), (2) start the ACP bridge endpoint, (3) wait for `session/new` instead of starting agent containers immediately. Modify `packages/cli/src/acp/bridge.ts` to: (1) intercept POST requests, buffer the body, and check if it's a `session/new` with a `cwd` field, (2) when `session/new` arrives, extract `cwd` (fallback to `process.cwd()`), (3) create `.clawmasons/` in the `cwd` directory for session logs, (4) ensure `.gitignore` via CHANGE 2 utility, (5) launch the agent container via `docker run` with `cwd` mounted as `/workspace`, (6) connect bridge to the new agent container, (7) relay the `session/new` and all subsequent messages to the agent. On disconnect, stop only the agent container (proxy + credential-service remain running for the next session).

**User Story:** As a developer using Zed, I have `run-acp-agent --role writer` running. I open `/projects/frontend` in Zed — it sends `session/new` with `cwd: "/projects/frontend"`. The agent container starts with `/projects/frontend` mounted. I switch to `/projects/backend` — the old agent tears down, a new one starts with `/projects/backend` mounted. The proxy stays running throughout.

**Testable output:** (a) Proxy + credential-service start at `run-acp-agent` launch, (b) agent container NOT started until `session/new` arrives, (c) `session/new` with `cwd` mounts that directory as `/workspace`, (d) `session/new` without `cwd` uses `process.cwd()`, (e) `.clawmasons/` created in `cwd` directory, (f) `.gitignore` updated in `cwd` directory, (g) on disconnect, only agent container stops, (h) subsequent `session/new` starts new agent container, (i) proxy + credential-service remain running across sessions.

**Implemented** -- [Archived change](../../changes/archive/2026-03-10-acp-session-cwd-bridge/) ([proposal](../../changes/archive/2026-03-10-acp-session-cwd-bridge/proposal.md), [design](../../changes/archive/2026-03-10-acp-session-cwd-bridge/design.md), [tasks](../../changes/archive/2026-03-10-acp-session-cwd-bridge/tasks.md)). Source: `packages/cli/src/acp/bridge.ts`, `packages/cli/src/acp/session.ts`, `packages/cli/src/cli/commands/run-acp-agent.ts`. Tests: `packages/cli/tests/acp/bridge.test.ts` (30 tests), `packages/cli/tests/acp/session.test.ts` (59 tests), `packages/cli/tests/cli/run-acp-agent.test.ts` (30 tests). 1028 total tests passing.

---

### CHANGE 8: E2E Test Updates

Update E2E tests to use `chapter build` instead of the separate `pack` -> `docker-init` -> `run-init` pipeline. Update any tests referencing removed commands.

**PRD refs:** REQ-008 (E2E Test Updates)

**Summary:** Modify `e2e/tests/docker-init-full.test.ts` to: (1) replace the separate `chapter pack` + `chapter docker-init` steps with a single `chapter build` call, (2) remove the `run-init` step (replaced by auto-init in `run-agent`), (3) keep all existing assertions about Docker artifacts, Dockerfiles, workspace materialization, and proxy connectivity, (4) add new assertions for `chapter.lock.json` output from build. Update `e2e/tests/acp-proxy.test.ts` to reference `run-acp-agent` instead of `acp-proxy` where applicable.

**User Story:** As a developer running the test suite, `npx vitest run e2e/` passes with all existing coverage preserved under the new command structure.

**Testable output:** (a) `docker-init-full.test.ts` uses `chapter build` as setup, (b) all existing assertions about Docker artifacts still pass, (c) new assertion: `chapter.lock.json` exists after build, (d) ACP tests reference `run-acp-agent`, (e) no tests reference removed commands (`docker-init`, `run-init`, `acp-proxy`), (f) full E2E suite passes.

**Implemented** -- [Archived change](../../changes/archive/2026-03-10-e2e-test-updates/) ([proposal](../../changes/archive/2026-03-10-e2e-test-updates/proposal.md), [design](../../changes/archive/2026-03-10-e2e-test-updates/design.md), [tasks](../../changes/archive/2026-03-10-e2e-test-updates/tasks.md)). Source: `e2e/tests/docker-init-full.test.ts`, `e2e/tests/acp-proxy.test.ts`. 1028 total tests passing.

---

### CHANGE 9: `run-acp-agent` Help Instructions

Add detailed help text to `run-acp-agent` explaining CWD behavior, `.clawmasons` creation, `.gitignore` management, and ACP client configuration examples.

**PRD refs:** REQ-010 (Help Instructions in `run-acp-agent`)

**Summary:** Update the `run-acp-agent` command description and add a `--help` epilog that explains: (1) it will create `.clawmasons/` in the session's CWD for logs, (2) it will append `.clawmasons` to the project's `.gitignore` if present, (3) how to configure `CLAWMASONS_HOME`, (4) example ACP client configuration JSON for Zed/JetBrains.

**Testable output:** (a) `chapter run-acp-agent --help` displays CWD behavior explanation, (b) help includes `.gitignore` notice, (c) help includes `CLAWMASONS_HOME` documentation, (d) help includes ACP client config example.

**Not Implemented Yet**
