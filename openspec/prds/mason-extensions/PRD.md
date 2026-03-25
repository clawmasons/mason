# Mason Extensions — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** ClawForge, Inc.

---

## 1. Problem Statement

The mason monorepo currently bundles agent implementations (claude-code-agent, pi-coding-agent, codex-agent) and role/skill definitions (mason-roles) alongside core infrastructure (agent-sdk, shared, cli, proxy). This creates several problems:

- **Tight coupling:** Agent packages are hardcoded imports in the CLI (`import claudeCodeAgent from "@clawmasons/claude-code-agent"`). Adding or removing an agent requires modifying the mason CLI source code.
- **Monorepo bloat:** Agent implementations and role definitions change independently from core mason infrastructure but share the same release cycle, build pipeline, and version bumping.
- **Contributor friction:** Contributors working on agents must clone and build the entire mason monorepo, including infrastructure they don't need.
- **No extensibility model:** There is no mechanism for third-party or project-local agent packages to be discovered and used by mason without modifying the CLI source.

---

## 2. Goals

### User Goals
- Agent developers can work in the `mason-extensions` repo independently of core mason development.
- Roles and skills can be authored, packaged, and published from `mason-extensions`.
- Mason CLI discovers installed agent packages dynamically — no hardcoded imports required.

### Business Goals
- Decouple agent release cadence from core mason releases.
- Establish `mason-extensions` as the standard home for first-party agent and role packages.
- Enable a future ecosystem where third-party agents are discovered the same way as first-party ones.

### Measurable Outcomes
- All agent packages (`@clawmasons/claude-code-agent`, `@clawmasons/pi-coding-agent`, `@clawmasons/codex-agent`) build and publish from `mason-extensions`.
- Mason CLI discovers and uses agents installed via `npm install` without any hardcoded agent imports.
- Roles in `mason-extensions` can be packaged using `mason package` via `../mason/scripts/mason.js`.
- `packages/agents/`, `packages/claude-code-agent/`, `packages/pi-coding-agent/`, and `packages/mason-roles/` are removed from the mason repo.

---

## 3. Non-Goals

- **Removing agent-sdk or shared from mason:** These core packages remain in the mason monorepo. Extensions reference them via relative `file:` paths during development and published npm versions in production.
- **Changing agent-sdk API:** The `AgentPackage` interface and related types remain unchanged. This is a packaging/discovery change, not an API change.
- **Third-party agent ecosystem:** While dynamic discovery enables third-party agents in the future, this PRD only covers moving first-party agents. No marketplace, registry, or documentation for third-party agent authoring.
- **Moving mcp-agent:** `@clawmasons/mcp-agent` stays in the mason monorepo for testing purposes.
- **Changing how agents work at runtime:** Agent materialization, Docker builds, ACP, and runtime behavior are unchanged.

---

## 4. User Stories

**US-1:** As an agent developer, I want to clone `mason-extensions` and develop agents without needing to build the full mason monorepo, so that I can iterate quickly on agent-specific code.

**US-2:** As a mason user, I want to `npm install @clawmasons/claude-code-agent` and have mason automatically discover and use it, so that I don't need to modify any configuration or source code.

**US-3:** As a role author, I want to create roles and skills in `mason-extensions` and package them using `mason package`, so that roles are distributable npm packages.

**US-4:** As a mason maintainer, I want agent packages removed from the mason monorepo, so that the core repo is focused on infrastructure (SDK, CLI, proxy, shared).

**US-5:** As a CI/CD pipeline, I want `mason-extensions` to independently build, test, and publish agent packages to npm, so that agent releases don't require a mason core release.

---

## 5. Requirements

### P0 — Must-Have

**REQ-001: mason-extensions Repository Structure**

`mason-extensions` is an independent npm workspace monorepo at `../mason-extensions` (relative to the mason repo root). It has its own `package.json`, build scripts, and publishing pipeline.

```
mason-extensions/
├── package.json                    # workspaces: ["agents/*", "roles/*", "skills/*"]
├── tsconfig.json
├── agents/
│   ├── claude-code-agent/          # Moved from mason/packages/claude-code-agent
│   │   ├── package.json            # @clawmasons/claude-code-agent
│   │   ├── src/
│   │   └── tests/
│   ├── pi-coding-agent/            # Moved from mason/packages/pi-coding-agent
│   │   ├── package.json            # @clawmasons/pi-coding-agent
│   │   ├── src/
│   │   └── tests/
│   └── codex-agent/                # Moved from mason/packages/agents/codex-agent
│       ├── package.json            # @clawmasons/codex-agent
│       ├── src/
│       └── tests/
├── roles/
│   ├── configure-project/          # Moved from mason/packages/mason-roles/roles/
│   └── security/
└── skills/
    ├── change-role-plan/           # Moved from mason/packages/mason-roles/skills/
    ├── create-role-plan/
    └── define-initial-roles/
```

Acceptance criteria:
- Given `mason-extensions/`, when `npm install` is run, then all workspace packages install correctly.
- Given the workspace, when `npm run build` is run, then all agent packages compile successfully.
- Given the workspace, when `npm run test` is run, then all agent and role tests pass.

**REQ-002: Dependency Linking to Mason Core**

Agent packages in `mason-extensions` depend on `@clawmasons/agent-sdk` and `@clawmasons/shared` from the mason repo. During development, these are referenced via relative `file:` paths. For publishing, version-pinned npm references are used.

Development `package.json` (each agent):
```json
{
  "dependencies": {
    "@clawmasons/agent-sdk": "file:../../mason/packages/agent-sdk",
    "@clawmasons/shared": "file:../../mason/packages/shared"
  }
}
```

The publish pipeline replaces `file:` references with the corresponding npm version before publishing.

Acceptance criteria:
- Given an agent package with `file:` dependencies, when `npm install` is run in `mason-extensions`, then `@clawmasons/agent-sdk` and `@clawmasons/shared` resolve to the local mason repo copies.
- Given the agent is published to npm, when a user installs it, then it depends on published `@clawmasons/agent-sdk` and `@clawmasons/shared` versions (no `file:` references in published package).

**REQ-003: Version-Locked Auto-Install via `.mason/node_modules`**

Mason manages agent and role packages in a project-local `.mason/node_modules` directory, separate from the project's own `node_modules`. This keeps mason extension dependencies isolated from the user's project.

**Version pinning:** All extension packages in `.mason/package.json` are pinned to the CLI's version using tilde ranges (`~`), which allow patch updates but not minor/major bumps. For example, if the CLI is version `0.2.1`, agents are pinned as `~0.2.1` (accepts `0.2.x` but not `0.3.0`).

**Auto-install flow (agents):** When a user runs `mason run --agent claude`:
1. The CLI resolves the agent name to an npm package name (e.g., `claude` → `@clawmasons/claude-code-agent`).
2. If `.mason/package.json` doesn't exist, it is auto-created.
3. The CLI writes/updates the agent's dependency in `.mason/package.json` with a tilde pin matching the CLI version (e.g., `"@clawmasons/claude-code-agent": "~0.2.1"`).
4. The CLI runs `npm update` scoped to `.mason/`, which installs or updates the agent to the latest compatible patch version.
5. The agent is dynamically imported from `.mason/node_modules/` and registered.

**Auto-install flow (roles):** The same mechanism applies when resolving a role by package name. If a role references a package (e.g., `@clawmasons/role-configure-project`) that isn't found locally, mason writes the dependency to `.mason/package.json` with the CLI's tilde-pinned version and runs `npm update`.

**Version sync on every run:** Each time the CLI runs, it updates _all_ extension dependencies in `.mason/package.json` to use the CLI's current tilde version, then runs `npm update`. This ensures extensions stay in lockstep with the CLI across upgrades. For example, upgrading the CLI from `0.1.6` to `0.2.1` causes all entries to change from `~0.1.6` to `~0.2.1`, and `npm update` pulls the matching versions.

**Discovery mechanism:**
1. **Built-in agents:** `mcp-agent` remains a hardcoded built-in (stays in mason).
2. **Installed agents:** Scan `.mason/node_modules/` for packages whose `package.json` contains a `mason.type: "agent"` field. Dynamically import each agent's entrypoint and register the `AgentPackage`.
3. **Auto-install on demand:** If `--agent <name>` is specified and not found in built-ins or `.mason/node_modules/`, resolve the npm package name, add to `.mason/package.json` with tilde pin, run `npm update`, then load.
4. **Config-declared agents:** Existing `.mason/config.json` agent declarations continue to work (already implemented).

The CLI removes direct imports of `@clawmasons/claude-code-agent`, `@clawmasons/pi-coding-agent`, and `@clawmasons/codex-agent` from its source code and `package.json`.

`.mason/` directory structure:
```
.mason/
├── package.json              # {"dependencies": {"@clawmasons/claude-code-agent": "~0.2.1"}}
├── package-lock.json
├── node_modules/
│   └── @clawmasons/
│       ├── claude-code-agent/
│       │   ├── package.json  # has mason.type: "agent"
│       │   └── dist/
│       └── role-configure-project/
│           └── ...           # auto-installed role package
├── config.json               # existing mason config (unchanged)
└── ...
```

Acceptance criteria:
- Given a user runs `mason run --agent claude` for the first time (CLI v0.2.1), then `.mason/package.json` is created with `"@clawmasons/claude-code-agent": "~0.2.1"`, `npm update` installs it, and the run proceeds.
- Given an agent is already installed in `.mason/node_modules/`, when `mason run --agent claude` is run again, then `npm update` is run (picking up any new patch releases) and the cached/updated package is used.
- Given the CLI is upgraded from `0.1.6` to `0.2.1`, when any mason command runs, then all dependencies in `.mason/package.json` are rewritten from `~0.1.6` to `~0.2.1` and `npm update` pulls the matching versions.
- Given a role references `@clawmasons/role-configure-project` by package name, when mason resolves the role, then the package is auto-installed to `.mason/node_modules/` with the CLI's tilde-pinned version.
- Given the mason CLI `package.json`, when inspected, then it has no dependencies on `@clawmasons/claude-code-agent`, `@clawmasons/pi-coding-agent`, or `@clawmasons/codex-agent`.
- Given `.mason/` does not exist, when an agent or role triggers auto-install, then `.mason/package.json` is created automatically.

**REQ-004: Agent Package Convention**

Agent packages declare themselves as mason agents via a `mason` field in their `package.json`:

```json
{
  "name": "@clawmasons/claude-code-agent",
  "mason": {
    "type": "agent",
    "entrypoint": "./dist/index.js"
  }
}
```

The `entrypoint` field points to the module that default-exports an `AgentPackage` object (the existing pattern). This field is used by the dynamic discovery mechanism to load the agent from `.mason/node_modules/`.

Agent name resolution for auto-install:
- `claude` or `claude-code` → `@clawmasons/claude-code-agent`
- `pi` or `pi-coding` → `@clawmasons/pi-coding-agent`
- `codex` → `@clawmasons/codex-agent`
- Full package name (e.g., `@mycompany/custom-agent`) → used as-is

Acceptance criteria:
- Given an agent package with a `mason.type: "agent"` field installed in `.mason/node_modules/`, when the discovery mechanism runs, then the agent is loaded and registered.
- Given an npm package without a `mason` field in `.mason/node_modules/`, when the discovery mechanism runs, then it is ignored.
- Given `mason run --agent claude`, when the CLI resolves the name, then it maps to `@clawmasons/claude-code-agent` for auto-install.

**REQ-005: mason.js Script Linking**

`mason-extensions` can invoke mason CLI commands via `../mason/scripts/mason.js`. This is used for role packaging and validation during development.

A convenience script in `mason-extensions/package.json`:
```json
{
  "scripts": {
    "mason": "node ../mason/scripts/mason.js",
    "build:roles": "node ../mason/scripts/mason.js package"
  }
}
```

Acceptance criteria:
- Given `mason-extensions/`, when `npm run mason -- validate` is run, then it executes the mason CLI from the linked mason repo.
- Given a role in `mason-extensions/roles/`, when `npm run build:roles` is run, then the role is packaged into a distributable artifact.

**REQ-006: Remove Moved Packages from Mason**

After agents and roles are moved to `mason-extensions`, the following are removed from the mason repo:

- `packages/claude-code-agent/` — entire directory
- `packages/pi-coding-agent/` — entire directory
- `packages/agents/codex-agent/` — entire directory (and `packages/agents/` if empty)
- `packages/mason-roles/` — entire directory

The mason root `package.json` is updated:
- Remove `packages/agents/*` from workspaces
- Remove agent packages from the build script order
- Remove agent packages from the publish script's package list

The CLI source (`packages/cli/src/materializer/role-materializer.ts`) removes hardcoded imports of moved agents.

Acceptance criteria:
- Given the mason repo after removal, when `npm install && npm run build` is run, then it succeeds without errors.
- Given the mason repo after removal, when `npm run test` is run (unit tests), then all tests pass.
- Given the mason repo, when inspected, then none of the removed directories exist.

**REQ-007: mason-extensions Build System**

`mason-extensions` has its own TypeScript build configuration and build scripts.

```json
{
  "scripts": {
    "build": "tsc -b agents/claude-code-agent agents/pi-coding-agent agents/codex-agent",
    "test": "vitest run",
    "lint": "eslint agents/*/src/ agents/*/tests/",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf agents/*/dist agents/*/*.tsbuildinfo"
  }
}
```

Each agent's `tsconfig.build.json` references the shared and agent-sdk type declarations from the mason repo via the `file:` path resolution.

Acceptance criteria:
- Given `mason-extensions/`, when `npm run build` is run, then all agent packages compile to `dist/`.
- Given `mason-extensions/`, when `npm run lint` is run, then linting passes.
- Given `mason-extensions/`, when `npm run typecheck` is run, then type-checking passes.

**REQ-008: mason-extensions Publishing Pipeline**

Agent packages in `mason-extensions` are published to npm independently of mason core. The publishing pipeline:

1. Validates clean git tree and npm auth.
2. Replaces `file:` dependency references with version-pinned npm references.
3. Bumps versions using changesets (or similar).
4. Builds all packages.
5. Publishes to npm.
6. Restores `file:` references for development.

Acceptance criteria:
- Given a clean `mason-extensions` repo, when the publish script is run, then all agent packages are published to npm with correct version-pinned dependencies.
- Given published agent packages, when installed in a fresh project alongside `@clawmasons/mason`, then mason discovers and uses them correctly.

---

### P1 — Nice-to-Have

**REQ-009: Agent Discovery Scoping**

The dynamic discovery mechanism supports configurable scopes beyond `@clawmasons/`. A `.mason/config.json` setting allows specifying additional npm scopes to scan for agent packages:

```json
{
  "agentScopes": ["@clawmasons", "@mycompany"]
}
```

Acceptance criteria:
- Given `agentScopes` includes `@mycompany`, when a package `@mycompany/custom-agent` with `mason.type: "agent"` is installed, then it is discovered and registered.

**REQ-010: Shared Test Fixtures**

Agent tests in `mason-extensions` can import shared test fixtures from `@clawmasons/agent-sdk/testing`. The `file:` path resolution ensures test utilities are available during development.

Acceptance criteria:
- Given an agent test in `mason-extensions`, when it imports from `@clawmasons/agent-sdk/testing`, then test helpers (e.g., `copyFixtureWorkspace`, `masonExec`) are available.

---

### P2 — Future Consideration

**REQ-011: Third-Party Agent Authoring Guide**

Documentation and templates for third-party developers to create their own mason agent packages that are automatically discovered.

**REQ-012: Agent Package Template**

A `mason init --agent` command that scaffolds a new agent package with the correct structure, `mason` field, and `AgentPackage` boilerplate.

**REQ-013: Role Auto-Install Convention**

Role packages use the same `mason` field convention as agents (`mason.type: "role"`) and are auto-installed to `.mason/node_modules/` when resolved by package name. Publishing roles from `mason-extensions` follows the same pipeline as agents.

---

## 6. Architecture

### 6.1 Repository Layout (After)

```
Projects/clawmasons/
├── mason/                              # Core mason monorepo
│   ├── packages/
│   │   ├── agent-sdk/                  # @clawmasons/agent-sdk (stays)
│   │   ├── shared/                     # @clawmasons/shared (stays)
│   │   ├── cli/                        # @clawmasons/mason (stays, agents removed)
│   │   ├── proxy/                      # @clawmasons/proxy (stays)
│   │   ├── mcp-agent/                  # @clawmasons/mcp-agent (stays for testing)
│   │   ├── agent-entry/                # @clawmasons/agent-entry (stays)
│   │   └── tests/                      # (stays)
│   └── scripts/
│       └── mason.js                    # CLI entrypoint
│
└── mason-extensions/                   # Extensions monorepo (new)
    ├── package.json                    # Independent workspace
    ├── agents/
    │   ├── claude-code-agent/          # @clawmasons/claude-code-agent
    │   ├── pi-coding-agent/            # @clawmasons/pi-coding-agent
    │   └── codex-agent/                # @clawmasons/codex-agent
    ├── roles/
    │   ├── configure-project/
    │   └── security/
    └── skills/
        ├── change-role-plan/
        ├── create-role-plan/
        └── define-initial-roles/
```

### 6.2 Dependency Graph

```
mason-extensions/agents/*                    (development repo)
    │
    ├── file:../../mason/packages/agent-sdk   (dev, file: path)
    │   └── @clawmasons/agent-sdk@^x.y.z     (published to npm)
    │
    └── file:../../mason/packages/shared      (dev, file: path)
        └── @clawmasons/shared@^x.y.z        (published to npm)

mason/packages/cli                           (core repo)
    │
    ├── @clawmasons/agent-sdk                 (workspace)
    ├── @clawmasons/shared                    (workspace)
    ├── @clawmasons/mcp-agent                 (workspace, built-in)
    │
    └── Runtime discovery from .mason/node_modules/:
        ├── @clawmasons/claude-code-agent     (auto-installed, ~CLI_VERSION)
        ├── @clawmasons/pi-coding-agent       (auto-installed, ~CLI_VERSION)
        └── @clawmasons/role-configure-project (auto-installed on role resolve)
```

### 6.3 Version-Locked Auto-Install & Discovery Flow

```
mason run --agent claude (CLI v0.2.1)
  │
  ├─1─ Register built-in agents
  │    └── mcp-agent (hardcoded, stays in mason)
  │
  ├─2─ Scan .mason/node_modules/ for agent packages
  │    ├── List dirs in .mason/node_modules/@clawmasons/
  │    ├── For each: read package.json
  │    │   └── Has mason.type === "agent"?
  │    │       └── Yes: dynamic import(entrypoint) → register AgentPackage
  │    └── Agent found? → proceed to step 4
  │
  ├─3─ Auto-install if not found                           ── NEW
  │    ├── Resolve "claude" → "@clawmasons/claude-code-agent"
  │    ├── Ensure .mason/package.json exists (auto-create if needed)
  │    ├── Write/update dep: "@clawmasons/claude-code-agent": "~0.2.1"
  │    ├── Run: npm update --prefix .mason/
  │    └── Re-scan .mason/node_modules/ → register agent
  │
  ├─4─ Version sync on every run                           ── NEW
  │    ├── Read .mason/package.json dependencies
  │    ├── Rewrite ALL entries to use ~{CLI_VERSION}
  │    │   e.g., "~0.1.6" → "~0.2.1" (if CLI upgraded)
  │    └── Run: npm update --prefix .mason/
  │
  ├─5─ Load config-declared agents                         ── EXISTING
  │    └── .mason/config.json agent declarations
  │
  └── Return Map<name, AgentPackage>


Role resolution with auto-install:
  resolveRole("@clawmasons/role-configure-project")
    │
    ├── Not found locally in project roles/
    ├── Check .mason/node_modules/ → not found
    ├── Write dep: "@clawmasons/role-configure-project": "~0.2.1"
    ├── npm update --prefix .mason/
    └── Load role from .mason/node_modules/
```

### 6.4 CLI Import Changes

**Before (hardcoded):**
```typescript
// packages/cli/src/materializer/role-materializer.ts
import claudeCodeAgent from "@clawmasons/claude-code-agent";
import piCodingAgent from "@clawmasons/pi-coding-agent";
import codexAgent from "@clawmasons/codex-agent";
import { default as mcpAgent } from "@clawmasons/mcp-agent/agent-package";

const registry = await createAgentRegistry(
  [claudeCodeAgent, piCodingAgent, codexAgent, mcpAgent],
  projectDir
);
```

**After (dynamic, .mason/node_modules):**
```typescript
// packages/cli/src/materializer/role-materializer.ts
import { default as mcpAgent } from "@clawmasons/mcp-agent/agent-package";

const registry = await createAgentRegistry(
  [mcpAgent],   // only built-ins
  projectDir    // discovery scans .mason/node_modules/ + auto-installs + config
);
```

### 6.5 Role Packaging Flow

```
mason-extensions/roles/configure-project/
    │
    └── npm run build:roles
        └── node ../mason/scripts/mason.js package
            └── Produces: build/clawmasons-role-configure-project-x.y.z.tgz
```

---

## 7. Open Questions

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| Q1 | Should the `mason` field convention (`mason.type: "agent"`) be documented in agent-sdk or kept internal for now? | Engineering | No |
| Q2 | Should `mason-extensions` e2e tests run against a built mason CLI, or only unit/integration tests? | Engineering | Yes |
| Q3 | Should the publish pipeline use changesets (like mason) or a simpler script? | Engineering | No |
| Q4 | Should `npm update` be run on every CLI invocation or only when the CLI version has changed since last run (cached in `.mason/.cli-version`)? | Engineering | No |
| Q5 | Should `.mason/node_modules/` be added to `.gitignore` by default when `.mason/` is initialized? | Engineering | Yes |
