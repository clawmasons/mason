# Forge Packaging & Templates — Implementation Plan

**PRD:** [openspec/prds/forge-packaging/PRD.md](./PRD.md)
**Phase:** P0

---

## Implementation Steps

### CHANGE 1: Create forge-core Package

Migrate component definitions from `example/` to a new `forge-core/` workspace package. Rename all packages from `@example/*` to `@clawmasons/*`.

**PRD refs:** REQ-001 (Monorepo Structure), REQ-002 (forge-core Package)

**Summary:** Create `forge-core/` as an npm workspace member at the repo root. Move apps, tasks, skills, roles, and agents from `example/` into forge-core with `@clawmasons/*` naming. Add `"workspaces": ["forge-core"]` to the root `package.json`. Update all internal forge-field references (e.g., `@example/role-writer` → `@clawmasons/role-writer`).

**User Story:** US-2 — As an agent builder, I want to install `@clawmasons/forge-core` and reference its components in my own projects.

**Scope:**
- New directory: `forge-core/`
- New file: `forge-core/package.json` (`@clawmasons/forge-core`, files array includes all component dirs)
- Migrate from `example/`: `apps/filesystem/`, `tasks/take-notes/`, `skills/markdown-conventions/`, `roles/writer/`, `agents/note-taker/`
- Rename all package names: `@example/*` → `@clawmasons/*`
- Update all forge-field references to use new names
- Modify root `package.json`: add `"workspaces": ["forge-core"]`
- Do NOT remove `example/` yet (done in CHANGE 6)

**Testable output:** `npm install` succeeds at root. `forge-core/package.json` is valid. All sub-component package.json files parse correctly. `npm pack` in forge-core produces a `.tgz` tarball containing all component directories. The tgz installs cleanly in a fresh directory via `npm install <path>/clawmasons-forge-core-0.1.0.tgz`.

**Implemented:** 2026-03-05
- [Proposal](../../changes/archive/2026-03-05-create-forge-core-package/proposal.md)
- [Design](../../changes/archive/2026-03-05-create-forge-core-package/design.md)
- [Tasks](../../changes/archive/2026-03-05-create-forge-core-package/tasks.md)
- [Specs: forge-core-package](../../changes/archive/2026-03-05-create-forge-core-package/specs/forge-core-package/spec.md)
- [Main Spec: forge-core-package](../../specs/forge-core-package/spec.md)

---

### CHANGE 2: Discovery Enhancement — Scan node_modules Workspace Dirs

Enhance `discoverPackages()` to scan inside node_modules packages that contain forge workspace directories.

**PRD refs:** REQ-003 (Discovery Enhancement)

**Summary:** When `scanNodeModules()` finds a package in node_modules, check if its directory contains any of the standard workspace subdirectories (`apps/`, `tasks/`, `skills/`, `roles/`, `agents/`). If so, scan those subdirectories for forge packages and register them (respecting existing workspace-local precedence). This allows `@clawmasons/forge-core` (and any similar package) to provide discoverable forge components without being a monorepo of individual npm packages.

**User Story:** US-2 — As an agent builder, when I install `@clawmasons/forge-core`, its components are automatically discoverable by forge.

**Scope:**
- Modify: `src/resolver/discover.ts` — add workspace-dir scanning for node_modules packages
- New test cases: `tests/resolver/discover.test.ts` — verify sub-package discovery, precedence
- ~15-20 lines of new code in `scanNodeModules()`

**Testable output:** Unit tests: (1) `discoverPackages()` on a directory with `node_modules/forge-core/apps/filesystem/package.json` finds `@clawmasons/app-filesystem`. (2) Local `apps/filesystem/` takes precedence over the same package in node_modules. (3) Packages without workspace dirs are unaffected.

**Implemented:** 2026-03-05
- [Proposal](../../changes/archive/2026-03-05-discovery-node-modules-workspace-dirs/proposal.md)
- [Design](../../changes/archive/2026-03-05-discovery-node-modules-workspace-dirs/design.md)
- [Tasks](../../changes/archive/2026-03-05-discovery-node-modules-workspace-dirs/tasks.md)
- [Specs: node-modules-workspace-discovery](../../changes/archive/2026-03-05-discovery-node-modules-workspace-dirs/specs/node-modules-workspace-discovery/spec.md)
- [Main Spec: package-discovery](../../specs/package-discovery/spec.md)

---

### CHANGE 3: Template System — `forge init --template`

Create the templates directory and enhance `forge init` with template support.

**PRD refs:** REQ-004 (Templates Directory), REQ-005 (`forge init` with Template Support), REQ-008 (Package Configuration)

**Summary:** Create `templates/note-taker/` with a package.json (depends on `@clawmasons/forge-core`), local agent definition, and local role definition. Enhance `forge init` to accept `--template <name>` and `--name <name>` options. When a template is specified, copy its files first, then apply the standard forge scaffold. When no template is specified, list available templates. After scaffolding, run `npm install`. Add `templates/` to the forge package's `files` array.

For local testing, the template's `package.json` references `@clawmasons/forge-core` with a version range (e.g., `^0.1.0`). When testing with local `.tgz` packages, the user (or test script) installs the forge-core tgz first, then runs `forge init`. The template does NOT hardcode tgz paths — it uses standard version ranges so it works with both local tgz installs and future registry publishes.

**User Story:** US-1, US-3, US-4 — New users get a working project from a template; project names are configurable; templates are discoverable.

**Scope:**
- New directory: `templates/note-taker/`
- New files: `templates/note-taker/package.json`, `templates/note-taker/agents/note-taker/package.json`, `templates/note-taker/roles/writer/package.json`
- Modify: `src/cli/commands/init.ts` — add `--template`, `--name` options, template copying, `npm install`, template listing
- Modify: root `package.json` — add `"templates"` to `files` array
- New/updated tests: `tests/cli/init.test.ts`

**Testable output:** (1) `forge init --template note-taker` in `/tmp/test-forge/` copies template files with `@test-forge/*` scoped names, creates .forge/, runs npm install. (2) `forge init --name @acme/my-agent --template note-taker` scopes local components as `@acme/*`. (3) `forge init` with no template lists available templates. (4) After init, `forge list` shows the agent tree with `@test-forge/agent-note-taker` referencing `@test-forge/role-writer` which references `@clawmasons/task-take-notes`, `@clawmasons/skill-markdown-conventions`, and `@clawmasons/app-filesystem`.

**Implemented:** 2026-03-05
- [Proposal](../../changes/archive/2026-03-05-template-system-forge-init/proposal.md)
- [Design](../../changes/archive/2026-03-05-template-system-forge-init/design.md)
- [Tasks](../../changes/archive/2026-03-05-template-system-forge-init/tasks.md)
- [Specs: workspace-init](../../changes/archive/2026-03-05-template-system-forge-init/specs/workspace-init/spec.md)
- [Main Spec: workspace-init](../../specs/workspace-init/spec.md)

---

### CHANGE 4: Simplify Proxy Dockerfile

Replace the multi-stage Dockerfile with a single-stage build that uses pre-built forge from node_modules.

**PRD refs:** REQ-007 (Simplified Proxy Dockerfile)

**Summary:** Rewrote `generateProxyDockerfile()` to produce a single-stage Dockerfile that copies pre-built forge artifacts (`dist/`, `bin/`, `package.json`, `package-lock.json`) and installs production dependencies via `npm ci --omit=dev --ignore-scripts`. Updated `runInstall()` to copy only pre-built artifacts instead of source files (`src/`, `tsconfig*.json`). Added configurable `skipDirs` parameter to `copyDirToFiles()`.

**User Story:** US-5 — Docker builds are fast and don't require TypeScript compilation.

**Scope:**
- Modify: `src/generator/proxy-dockerfile.ts` — single-stage Dockerfile, no `AS builder`, no `npm run build`
- Modify: `src/cli/commands/install.ts` — copy pre-built forge (dist, bin, package.json, package-lock.json) instead of source; configurable `skipDirs` on `copyDirToFiles()`
- Update tests: `tests/generator/proxy-dockerfile.test.ts`, `tests/cli/install.test.ts`

**Testable output:** (1) Generated Dockerfile has no multi-stage build. (2) `forge install` output has `forge-proxy/forge/dist/` but NOT `forge-proxy/forge/src/`. (3) All 550 tests pass with updated expectations.

**Implemented:** 2026-03-05
- [Proposal](../../changes/archive/2026-03-05-simplify-proxy-dockerfile/proposal.md)
- [Design](../../changes/archive/2026-03-05-simplify-proxy-dockerfile/design.md)
- [Tasks](../../changes/archive/2026-03-05-simplify-proxy-dockerfile/tasks.md)
- [Specs: docker-install-pipeline](../../changes/archive/2026-03-05-simplify-proxy-dockerfile/specs/docker-install-pipeline/spec.md)
- [Main Spec: docker-install-pipeline](../../specs/docker-install-pipeline/spec.md)

---

### CHANGE 5: Update Tests and Remove example/

Migrate all tests that reference `example/` to use `forge-core/` and remove the example directory.

**PRD refs:** REQ-006 (Remove `example/` Directory)

**Summary:** Find all test files and source files that reference `example/`. Update paths to point at `forge-core/` (for component-level tests) or use the template-based init flow (for integration tests). Remove the `example/` directory. Update any documentation references.

**User Story:** N/A (internal cleanup)

**Scope:**
- Modify: all test files referencing `example/` paths
- Modify: integration tests to use `forge-core/` or template-based setup
- Delete: `example/` directory and all contents
- Update: README.md if it references example/

**Testable output:** (1) `example/` directory does not exist. (2) All tests pass (`npx vitest run`). (3) No source file references `example/`.

**Implemented:** 2026-03-05
- [Proposal](../../changes/archive/2026-03-05-remove-example-directory/proposal.md)
- [Design](../../changes/archive/2026-03-05-remove-example-directory/design.md)
- [Tasks](../../changes/archive/2026-03-05-remove-example-directory/tasks.md)
- [Specs: remove-example-directory](../../changes/archive/2026-03-05-remove-example-directory/specs/remove-example-directory/spec.md)

---

### CHANGE 6: End-to-End Install Flow Test (Local tgz)

Create an integration test that validates the complete user journey using locally-packed `.tgz` files — no npm registry required.

**PRD refs:** PRD §2 (Measurable Outcomes)

**Summary:** Write an integration test (or script) that exercises the full workflow using only local `.tgz` packages:

1. Run `npm run build` to compile forge
2. Run `npm pack` at repo root → produces `clawmasons-forge-0.1.0.tgz`
3. Run `npm pack` in `forge-core/` → produces `clawmasons-forge-core-0.1.0.tgz`
4. Create a temp directory (`/tmp/test-forge-<random>/`)
5. Run `npm install <path>/clawmasons-forge-0.1.0.tgz` in the temp directory
6. Run `npm install <path>/clawmasons-forge-core-0.1.0.tgz` in the temp directory
7. Run `npx forge init --template note-taker`
8. Run `npx forge validate @test-forge/agent-note-taker` (project name derived from folder `test-forge`)
9. Run `npx forge list`
10. Run `npx forge install @test-forge/agent-note-taker`
11. Verify the generated Dockerfile is single-stage (no `AS builder`)
12. Clean up temp directory

This test proves the entire packaging + template + discovery + install pipeline works end-to-end without any registry access.

**User Story:** All user stories validated end-to-end.

**Scope:**
- New test: `tests/integration/install-flow.test.ts` (or shell script)
- Uses `npm pack` to create local `.tgz` tarballs for both `@clawmasons/forge` and `@clawmasons/forge-core`
- Creates temp directory, installs both tgz files, runs the full forge command sequence
- Verifies: package.json correct, node_modules populated, forge commands succeed, Dockerfile is single-stage
- Cleans up temp directory after (pass or fail)

**Testable output:** Integration test passes. The full sequence — pack, install from tgz, init, validate, list, install — completes without errors in a clean directory with no registry access.

**Implemented:** 2026-03-05
- [Proposal](../../changes/archive/2026-03-05-e2e-install-flow-test/proposal.md)
- [Design](../../changes/archive/2026-03-05-e2e-install-flow-test/design.md)
- [Tasks](../../changes/archive/2026-03-05-e2e-install-flow-test/tasks.md)
- [Specs: e2e-install-flow](../../changes/archive/2026-03-05-e2e-install-flow-test/specs/e2e-install-flow/spec.md)
