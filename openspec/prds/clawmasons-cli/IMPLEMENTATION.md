# Clawmasons CLI — Implementation Plan

**PRD:** [openspec/prds/clawmasons-cli/PRD.md](./PRD.md)
**Phase:** P0 (Must-Have requirements)

---

## Implementation Steps

### CHANGE 1: Rename CLI Binary from `chapter` to `clawmasons`

Rename the CLI binary, program name, and all internal references from `chapter` to `clawmasons`. This is the foundational change that all subsequent work builds on.

**PRD refs:** REQ-001 (Rename CLI Binary)

**Summary:** Change the bin entry in `packages/cli/package.json` from `chapter` to `clawmasons`, update the Commander program name in `packages/cli/src/cli/index.ts`, rename `bin/chapter.js` to `bin/clawmasons.js`, update the proxy Dockerfile entrypoint in `packages/cli/src/generator/proxy-dockerfile.ts`, and update all E2E test helpers and references. This is a pure rename — no command restructuring yet.

**User Story:** As a developer, I want to type `clawmasons --help` and see the CLI, so the binary matches the product name. All existing commands still work as top-level commands (restructuring happens in CHANGE 2).

**Scope:**
- `packages/cli/package.json` — bin entry rename
- `packages/cli/src/cli/index.ts` — program name
- `bin/chapter.js` → `bin/clawmasons.js`
- `packages/cli/src/generator/proxy-dockerfile.ts` — entrypoint reference
- `e2e/tests/helpers.ts` — `CHAPTER_BIN` path update
- Help text and error messages referencing the binary name

**Testable output:** `npx clawmasons --help` works. All existing E2E tests pass with the new binary name. `npx chapter` no longer resolves.

**Implemented:** [spec](../../changes/archive/2026-03-10-cli-binary-rename/spec.md)

---

### CHANGE 2: Restructure CLI Commands into Hierarchy

Reorganize commands into the new hierarchy: top-level `init`, `agent`, `acp` commands, and a `chapter` subcommand group containing all workspace management commands.

**PRD refs:** REQ-002 (Restructure CLI Commands)

**Summary:** Create a `chapter` subcommand group on the Commander program. Move existing commands (`init`, `build`, `init-role`, `list`, `validate`, `permissions`, `pack`, `add`, `remove`, `proxy`) under it. Rename `run-agent` to top-level `agent` and `run-acp-agent` to top-level `acp`. Remove deprecated `run-init` and `docker-init` as CLI entry points. Register a placeholder `init` top-level command (lodge init, implemented in CHANGE 5).

**User Story:** As a user, I run `clawmasons chapter build` instead of `chapter build`, and `clawmasons acp --role writer` instead of `chapter run-acp-agent --role writer`. The old command names are gone.

**Scope:**
- `packages/cli/src/cli/commands/index.ts` — new registration structure
- `packages/cli/src/cli/index.ts` — top-level vs subcommand grouping
- Rename command registrations (no logic changes to command implementations)
- Update E2E tests to use new command paths (e.g., `clawmasons chapter build`)

**Testable output:** `clawmasons --help` shows `init`, `agent`, `acp`, `chapter`. `clawmasons chapter --help` shows all subcommands. `clawmasons agent <agent> <role>` works. `clawmasons acp --role <role>` works. Old names (`run-agent`, `run-acp-agent`) are rejected. All E2E tests pass.

**Implemented:** [spec](../../changes/archive/2026-03-10-restructure-cli-commands/spec.md)

---

### CHANGE 3: Role Schema Extensions — Mounts, Base Image, Apt Packages

Extend the role schema and resolver to support `mounts`, `baseImage`, and `aptPackages` fields.

**PRD refs:** REQ-006 (Role-Declared Agent Mounts), REQ-007 (Per-Role Docker Base Image)

**Summary:** Add `mounts` (array of `{ source, target, readonly }` objects), `baseImage` (string), and `aptPackages` (string array) to the `RoleChapterFieldSchema` in `packages/shared/src/schemas/role.ts`. Update the `ResolvedRole` type in `packages/shared/src/types.ts` to include these fields. Update the resolver to pass them through. This is schema-only — no Dockerfile or compose changes yet.

**User Story:** As a chapter author, I want to declare `"mounts": [{ "source": "${LODGE_HOME}", "target": "/home/mason/${LODGE}" }]` and `"baseImage": "node:22-bookworm"` in my role's package.json, and have the schema validate it.

**Scope:**
- `packages/shared/src/schemas/role.ts` — schema extension
- `packages/shared/src/types.ts` — type updates
- `packages/cli/src/resolver/` — pass through new fields
- Unit tests for schema validation

**Testable output:** Unit tests verify: (a) role with mounts/baseImage/aptPackages passes validation, (b) role without these fields still passes (backwards compatible), (c) invalid mount shapes are rejected, (d) ResolvedRole carries the new fields.

**Implemented:** [spec](../../changes/archive/2026-03-10-role-schema-extensions/spec.md)

---

### CHANGE 4: Agent Dockerfile & Compose — Role Mounts and Base Image Support

Wire the role schema extensions from CHANGE 3 into Dockerfile generation and Docker Compose volume generation.

**PRD refs:** REQ-006 (Role-Declared Agent Mounts), REQ-007 (Per-Role Docker Base Image)

**Summary:** Update `packages/cli/src/generator/agent-dockerfile.ts` to read `resolvedRole.baseImage` for the `FROM` line and `resolvedRole.aptPackages` for an `apt-get install` step. Update `packages/cli/src/acp/session.ts` `generateAgentComposeYml()` and `packages/cli/src/cli/commands/run-agent.ts` `generateComposeYml()` to iterate `role.mounts`, resolve `${VAR}` references from `process.env`, and add them to the agent service's `volumes` array. Update `packages/cli/src/cli/commands/init-role.ts` similarly.

**User Story:** As a chapter author with `"baseImage": "node:22-bookworm"` and `"mounts": [{ "source": "${LODGE_HOME}", "target": "/home/mason/${LODGE}" }]` in my role, when I run `clawmasons chapter build`, the generated Dockerfile uses `FROM node:22-bookworm` with apt packages installed, and the compose file includes the extra volume mount.

**Scope:**
- `packages/cli/src/generator/agent-dockerfile.ts` — FROM line, apt-get step
- `packages/cli/src/acp/session.ts` — compose volume generation
- `packages/cli/src/cli/commands/run-agent.ts` — compose volume generation
- `packages/cli/src/cli/commands/init-role.ts` — compose volume generation
- Unit tests for Dockerfile output and compose volume output

**Testable output:** Unit tests verify: (a) Dockerfile with custom baseImage uses correct FROM, (b) Dockerfile with aptPackages includes apt-get install, (c) Dockerfile without these fields is unchanged, (d) compose volumes include role mounts with env vars resolved, (e) readonly mounts append `:ro`. Integration: `clawmasons chapter build` on a chapter with role mounts produces correct Docker artifacts.

**Implemented:** [spec](../../changes/archive/2026-03-10-agent-dockerfile-mounts/spec.md)

---

### CHANGE 5: `clawmasons init` — Lodge Initialization Command

Implement the `clawmasons init` command that creates a lodge directory structure with CHARTER.md and config.json registry.

**PRD refs:** REQ-003 (Lodge Initialization), REQ-009 (CHARTER.md Template)

**Summary:** Create `packages/cli/src/cli/commands/lodge-init.ts` implementing the `clawmasons init` command. Create the CHARTER.md template at `packages/cli/templates/charter/CHARTER.md`. The command resolves `CLAWMASONS_HOME`, `LODGE`, and `LODGE_HOME` from CLI flags or env vars with documented defaults. It creates the lodge directory, copies CHARTER.md, creates `chapters/`, and registers the lodge in `CLAWMASONS_HOME/config.json`. Idempotent — skips if lodge already exists with a `chapters/` directory. Also add lodge config helpers to `packages/cli/src/runtime/home.ts`.

**User Story:** As a new user, I run `clawmasons init --lodge myproject` and get `~/.clawmasons/myproject/` with `CHARTER.md` and `chapters/` directory, plus a registry entry in `~/.clawmasons/config.json`.

**Scope:**
- New: `packages/cli/src/cli/commands/lodge-init.ts`
- New: `packages/cli/templates/charter/CHARTER.md`
- Modified: `packages/cli/src/runtime/home.ts` — config.json lodge registry helpers
- Modified: `packages/cli/src/cli/commands/index.ts` — register init command
- Unit tests for lodge init logic (using temp dirs)

**Testable output:** Unit tests verify: (a) creates CLAWMASONS_HOME and config.json from scratch, (b) creates LODGE_HOME with CHARTER.md and chapters/, (c) registers lodge in config.json, (d) idempotent — skips if already initialized, (e) does not overwrite existing CHARTER.md, (f) custom --lodge-home is registered correctly. CLI test: `clawmasons init --lodge test` creates expected directory structure.

**Implemented:** [spec](../../changes/archive/2026-03-10-lodge-init-command/spec.md)

---

### CHANGE 6: Initiate Chapter Template

Create the `initiate` chapter template with the `chapter-creator` role, `create-chapter` task and skill, `filesystem` app, and `pi` agent.

**PRD refs:** REQ-008 (Initiate Chapter Template)

**Summary:** Create the full template directory at `packages/cli/templates/initiate/` containing: root `package.json`, `agents/pi/package.json`, `roles/chapter-creator/package.json` (with mounts, baseImage, aptPackages), `tasks/create-chapter/package.json` and `prompts/create-chapter.md`, `skills/create-chapter/package.json` and `SKILL.md`, `apps/filesystem/package.json`. All use `{{projectScope}}` placeholder for template substitution. Register `initiate` as a valid template in the chapter init command.

**User Story:** As the bootstrap flow, when `clawmasons chapter init --name acme.initiate --template initiate` runs, it scaffolds a complete chapter workspace with the chapter-creator role ready to analyze projects and create new chapters.

**Scope:**
- New directory: `packages/cli/templates/initiate/` with all template files
- Modified: `packages/cli/src/cli/commands/init.ts` — register `initiate` template
- Task prompt and skill document content

**Testable output:** `clawmasons chapter init --name test.initiate --template initiate` creates a valid workspace. `clawmasons chapter build` succeeds on the scaffolded workspace (generates Dockerfiles with `node:22-bookworm` base, apt packages, and lodge mount). Template placeholders are correctly substituted.

**Implemented:** [spec](../../changes/archive/2026-03-10-initiate-chapter-template/spec.md)

---

### CHANGE 7: `clawmasons acp --chapter initiate` — Bootstrap Flow

Add `--chapter` and `--init-agent` options to the `clawmasons acp` command. When `--chapter initiate` is specified, run the full bootstrap flow: lodge init → chapter init → chapter build → standard ACP startup.

**PRD refs:** REQ-004 (Initiate Chapter Bootstrap Flow)

**Summary:** Extend `packages/cli/src/cli/commands/run-acp-agent.ts` (now registered as `acp`) to accept `--chapter <name>` and `--init-agent <name>` options. When `--chapter initiate` is used: (1) run lodge init (CHANGE 5), (2) check if initiate chapter exists at `LODGE_HOME/chapters/initiate/`, (3) if not, run `chapter init --template initiate` and `chapter build` with CWD in the chapter directory, (4) continue with standard ACP startup using the initiate chapter workspace. Non-initiate `--chapter` values just set the chapter context without bootstrap.

**User Story (US-1):** As a new user, I run `npx clawmasons acp --chapter initiate --role chapter-creator` and it bootstraps everything — lodge, initiate chapter, docker containers — and starts accepting ACP client connections. Zero prior setup required.

**Scope:**
- Modified: `packages/cli/src/cli/commands/run-acp-agent.ts` — new options, bootstrap logic
- Reuses: lodge init from CHANGE 5, template from CHANGE 6
- Integration with existing ACP startup flow

**Testable output:** Integration test: `clawmasons acp --chapter initiate --role chapter-creator` on a clean system creates lodge, chapter, builds, and starts ACP endpoint. Idempotent test: running again skips init/build. Unit test: bootstrap logic calls init and build in correct order with correct CWD.

**Implemented:** [spec](../../changes/archive/2026-03-10-acp-chapter-bootstrap/spec.md)

---

### CHANGE 8: Environment Variable Flow from ACP Client to Credential Service

Ensure environment variables from the ACP client's `env` block flow through to the credential-service container as session overrides.

**PRD refs:** REQ-005 (Environment Variable Flow)

**Summary:** In the `clawmasons acp` command startup, before starting infrastructure: collect all `process.env` vars that match any agent's `credentials` array, merge them into the credentials object passed to `AcpSession`. This ensures they appear in `CREDENTIAL_SESSION_OVERRIDES` and are available inside the credential-service container. The credential resolver already handles the priority chain (session overrides > env > keychain > dotenv).

**User Story (US-4):** As a developer using Zed, I configure `"env": { "OPEN_ROUTER_KEY": "$OPENROUTER_API_KEY" }` in my ACP client config. When the agent requests credential `OPEN_ROUTER_KEY`, it receives the value from my host's `$OPENROUTER_API_KEY`.

**Scope:**
- Modified: `packages/cli/src/cli/commands/run-acp-agent.ts` — credential collection from process.env
- Modified: `packages/cli/src/acp/session.ts` — pass credentials to infra compose
- Unit tests for credential extraction logic

**Testable output:** Unit tests verify: (a) process.env vars matching agent credentials are collected, (b) collected vars appear in CREDENTIAL_SESSION_OVERRIDES, (c) non-matching env vars are not included. Integration: ACP session with env-provided credentials resolves them correctly.

**Not Implemented Yet**

---

### CHANGE 9: E2E Test — ACP Agent Startup from ACP Client (acpx)

Create an end-to-end test that starts the `clawmasons acp` agent from an ACP client (like `acpx`) and verifies the full lifecycle: ACP client spawns the agent process, connects, creates a session, and the agent responds.

**PRD refs:** REQ-004 (Bootstrap Flow acceptance criteria), US-1 (Single-command ACP setup)

**Summary:** Create an E2E test that simulates what an ACP client like `acpx` or Zed does: spawn `clawmasons acp --role <role>` as a child process (stdio transport), send ACP protocol messages (`initialize`, `session/new` with a CWD), verify the agent starts and responds to requests. Test both the standard flow (existing chapter workspace) and optionally the bootstrap flow (`--chapter initiate`). This validates the entire pipeline from ACP client perspective — the same code path that `acpx` would exercise.

**User Story:** As a developer configuring `acpx` or Zed to use clawmasons, I want confidence that `npx clawmasons acp --role writer` works end-to-end when spawned as a subprocess with stdio transport — the same way ACP clients launch agent servers.

**Scope:**
- New: `e2e/tests/acp-client-spawn.test.ts`
- Uses: existing `note-taker` fixture for the standard flow test
- Uses: `mcp-agent` runtime (no LLM required, per existing e2e test patterns)
- Tests:
  1. **Spawn and initialize**: Spawn `clawmasons acp --role writer` via stdio, send ACP `initialize` message, verify `initialized` response
  2. **Session lifecycle**: Send `session/new` with a temp CWD, verify session is created, verify agent container starts (health check on proxy)
  3. **Tool listing**: After session starts, send `tools/list` and verify chapter tools are returned
  4. **Session teardown**: Send `session/end`, verify cleanup
- Follows patterns from existing `e2e/tests/test-note-taker-mcp.test.ts` and the mcp-agent e2e tests

**Testable output:** E2E test suite passes: ACP client can spawn clawmasons, establish a session, list tools, and tear down — validating the full ACP client integration path.

**Implemented:** `e2e/tests/acp-client-spawn.test.ts`

---

### CHANGE 10: NPM Placeholder Packages

Create minimal placeholder packages for npm namespace protection.

**PRD refs:** REQ-010 (NPM Placeholder Packages)

**Summary:** Create `packages/placeholders/` directory (outside monorepo workspaces) with placeholder packages for: `clawmasons`, `@clawmasons/acp`, `@clawmasons/mcp-proxy`, `clawmasons-ai`, `clawmasons-com`, `clawmason`, and org-scoped names. Each has a minimal `package.json` and `README.md` directing users to the official project. Create `scripts/publish-placeholders.sh` to publish them all.

**User Story (US-8):** As a security-conscious publisher, I want placeholder packages on npm for all clawmasons-adjacent names so attackers cannot publish malicious packages under those names.

**Scope:**
- New: `packages/placeholders/<name>/package.json` and `README.md` for each package
- New: `scripts/publish-placeholders.sh`
- NOT added to monorepo workspaces

**Testable output:** Each placeholder directory has valid `package.json` and `README.md`. `npm pack` succeeds in each directory. Publish script iterates all directories.

**Not Implemented Yet**

---

### CHANGE 11: `clawmasons acp` Help Text with ACP Client Config Example

Extend the `--help` output for `clawmasons acp` to include a complete ACP client configuration example.

**PRD refs:** REQ-012 (Help Text with Config Example)

**Summary:** Update the help epilog in the `acp` command to show a complete `agent_servers` JSON config block for Zed/acpx, including all supported environment variables and the bootstrap flow explanation. Extends the existing help epilog pattern from the current `run-acp-agent` command.

**User Story:** As a developer setting up an ACP client, I run `clawmasons acp --help` and see a ready-to-copy JSON config block I can paste into my client settings.

**Scope:**
- Modified: `packages/cli/src/cli/commands/run-acp-agent.ts` — extended help epilog

**Testable output:** `clawmasons acp --help` output includes the ACP client config JSON example with `agent_servers`, env vars, and usage instructions.

**Not Implemented Yet**
