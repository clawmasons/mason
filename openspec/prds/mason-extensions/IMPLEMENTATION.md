# Mason Extensions — Implementation Plan

**PRD:** [mason-extensions/PRD.md](./PRD.md)
**Status:** Planning

---

## Implementation Steps

### CHANGE 1: Dynamic Agent Discovery from `.mason/node_modules/`

Add a discovery mechanism to `agent-sdk` that scans `.mason/node_modules/` for packages with `mason.type: "agent"` in their `package.json`, dynamically imports their entrypoints, and registers them as `AgentPackage` instances.

**References:** PRD REQ-003 (discovery mechanism), REQ-004 (agent package convention)

**User Story:** As a mason user, when I have agent packages installed in `.mason/node_modules/` that declare `mason.type: "agent"`, they are automatically discovered and available via `mason run --agent <name>` — without any hardcoded imports in the CLI.

**Scope:**
- Add `discoverInstalledAgents(projectDir)` function to `packages/agent-sdk/src/discovery.ts`
- Scans `.mason/node_modules/@clawmasons/` (and configurable scopes) for `package.json` files with `mason.type: "agent"`
- Reads `mason.entrypoint` to locate the module, dynamically imports it, validates it exports an `AgentPackage`
- Integrate into `createAgentRegistry()` as a new phase between built-ins and config-declared agents
- Unit tests: mock filesystem with valid/invalid agent packages, verify correct discovery

**Testable Output:** Unit tests pass proving that packages with `mason.type: "agent"` in `.mason/node_modules/` are discovered and registered, while packages without the field are ignored.

**Not Implemented Yet**

---

### CHANGE 2: Agent Auto-Install to `.mason/node_modules/`

When `mason run --agent <name>` references an agent that isn't found in built-ins or `.mason/node_modules/`, the CLI auto-installs it by writing a tilde-pinned dependency to `.mason/package.json` and running `npm update`.

**References:** PRD REQ-003 (auto-install flow, version pinning)

**User Story:** As a mason user, I run `mason run --agent claude` on a fresh project. Mason resolves `claude` → `@clawmasons/claude-code-agent`, creates `.mason/package.json` with `"@clawmasons/claude-code-agent": "~0.2.1"`, runs `npm update --prefix .mason/`, and proceeds — no manual `npm install` required.

**Scope:**
- Add `ensureMasonPackageJson(projectDir)` — creates `.mason/package.json` if missing
- Add `autoInstallAgent(projectDir, packageName, cliVersion)` — writes/updates dep with tilde pin, runs `npm update --prefix .mason/`
- Add agent name resolution map: `claude` → `@clawmasons/claude-code-agent`, `pi` → `@clawmasons/pi-coding-agent`, etc.
- Add version sync: on every run, rewrite all `.mason/package.json` deps to `~{CLI_VERSION}` and run `npm update`
- Wire into the CLI's agent resolution path: if agent not found after built-in + discovery, trigger auto-install then re-discover
- Integration test: run `mason run --agent claude` against a fixture, verify `.mason/package.json` created with correct version pin

**Testable Output:** Running `mason run --agent <name>` on a project without the agent installed auto-creates `.mason/package.json`, installs the agent, and proceeds with the run.

**Not Implemented Yet**

---

### CHANGE 3: Remove Hardcoded Agent Imports from CLI

Remove the static imports of `@clawmasons/claude-code-agent`, `@clawmasons/pi-coding-agent`, and `@clawmasons/codex-agent` from the CLI source and `package.json`. The CLI only keeps `mcp-agent` as a built-in. All other agents are loaded via discovery + auto-install (Changes 1 & 2).

**References:** PRD REQ-006 (remove moved packages), Section 6.4 (CLI import changes)

**User Story:** As a mason maintainer, the CLI `package.json` has zero dependencies on external agent packages. When I run `mason run --agent claude`, the agent is resolved entirely through `.mason/node_modules/` discovery and auto-install.

**Scope:**
- Remove imports from `packages/cli/src/materializer/role-materializer.ts`: `claudeCodeAgent`, `piCodingAgent`, `codexAgent`
- Update `BUILTIN_AGENTS` to only contain `mcpAgent`
- Remove `@clawmasons/claude-code-agent`, `@clawmasons/pi-coding-agent`, `@clawmasons/codex-agent` from `packages/cli/package.json` dependencies
- Update any tests that rely on hardcoded agent imports
- E2E test: `mason run --agent claude` still works via auto-install path

**Testable Output:** CLI compiles and passes all tests with no agent package dependencies. `mason run --agent claude` works via dynamic discovery/auto-install.

**Not Implemented Yet**

---

### CHANGE 4: Create `mason-extensions` Repository Scaffold

Create the `mason-extensions` monorepo at `../mason-extensions` with workspace config, build system, and `file:` dependency linking to mason core packages.

**References:** PRD REQ-001 (repository structure), REQ-002 (dependency linking), REQ-007 (build system)

**User Story:** As an agent developer, I clone `mason-extensions`, run `npm install`, and all workspace packages install correctly with `@clawmasons/agent-sdk` and `@clawmasons/shared` resolved from the local mason repo via `file:` paths.

**Scope:**
- Create `mason-extensions/package.json` with workspaces: `["agents/*", "roles/*", "skills/*"]`
- Create `mason-extensions/tsconfig.json` and per-agent `tsconfig.build.json`
- Create build/lint/typecheck/clean scripts
- Create `mason-extensions/package.json` scripts for mason CLI linking (`"mason": "node ../mason/scripts/mason.js"`)
- Placeholder agent directories (empty `src/index.ts` stubs) to verify the scaffold builds
- Verify: `npm install && npm run build` succeeds in the scaffold

**Testable Output:** `mason-extensions/` exists, `npm install` resolves all dependencies, `npm run build` compiles successfully.

**Implemented** (in mason-extensions repo)

---

### CHANGE 5: Move Agent Packages to `mason-extensions`

Move `claude-code-agent`, `pi-coding-agent`, and `codex-agent` source code from mason to `mason-extensions/agents/`. Update `package.json` files to use `file:` paths for `agent-sdk` and `shared`.

**References:** PRD REQ-001 (repository structure), REQ-002 (dependency linking)

**User Story:** As an agent developer, I work on `claude-code-agent` in `mason-extensions/agents/claude-code-agent/` with full type checking and tests, independent of the mason CLI build pipeline.

**Scope:**
- Copy `packages/claude-code-agent/` → `mason-extensions/agents/claude-code-agent/`
- Copy `packages/pi-coding-agent/` → `mason-extensions/agents/pi-coding-agent/`
- Copy `packages/agents/codex-agent/` → `mason-extensions/agents/codex-agent/`
- Update each agent's `package.json`: change `@clawmasons/agent-sdk` and `@clawmasons/shared` to `file:../../mason/packages/agent-sdk` and `file:../../mason/packages/shared`
- Add `mason` field to each agent's `package.json`: `{ "type": "agent", "entrypoint": "./dist/index.js" }`
- Verify: `npm run build && npm run test` in `mason-extensions` passes

**Testable Output:** All agent packages build and pass tests from `mason-extensions/`.

**Implemented** (in mason-extensions repo)

---

### CHANGE 6: Move Roles and Skills to `mason-extensions`

Move `mason-roles` roles and skills from mason to `mason-extensions/roles/` and `mason-extensions/skills/`.

**References:** PRD REQ-001 (repository structure), REQ-005 (mason.js script linking)

**User Story:** As a role author, I edit roles in `mason-extensions/roles/configure-project/` and package them using `npm run build:roles`, which invokes `mason package` via the linked mason CLI.

**Scope:**
- Copy `packages/mason-roles/roles/` → `mason-extensions/roles/`
- Copy `packages/mason-roles/skills/` → `mason-extensions/skills/`
- Add `build:roles` script to `mason-extensions/package.json`
- Verify: `npm run build:roles` produces packaged role artifacts

**Testable Output:** Roles package successfully from `mason-extensions/` using the mason CLI.

**Implemented** (in mason-extensions repo)

---

### CHANGE 7: Remove Moved Packages from Mason Monorepo

Delete agent and role directories from mason, update root `package.json` workspaces and scripts, and verify mason builds cleanly.

**References:** PRD REQ-006 (remove moved packages)

**User Story:** As a mason maintainer, the mason repo is lean — no agent implementation code, no role definitions. `npm install && npm run build && npm run test` all pass.

**Scope:**
- Delete `packages/claude-code-agent/`
- Delete `packages/pi-coding-agent/`
- Delete `packages/agents/codex-agent/` (and `packages/agents/` if empty except mcp-agent is elsewhere)
- Delete `packages/mason-roles/`
- Update root `package.json`: remove `packages/agents/*` from workspaces if empty, update build/publish script package lists
- Verify: `npm install && npm run build && npm run test` passes

**Testable Output:** Mason monorepo compiles, lints, and passes all unit tests with no agent/role packages present.

**Not Implemented Yet**

---

### CHANGE 8: `mason-extensions` Publishing Pipeline

Create a publish script that replaces `file:` references with version-pinned npm references, builds, publishes to npm, and restores `file:` paths.

**References:** PRD REQ-008 (publishing pipeline)

**User Story:** As a CI/CD pipeline, I run the publish script in `mason-extensions` and all agent packages are published to npm with correct version-pinned dependencies on `@clawmasons/agent-sdk` and `@clawmasons/shared` — no `file:` paths leak into published packages.

**Scope:**
- Create `mason-extensions/scripts/publish.sh` (or Node script)
- Steps: validate git clean → replace `file:` with npm versions → build → npm publish → restore `file:`
- Add `prepublishOnly` guard in each agent `package.json` to prevent accidental `npm publish` without the script
- Verify: dry-run publish produces packages with no `file:` references

**Testable Output:** `npm pack` on each agent produces a tarball where `package.json` has version-pinned npm dependencies, not `file:` paths.

**Not Implemented Yet**

---

### CHANGE 9: End-to-End Validation

Full integration test: fresh project, mason CLI with no bundled agents, `mason run --agent claude` auto-installs from npm (or local `.mason/node_modules/`), discovers the agent, and completes a run.

**References:** PRD Section 6.3 (discovery flow), all acceptance criteria

**User Story:** As a mason user upgrading to the new architecture, everything works exactly as before — `mason run --agent claude` just works. The only difference is agents are fetched on demand instead of bundled.

**Scope:**
- E2E test: `mason run --agent claude` from a clean project (no `.mason/package.json`)
- E2E test: verify version sync when CLI version changes
- E2E test: verify `.mason/package.json` is auto-created with correct tilde pins
- E2E test: verify config-declared agents still work alongside auto-installed ones
- Manual validation: upgrade path from current mason to new mason

**Testable Output:** All E2E tests pass. A user on current mason can upgrade and continue using `mason run --agent claude` without any manual steps.

**Not Implemented Yet**
