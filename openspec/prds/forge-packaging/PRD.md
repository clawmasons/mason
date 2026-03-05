# Forge Packaging & Templates — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** ClawForge, Inc.

---

## 1. Problem Statement

Forge currently ships as a single package with a baked-in `example/` directory that serves as both documentation and test fixture. This creates several problems:

- **Not representative of real usage:** The example is an npm workspace with local packages. Real users will `npm install @clawforge/forge` into a new directory and expect it to work. There is no `forge init` flow that demonstrates this.
- **No reusable component library:** The example's apps, tasks, skills, and roles (filesystem, take-notes, markdown-conventions, writer) are useful building blocks, but they're trapped inside the example directory with `@example/*` names. They can't be installed as dependencies.
- **Proxy Dockerfile builds forge from source:** The `forge install` pipeline copies the entire forge source tree into the Docker build context and compiles it in a multi-stage build. This is slow, fragile, and unnecessary — the user already has a built copy of forge in their `node_modules`.
- **No template system:** `forge init` creates an empty workspace scaffold. There's no way to bootstrap a working agent project that demonstrates the forge pattern end-to-end.

---

## 2. Goals

### User Goals
- Run `npm install @clawforge/forge` in an empty directory and have a working CLI.
- Run `forge init --template note-taker` and get a complete, working agent project that demonstrates the forge pattern.
- Use pre-built components from `@clawforge/forge-core` (apps, tasks, skills, roles) as building blocks in their own agent projects.
- Run `forge validate`, `forge list`, and `forge install` immediately after init — no manual setup.

### Business Goals
- Demonstrate the full forge workflow in under 5 commands.
- Establish `@clawforge/forge-core` as the standard library of reusable forge components.
- Enable the community to publish their own component libraries following the same pattern as forge-core.

### Measurable Outcomes
- The following sequence completes without errors using local tgz packages:
  ```
  # Build and pack locally
  cd <forge-repo>
  npm run build
  npm pack                          # → clawforge-forge-0.1.0.tgz
  cd forge-core && npm pack         # → clawforge-forge-core-0.1.0.tgz

  # Test in a fresh directory
  mkdir /tmp/test-forge && cd /tmp/test-forge
  npm install <path-to>/clawforge-forge-0.1.0.tgz
  npx forge init --template note-taker
  # (forge init installs @clawforge/forge-core from local tgz or path)
  # Project name defaults to folder name "test-forge", so local
  # agent/role are scoped as @test-forge/*
  npx forge validate @test-forge/agent-note-taker
  npx forge list
  npx forge install @test-forge/agent-note-taker
  ```
- Proxy Docker build time reduced (no TypeScript compilation stage).

---

## 3. Non-Goals

- **npm registry publishing:** This PRD covers the packaging structure and local testing flow using local `.tgz` files produced by `npm pack`. Actually publishing to npm is out of scope.
- **Multiple templates beyond note-taker:** The template system supports multiple templates, but v1 ships with only `note-taker`.
- **Collection package scanning in discovery:** For now, forge-core is structured with the standard workspace directory layout (apps/, tasks/, etc.) and discovery scans it like any other workspace. Advanced "collection" package patterns are future work.
- **Template registry or remote template fetching:** Templates are bundled in the forge package. No remote template downloading.
- **Monorepo tooling (Turborepo, Nx, Lerna):** npm workspaces at the root level are sufficient.

---

## 4. User Stories

**US-1:** As a new forge user, I want to run `forge init --template note-taker` and immediately have a working agent project, so that I can see forge in action before building my own agent.

**US-2:** As an agent builder, I want to install `@clawforge/forge-core` and reference its components (e.g., `@clawforge/app-filesystem`) in my own roles and tasks, so that I don't have to rebuild common MCP integrations.

**US-3:** As an agent builder, I want to run `forge init --name @mycompany/my-agent` and have the generated package.json use that name, so that my project is ready to publish.

**US-4:** As an agent builder, I want `forge init` (with no `--template` flag) to show me a list of available templates to choose from, so that I can discover what's available.

**US-5:** As an agent operator, I want `forge install` to produce a Docker setup that uses the pre-built forge from my `node_modules`, so that the Docker build is fast and doesn't require compiling TypeScript.

---

## 5. Requirements

### P0 — Must-Have

**REQ-001: Monorepo Structure**

The forge repository becomes an npm workspace monorepo with two publishable packages:

| Package | Path | Description |
|---------|------|-------------|
| `@clawforge/forge` | Root (`./`) | CLI tool, resolver, proxy, generators |
| `@clawforge/forge-core` | `forge-core/` | Pre-built library of apps, tasks, skills, roles, agents |

The root `package.json` declares `"workspaces": ["forge-core"]`. The forge package remains at the repository root (no `packages/` restructuring).

Acceptance criteria:
- Given the repository root, when `npm install` is run, then both forge and forge-core dependencies are installed.
- Given forge-core is a workspace member, when `npm pack` is run in forge-core, then a valid `.tgz` tarball is produced containing all component directories.
- Given both packages are packed via `npm pack`, when the tgz files are installed in a fresh directory via `npm install <path>.tgz`, then both packages install correctly.

**REQ-002: forge-core Package**

`@clawforge/forge-core` is an npm package structured like a user's forge workspace. It contains pre-built forge components organized in the standard directory layout:

```
forge-core/
├── package.json
├── apps/
│   └── filesystem/
│       └── package.json      # @clawforge/app-filesystem
├── tasks/
│   └── take-notes/
│       ├── package.json      # @clawforge/task-take-notes
│       └── prompts/
│           └── take-notes.md
├── skills/
│   └── markdown-conventions/
│       ├── package.json      # @clawforge/skill-markdown-conventions
│       └── SKILL.md
├── roles/
│   └── writer/
│       └── package.json      # @clawforge/role-writer
└── agents/
    └── note-taker/
        └── package.json      # @clawforge/agent-note-taker
```

Each sub-component has its own `package.json` with a unique `name` (e.g., `@clawforge/app-filesystem`) and a `forge` field. These names are used by forge's resolver for cross-package references. No npm-level `dependencies` exist between sub-components — references are purely forge-field references resolved by forge's discovery system.

forge-core requires no build step. It is JSON, markdown, and prompt files only.

Acceptance criteria:
- Given forge-core is installed in a user's project, when `discoverPackages()` runs, then all sub-components are discovered by name.
- Given a user creates a local role that references `@clawforge/app-filesystem` in its permissions, when `resolveAgent()` runs, then the app resolves from within forge-core.
- Given a user creates a local `apps/filesystem/` package also named `@clawforge/app-filesystem`, when discovery runs, then the local version takes precedence over forge-core's version.

**REQ-003: Discovery Enhancement — Scan Installed Packages**

`discoverPackages()` in `src/resolver/discover.ts` is enhanced to scan inside installed npm packages that contain forge workspace directories (`apps/`, `tasks/`, `skills/`, `roles/`, `agents/`). When scanning `node_modules`, if a top-level package directory contains any of these subdirectories, their contents are scanned for forge packages (same as workspace directory scanning).

Workspace-local packages (in the user's own `apps/`, `tasks/`, etc.) still take precedence over packages found in node_modules.

Acceptance criteria:
- Given `@clawforge/forge-core` is installed in `node_modules`, when `discoverPackages()` runs, then `@clawforge/app-filesystem`, `@clawforge/task-take-notes`, `@clawforge/skill-markdown-conventions`, `@clawforge/role-writer`, and `@clawforge/agent-note-taker` are all discovered.
- Given a package in node_modules has an `apps/foo/` subdirectory with a valid forge package.json, when discovery runs, then that app is registered in the package map.
- Given a local `apps/filesystem/` package named `@clawforge/app-filesystem` exists AND `@clawforge/forge-core` also contains `@clawforge/app-filesystem`, when discovery runs, then the local version is in the map (workspace precedence preserved).

**REQ-004: Templates Directory**

Template directories are bundled inside the `@clawforge/forge` package. Each template is a subdirectory of `templates/` containing files that `forge init` copies to the target directory.

```
templates/
└── note-taker/
    ├── package.json          # Pre-configured with @clawforge/forge-core dependency
    ├── agents/
    │   └── note-taker/
    │       └── package.json  # Local agent — name uses {{projectName}} scope
    └── roles/
        └── writer/
            └── package.json  # Local role — name uses {{projectName}} scope
```

The template includes local agent and role definitions (what the user customizes) while referencing forge-core for reusable components (apps, tasks, skills). Template component names use `{{projectName}}` placeholders so that after `forge init`, local components are scoped to the project (e.g., `@test-forge/agent-note-taker`, `@test-forge/role-writer` when the project name is `test-forge`). The reusable building blocks from forge-core keep their `@clawforge/*` names.

Templates are NOT npm packages — they are not built or published. They are file trees copied by `forge init`.

Acceptance criteria:
- Given the forge package is installed, when the templates directory is inspected, then `note-taker/` exists with all required files.
- Given the template's `package.json`, when read, then it lists `@clawforge/forge-core` as a dependency.
- Given the template's agent `package.json`, when read, then it references a local role, which in turn references `@clawforge/task-take-notes`, `@clawforge/skill-markdown-conventions`, and `@clawforge/app-filesystem`.

**REQ-005: `forge init` with Template Support**

The `forge init` command is enhanced with `--template <name>` and `--name <project-name>` options:

- `--template <name>`: Copy files from the named template into the target directory, then create the standard forge scaffold (`.forge/`, config, .env.example, .gitignore). If not specified, display an interactive list of available templates for the user to choose from.
- `--name <name>`: Set the package name in the generated `package.json`. Defaults to the target directory's folder name.

After copying template files and generating the scaffold, `forge init` runs `npm install` to install dependencies (including `@clawforge/forge-core`).

For local development and testing, the template's `package.json` can reference forge-core via a local `.tgz` path or `file:` reference instead of a registry version. The `forge init` flow works identically regardless of whether dependencies come from npm or local tarballs.

The `forge init` output includes updated next-step instructions reflecting the template's agent with the project-scoped name (e.g., `forge validate @test-forge/agent-note-taker` when the project name is `test-forge`).

Acceptance criteria:
- Given `forge init --template note-taker --name @acme/my-agent`, when run in an empty directory, then: (a) template files are copied, (b) `package.json` has `name: "@acme/my-agent"`, (c) `.forge/` directory is created, (d) `npm install` runs, (e) `node_modules/@clawforge/forge-core` exists.
- Given `forge init --template note-taker` with no `--name`, when run in `/tmp/test-forge/`, then `package.json` has `name: "test-forge"`.
- Given `forge init` with no `--template`, when run, then a list of available templates is displayed for the user to select.
- Given `forge init` runs successfully, when `forge list` is run in the same directory, then the template's agent and its dependency tree are shown.
- Given `@clawforge/forge-core` is referenced as a local `.tgz` in the template's `package.json`, when `npm install` runs, then the package installs correctly and discovery finds all components.

**REQ-006: Remove `example/` Directory**

The `example/` directory is removed from the repository. Its contents are migrated to:
- Component definitions → `forge-core/` (with `@clawforge/*` naming)
- Directory structure pattern → `templates/note-taker/`

Existing tests that reference `example/` are updated to use `forge-core/` or appropriate test fixtures.

Acceptance criteria:
- Given the repository, when inspected, then no `example/` directory exists.
- Given existing tests, when run, then all pass without referencing `example/`.

**REQ-007: Simplified Proxy Dockerfile**

`generateProxyDockerfile()` is updated to use the pre-built forge package from the user's `node_modules` instead of building from source. The multi-stage builder is removed.

The new Dockerfile:
- Copies the installed `@clawforge/forge` package (already compiled) from the workspace
- Copies the workspace's component packages and their node_modules dependencies
- Uses `node /app/forge/bin/forge.js` as the entrypoint
- Runs as the `node` user (non-root)

The `forge install` command is updated to:
- Stop copying forge source files (`src/`, `tsconfig*.json`) into the build context
- Instead, copy the installed forge package from `node_modules/@clawforge/forge/`

Acceptance criteria:
- Given `forge install` is run, when the generated Dockerfile is inspected, then it has no `AS builder` stage and no `npm run build` step.
- Given the generated Dockerfile is built, when the container starts, then `forge proxy` runs correctly using the pre-built dist.
- Given the proxy container, when inspected, then it runs as the `node` user.

**REQ-008: Package Configuration**

The root `package.json` for `@clawforge/forge` includes `templates/` in its `files` array so templates are included when the package is published/packed.

The `forge-core/package.json` includes all component directories in its `files` array.

Acceptance criteria:
- Given `npm pack` is run for `@clawforge/forge`, when the resulting `.tgz` is inspected, then `templates/note-taker/` is included alongside `dist/` and `bin/`.
- Given `npm pack` is run for `@clawforge/forge-core`, when the resulting `.tgz` is inspected, then `apps/`, `tasks/`, `skills/`, `roles/`, `agents/` directories and their contents are included.
- Given both `.tgz` files exist, when installed in a fresh directory via `npm install <path>.tgz`, then both packages are usable without any registry access.

---

### P1 — Nice-to-Have

**REQ-009: Template Placeholder Substitution**

Templates support `{{projectName}}` placeholders in `package.json` files. During `forge init`, these are replaced with the project name (from `--name` or the directory name). This allows template component names to match the project (e.g., `@acme/agent-note-taker` instead of a generic name).

Acceptance criteria:
- Given a template file contains `{{projectName}}`, when `forge init --name @acme/my-agent` runs, then the output file contains `@acme/my-agent` in place of the placeholder.

**REQ-010: `forge init` Dependency Installation Selection**

When `forge init` installs dependencies, it detects and uses the appropriate package manager (npm, yarn, pnpm) based on lockfile presence or falls back to npm.

Acceptance criteria:
- Given a directory with `yarn.lock`, when `forge init` runs, then `yarn install` is used instead of `npm install`.

---

### P2 — Future Consideration

**REQ-011: Remote Template Registry**

Templates can be fetched from a remote registry or git URL, not just bundled locally.

**REQ-012: `forge create-component` Command**

A scaffolding command for creating new apps, tasks, skills, roles, or agents with the correct `package.json` structure.

**REQ-013: Collection Package Type**

A formal `forge.type = "collection"` package type that explicitly declares a package as a component library, with schema validation and enhanced discovery.

---

## 6. Architecture

### 6.1 Repository Structure (After)

```
/                                     # @clawforge/forge (root package)
├── package.json                      # workspaces: ["forge-core"]
├── src/                              # CLI + library source
├── bin/
├── dist/
├── templates/                        # Bundled in forge package
│   └── note-taker/
│       ├── package.json
│       ├── agents/
│       │   └── note-taker/
│       │       └── package.json
│       └── roles/
│           └── writer/
│               └── package.json
├── forge-core/                       # @clawforge/forge-core (workspace member)
│   ├── package.json
│   ├── apps/
│   │   └── filesystem/
│   ├── tasks/
│   │   └── take-notes/
│   ├── skills/
│   │   └── markdown-conventions/
│   ├── roles/
│   │   └── writer/
│   └── agents/
│       └── note-taker/
├── tests/
├── openspec/
└── ...
```

### 6.2 Package Dependency Graph

```
                           User's project
                           (/tmp/test-forge)
                                 │
                     ┌───────────┴───────────┐
                     ▼                       ▼
              @clawforge/forge        @clawforge/forge-core
              (CLI + library)         (component library)
                     │                       │
                     │                ┌──────┼──────┬──────┬──────┐
                     │                ▼      ▼      ▼      ▼      ▼
                     │             app-fs  task-   skill-  role-  agent-
                     │                     notes   md-conv writer note-taker
                     │
                     │    forge discovery scans:
                     │    1. Local workspace dirs (apps/, tasks/, ...)
                     │    2. node_modules packages with workspace dirs
                     │       └── finds forge-core's sub-components
                     │    3. node_modules top-level packages with forge fields
                     ▼
              forge resolve + validate + install
```

### 6.3 Discovery Flow (Enhanced)

```
discoverPackages(rootDir)
  │
  ├─1─ Scan workspace directories (apps/, tasks/, skills/, roles/, agents/)
  │    └── Each subdir with package.json + forge field → register by name
  │
  ├─2─ Scan node_modules (existing behavior)
  │    └── For each package (incl. scoped):
  │         ├── Has forge field? → register by name (if not already found)
  │         └── Has workspace dirs (apps/, tasks/, etc.)? ──── NEW
  │              └── Scan each workspace dir for forge sub-packages
  │                   └── Register by name (if not already found)
  │
  └── Return Map<name, DiscoveredPackage>
```

### 6.4 `forge init` Flow

```
forge init [--template <name>] [--name <project-name>]
  │
  ├─1─ Resolve template
  │    ├── --template provided → look up templates/<name>/
  │    └── --template not provided → list templates, prompt user to choose
  │
  ├─2─ Resolve project name
  │    ├── --name provided → use as-is
  │    └── --name not provided → use basename of target directory
  │
  ├─3─ Copy template files to target directory
  │    └── Replace {{projectName}} placeholders (P1)
  │
  ├─4─ Create forge scaffold
  │    ├── .forge/ directory
  │    ├── .forge/config.json
  │    ├── .forge/.env.example
  │    └── .gitignore
  │
  ├─5─ Generate/merge package.json
  │    ├── If template has package.json → use it (set name from step 2)
  │    └── Add workspaces: ["apps/*", "tasks/*", "skills/*", "roles/*", "agents/*"]
  │
  ├─6─ Run npm install
  │    └── Installs @clawforge/forge-core and other template deps
  │
  └─7─ Print success + next steps
       ├── forge list
       ├── forge validate <agent>
       └── forge install <agent>
```

### 6.5 Simplified Proxy Dockerfile

**Before (multi-stage, builds from source):**
```dockerfile
FROM node:22-slim AS builder
WORKDIR /build
COPY forge/ ./forge/
RUN cd forge && npm ci --ignore-scripts && npm run build

FROM node:22-slim
WORKDIR /app
COPY --from=builder /build/forge/dist ./dist
COPY --from=builder /build/forge/bin ./bin
COPY --from=builder /build/forge/node_modules ./node_modules
COPY --from=builder /build/forge/package.json ./
COPY workspace/ ./workspace/
...
```

**After (single-stage, pre-built):**
```dockerfile
FROM node:22-slim
WORKDIR /app
COPY forge/ ./forge/
COPY workspace/ ./workspace/
RUN mkdir -p /home/node/data /logs && chown -R node:node /app /home/node/data /logs
USER node
WORKDIR /app/workspace
ENTRYPOINT ["node", "/app/forge/bin/forge.js"]
CMD ["proxy", "--agent", "<agentName>"]
```

The `forge install` command copies the pre-built `@clawforge/forge` from `node_modules` (which already has `dist/`, `bin/`, `node_modules/`, `package.json`) into the `forge/` build context directory. No source, no tsconfig, no compilation.

### 6.6 Template ↔ forge-core Relationship

```
Template (copied to user's project)        forge-core (installed via npm)
─────────────────────────────────          ───────────────────────────────
(in /tmp/test-forge/)                      (in node_modules/@clawforge/forge-core/)

agents/note-taker/                         agents/note-taker/
  name: @test-forge/agent-note-taker         name: @clawforge/agent-note-taker
  └── roles: [@test-forge/role-writer]       └── roles: [@clawforge/role-writer]
  (local override — takes precedence)             (shadowed by local version)

roles/writer/                              roles/writer/
  name: @test-forge/role-writer              name: @clawforge/role-writer
  └── tasks: [@clawforge/task-take-notes]    └── (same references)
  └── skills: [@clawforge/skill-md-conv]
  └── permissions:                           tasks/take-notes/
       @clawforge/app-filesystem: {...}      skills/markdown-conventions/
                                             apps/filesystem/
  (User customizes this locally)               (Reusable building blocks)
```

The template provides local agent + role definitions scoped to the project name (e.g., `@test-forge/*`). These shadow the identically-structured components in forge-core. The building blocks (apps, tasks, skills) come from forge-core via npm and keep their `@clawforge/*` names.

---

## 7. Open Questions

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| Q1 | Should `forge init` auto-run `npm install`, or just generate files and tell the user to install? Auto-install is smoother but opinionated. | Product | No |
| Q2 | Should template names support scope-like syntax (e.g., `forge init --template @clawforge/note-taker`) for future third-party templates? | Engineering | No |
| Q3 | Should the note-taker template's local agent/role use the project name in their package names (via placeholder substitution), or use fixed `@clawforge/*` names? | Product | Yes |
| Q4 | How should existing tests that use `example/` be migrated — point them at `forge-core/` directly, or create isolated test fixtures? | Engineering | No |

---

## 8. Timeline Considerations

### Phase 1: Repository Restructuring
- Create forge-core package with migrated components from example/
- Add workspace configuration to root package.json
- Update existing tests

### Phase 2: Discovery Enhancement
- Update `discoverPackages()` to scan inside node_modules packages with workspace dirs
- Add tests for the new discovery path

### Phase 3: Template System
- Create templates/note-taker/ with local agent + role definitions
- Enhance `forge init` with `--template` and `--name` options
- Add template listing / interactive selection
- Bundle templates in forge package (`files` array)

### Phase 4: Dockerfile Simplification
- Rewrite `generateProxyDockerfile()` — remove multi-stage build
- Update `forge install` to copy pre-built forge from node_modules
- Update related tests

### Phase 5: End-to-End Validation
- Build and pack both packages to local `.tgz` files via `npm pack`
- Test full flow in a temp directory using only local tgz installs:
  `npm install <forge.tgz>` → `forge init --template note-taker` → `forge validate` → `forge list` → `forge install`
- Remove `example/` directory
- Update documentation
