# Agent Roles — Implementation Plan

**PRD:** [PRD.md](./PRD.md)
**Status:** In Progress (Changes 1–4 complete)
**Date:** March 2026

---

## Overview

This plan implements the "Roles as primary deployable unit" refactor. Roles replace agents as the top-level composition and deployment unit. A role is defined by a `ROLE.md` file (or an NPM package), loaded into a generic `ROLE_TYPES` in-memory representation, and materialized for any supported agent runtime.

Changes are ordered by dependency — each builds on the prior ones and produces a testable output before the next begins.

### Transformation Summary
```
Before: Agent wraps Role → run agent
After:  ROLE.md → ROLE_TYPES → materialize for any agent runtime → run
```

### Key Architectural Layers
| Layer | Purpose |
|---|---|
| ROLE_TYPES (Change 1) | Generic in-memory type system for all role data |
| ROLE.md Parser (Change 2) | Parse local ROLE.md files into ROLE_TYPES |
| readPackagedRole (Change 3) | Load NPM packages into ROLE_TYPES |
| Adapter (Change 4) | Bridge ROLE_TYPES to existing ResolvedAgent materializers |
| Discovery (Change 5) | Find and merge roles from all sources |
| Materializer (Change 6) | Accept ROLE_TYPES input via adapter |
| Docker + Ignore (Change 7) | Role-centric Docker build dirs, volume masking |
| CLI (Change 8) | `clawmasons run <agent-type> --role <name>` |
| Mason Skill (Change 9) | Scan project, propose ROLE.md |
| Monorepo Gen (Change 10) | `mason init-repo --role <name>` |
| Dead Code + Specs (Change 11) | Remove `agent` package type, update all specs |
| E2E Tests (Change 12) | Update e2e tests for role-based pipeline |
| Documentation (Change 13) | Update README, e2e README, DEVELOPMENT.md |

---

# Implementation Steps

## CHANGE 1: ROLE_TYPES Core Type System

Define the generic in-memory type system that all role sources normalize into. This is the canonical intermediate representation between ROLE.md files, NPM packages, and agent materializations.

**PRD refs:** §5 (ROLE_TYPES — In-Memory Type System), §5.1 (Design Goals), §5.2 (Core Types)

**Summary:** Create new TypeScript interfaces and Zod schemas in `packages/shared/` for the ROLE_TYPES type system: `RoleType`, `RoleMetadata`, `TaskRef`, `AppConfig`, `SkillRef`, `ContainerRequirements`, `GovernanceConfig`, `ResourceFile`, `RoleSource`, `MountConfig`, `ToolPermissions`. These types are agent-agnostic — they use generic names (`tasks`, `apps`, `skills`) not tied to any runtime. `ResourceFile` tracks absolute filesystem paths but never loads file content into memory. All types must support bidirectional construction (from local ROLE.md and from NPM packages).

**Scope:**
- New: `packages/shared/src/schemas/role-types.ts` — Zod schemas for all ROLE_TYPES
- New: `packages/shared/src/types/role-types.ts` — TypeScript interfaces inferred from schemas
- Export from `packages/shared/src/index.ts`
- New tests: schema validation for all types (valid construction, required fields, defaults, rejection of invalid values)

**User Story:** As a developer building the role parser or materializer, I import `RoleType` from `@clawmasons/shared` and get full type safety and runtime validation for the generic role representation.

**Testable output:** Zod schemas validate well-formed ROLE_TYPES objects. Required fields are enforced. Optional fields default correctly. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Implemented** — Branch: `role-types-core-type-system`

**Artifacts:**
- Spec: [openspec/specs/role-types-core-type-system/spec.md](../../specs/role-types-core-type-system/spec.md)
- Archive: [openspec/changes/archive/2026-03-12-role-types-core-type-system/](../../changes/archive/2026-03-12-role-types-core-type-system/)
  - [proposal.md](../../changes/archive/2026-03-12-role-types-core-type-system/proposal.md)
  - [design.md](../../changes/archive/2026-03-12-role-types-core-type-system/design.md)
  - [tasks.md](../../changes/archive/2026-03-12-role-types-core-type-system/tasks.md)

---

## CHANGE 2: ROLE.md Parser + Dialect Registry

Parse ROLE.md files (YAML frontmatter + markdown body) and normalize agent-specific field names to generic ROLE_TYPES using a dialect registry.

**PRD refs:** §4 (ROLE.md Specification), §4.1 (File Location), §4.2 (Frontmatter Schema), §4.3 (Bundled Resources), §4.5 (Dialect Mapping), §6.1 (Local Roles), Appendix B (Agent Dialect Registry)

**Summary:** Implement `readMaterializedRole(rolePath: string): RoleType` — the function that reads a local ROLE.md and produces a ROLE_TYPES object. Steps: (1) Detect the agent dialect from the parent directory (`.claude/` → Claude Code, `.codex/` → Codex, `.aider/` → Aider). (2) Parse YAML frontmatter and extract the markdown body as `instructions`. (3) Map agent-specific field names to generic names using the dialect registry (`commands` → `tasks`, `mcp_servers` → `apps`, `skills` → `skills`). (4) Resolve bundled resource paths (sibling files/directories) as `ResourceFile` entries with absolute paths. (5) Resolve dependency references — local paths resolved relative to project root, package names left as references.

Also implement the dialect registry: a lookup table mapping `{ directory → dialect → field mappings }` that new runtimes can extend by adding entries.

**Scope:**
- New: `packages/shared/src/role/dialect-registry.ts` — dialect field mappings (per Appendix B)
- New: `packages/shared/src/role/parser.ts` — `readMaterializedRole()`, YAML frontmatter parsing, field normalization
- New: `packages/shared/src/role/resource-scanner.ts` — scan role directory for bundled resources
- New tests: parse valid ROLE.md for each dialect, verify field normalization, verify resource discovery, reject malformed frontmatter

**User Story:** As a developer, I create `.claude/roles/create-prd/ROLE.md` with Claude-dialect frontmatter. The parser reads it, normalizes `commands` to `tasks` and `mcp_servers` to `apps`, discovers bundled resources, and returns a valid `RoleType`.

**Testable output:** Parser correctly handles Claude, Codex, and Aider dialects. Bundled resources are discovered with correct relative and absolute paths. Malformed YAML is rejected with clear errors. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Implemented** — Branch: `role-md-parser-dialect-registry`

**Artifacts:**
- Spec: [openspec/specs/role-md-parser-dialect-registry/spec.md](../../specs/role-md-parser-dialect-registry/spec.md)
- Archive: [openspec/changes/archive/2026-03-12-role-md-parser-dialect-registry/](../../changes/archive/2026-03-12-role-md-parser-dialect-registry/)
  - [proposal.md](../../changes/archive/2026-03-12-role-md-parser-dialect-registry/proposal.md)
  - [design.md](../../changes/archive/2026-03-12-role-md-parser-dialect-registry/design.md)
  - [tasks.md](../../changes/archive/2026-03-12-role-md-parser-dialect-registry/tasks.md)

---

## CHANGE 3: readPackagedRole() — Load NPM Packages into ROLE_TYPES

Load existing NPM role packages (from `node_modules/`) into the same ROLE_TYPES representation as local roles.

**PRD refs:** §6.2 (Packaged Roles), §6.3 (Equivalence)

**Summary:** Implement `readPackagedRole(packagePath: string): RoleType` — reads a role NPM package and constructs a ROLE_TYPES object. Steps: (1) Read `package.json` and verify `chapter.type === "role"`. (2) Read the bundled `ROLE.md` from the package directory. (3) Expect all dependencies (skills, apps, tasks) to already be installed in `node_modules/`. (4) Resolve all paths relative to the package's location. (5) Set `source.type = 'package'` and `source.packageName`. The output must be identical to a local role's ROLE_TYPES (except for the `source` field), ensuring local-to-package equivalence.

**Scope:**
- New: `packages/shared/src/role/package-reader.ts` — `readPackagedRole()`
- Modify: existing package resolution utilities to support `chapter.type = "role"` packages that contain ROLE.md
- New tests: load a mock NPM package with ROLE.md, verify ROLE_TYPES matches equivalent local parse (except `source`), verify dependency path resolution from node_modules

**User Story:** As a developer, I `npm install @acme/role-create-prd` and the system loads it into the same ROLE_TYPES as if I had the equivalent ROLE.md locally. I can run `clawmasons claude --role @acme/role-create-prd` and it works identically.

**Testable output:** `readPackagedRole` produces valid ROLE_TYPES. Source metadata is `type: 'package'`. Paths resolve correctly from node_modules. Missing ROLE.md in package throws clear error. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Implemented** — Branch: `read-packaged-role`

**Artifacts:**
- Spec: [openspec/specs/read-packaged-role/spec.md](../../specs/read-packaged-role/spec.md)
- Archive: [openspec/changes/archive/2026-03-12-read-packaged-role/](../../changes/archive/2026-03-12-read-packaged-role/)
  - [proposal.md](../../changes/archive/2026-03-12-read-packaged-role/proposal.md)
  - [design.md](../../changes/archive/2026-03-12-read-packaged-role/design.md)
  - [tasks.md](../../changes/archive/2026-03-12-read-packaged-role/tasks.md)

---

## CHANGE 4: RoleType-to-ResolvedAgent Adapter

Create a bridge layer that converts a `RoleType` into the existing `ResolvedAgent` shape so current materializers continue to work unchanged during the migration.

**PRD refs:** §5.3 (Transformation Pipeline), §7.2 (Agent Materializer)

**Summary:** Implement `adaptRoleToResolvedAgent(role: RoleType, agentType: string): ResolvedAgent` — a stateless function that maps ROLE_TYPES fields to the existing `ResolvedAgent` type that materializers already accept. This is the key migration bridge: it lets us introduce the new ROLE_TYPES pipeline without rewriting materializers immediately. The adapter maps `tasks` → resolved commands/instructions, `apps` → resolved MCP server configs, `skills` → resolved skills, `container` → container requirements, and `governance` → risk/constraints. The `agentType` parameter determines which dialect to emit (reverse of the parser's normalization).

**Scope:**
- New: `packages/shared/src/role/adapter.ts` — `adaptRoleToResolvedAgent()`
- New tests: round-trip test — parse ROLE.md → RoleType → adapt to ResolvedAgent → verify fields match what the materializer expects. Test for each supported agent type.

**User Story:** As the materializer, I receive a `ResolvedAgent` from the adapter and don't need to know whether it came from the old package resolution pipeline or the new ROLE_TYPES pipeline. Everything just works.

**Testable output:** Adapter produces valid `ResolvedAgent` from any `RoleType`. Round-trip from ROLE.md → ROLE_TYPES → ResolvedAgent preserves all fields. Each agent dialect produces correct agent-native field names. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Implemented** — Branch: `role-to-resolved-agent-adapter`

**Artifacts:**
- Spec: [openspec/specs/role-to-resolved-agent-adapter/spec.md](../../specs/role-to-resolved-agent-adapter/spec.md)
- Archive: [openspec/changes/archive/2026-03-12-role-to-resolved-agent-adapter/](../../changes/archive/2026-03-12-role-to-resolved-agent-adapter/)
  - [proposal.md](../../changes/archive/2026-03-12-role-to-resolved-agent-adapter/proposal.md)
  - [design.md](../../changes/archive/2026-03-12-role-to-resolved-agent-adapter/design.md)
  - [tasks.md](../../changes/archive/2026-03-12-role-to-resolved-agent-adapter/tasks.md)

---

## CHANGE 5: Unified Role Discovery

Find roles from all sources (local ROLE.md files + installed NPM packages), merge with precedence rules, and present a unified list of available roles.

**PRD refs:** §6 (Role Sources), §6.1 (Local Roles), §6.2 (Packaged Roles), §6.3 (Equivalence)

**Summary:** Implement `discoverRoles(projectDir: string): RoleType[]` — scans the project for all available roles and returns them as a unified list. Discovery sources in precedence order: (1) Local roles from `<project>/.<agent>/roles/*/ROLE.md` for each known agent directory. (2) Packaged roles from `node_modules/` where `chapter.type === "role"`. Local roles take precedence over packaged roles with the same name (enabling "eject and customize" workflow). Also implement `resolveRole(name: string, projectDir: string): RoleType` — resolves a single role by name using the same precedence rules.

**Scope:**
- New: `packages/shared/src/role/discovery.ts` — `discoverRoles()`, `resolveRole()`
- Uses: `readMaterializedRole()` from Change 2 and `readPackagedRole()` from Change 3
- New tests: discover local roles across multiple agent directories, discover packaged roles, verify local-over-package precedence, handle no roles found gracefully

**User Story:** As a developer, I run `clawmasons chapter list` and see all my locally-defined roles and installed package roles in one unified list, with local overrides clearly indicated.

**Testable output:** Discovery finds roles in `.claude/roles/`, `.codex/roles/`, `.aider/roles/`. Package roles from node_modules are included. Local roles shadow same-named package roles. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**

---

## CHANGE 6: Materializer Refactor — Accept RoleType Input

Modify existing agent materializers to accept `RoleType` input (via the adapter from Change 4) instead of requiring the old `ResolvedAgent` from the package resolver pipeline.

**PRD refs:** §7.2 (Agent Materializer), §5.3 (Transformation Pipeline)

**Summary:** Update the materializer entry points to accept a `RoleType` as their primary input. Internally, the materializer calls `adaptRoleToResolvedAgent()` to convert to the shape its existing generation logic expects. This is a thin wiring change — the generation logic itself does not change yet. The materializer can now be invoked from either the old pipeline (ResolvedAgent from package resolver) or the new pipeline (RoleType from ROLE.md parser or NPM reader). Add a `materializeForAgent(role: RoleType, agentType: string)` entry point that wraps the adapter call + existing materialization.

**Scope:**
- Modify: materializer entry points in `packages/cli/src/materializer/` to accept `RoleType` as alternative input
- New: `materializeForAgent(role: RoleType, agentType: string)` orchestration function
- New tests: materialize a RoleType for Claude Code, verify generated workspace matches expectations. Materialize same RoleType for Codex, verify correct dialect output.

**User Story:** As the CLI, I load a ROLE.md into ROLE_TYPES and pass it directly to `materializeForAgent('claude-code')`. The materializer generates the correct workspace without me needing to construct a ResolvedAgent manually.

**Testable output:** `materializeForAgent` produces correct Docker workspace from ROLE_TYPES input. Cross-agent materialization works (Claude role → Codex output). Output matches what the old pipeline produces for equivalent input. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**

---

## CHANGE 7: Docker Generation + Container Ignore

Generate role-centric Docker build directories and implement container ignore (volume masking) for paths specified in the role's `container.ignore` field.

**PRD refs:** §7.1 (Docker Build Directory), §7.3 (Container Ignore / Volume Masking), §7.4 (MCP Proxy Materialization), §7.5 (Session Directory)

**Summary:** Generate the Docker build directory at `.clawmasons/docker/<role-name>/` with the structure from PRD §7.1: agent subdirectory with Dockerfile + workspace, mcp-proxy subdirectory, and docker-compose.yaml. Implement volume masking for `container.ignore.paths`: directories are masked with named empty volumes, files are masked with read-only bind mounts of a sentinel empty file (`.clawmasons/empty-file`, `chmod 444`). The project tree is mounted read-only at `/home/mason/workspace/project/`. Volume masking targets only project mount paths — the materialized workspace at `/home/mason/workspace/` is unaffected since it occupies a separate path from the project mount. The proxy Dockerfile uses `node:22-slim` base with all framework packages (`@clawmasons/proxy`, `@clawmasons/shared`, etc.) pre-copied into `docker/node_modules/` by the existing `docker-init` command. The proxy runs as `clawmasons chapter proxy --agent <agentName> --transport streamable-http` and discovers its MCP server configuration from the resolved agent definition at startup (not from a static config file). Tool-level permissions are enforced by the `ToolRouter` using `ToolFilter` rules computed from the role's `apps[].tools.allow` and `apps[].tools.deny` declarations. Session directories are created at `.clawmasons/sessions/<session-id>/` with a self-contained compose file referencing the role's Docker build dir. The session directory must be a fully functional Docker Compose project — users can run `docker compose logs`, `docker compose ps`, `docker compose exec agent sh`, and `docker compose down` directly from the session directory for debugging and operational tasks. All build contexts, volume mounts, and environment variables must be resolvable from the session directory using relative paths.

**Scope:**
- Modify: Docker generation in `packages/cli/src/materializer/` to use role-centric build directory structure
- New: volume masking logic — detect directories vs files in ignore list, generate appropriate volume entries targeting `/home/mason/workspace/project/` paths only (materialized workspace at `/home/mason/workspace/` remains untouched)
- New: sentinel file creation (`.clawmasons/empty-file`)
- New: session directory creation with compose file generation
- Modify: docker-compose generation to include volume stacking for ignored paths
- Modify: proxy Dockerfile generation to use `@clawmasons/proxy` package from pre-populated `docker/node_modules/` (consistent with existing `docker-init` scaffolding in `packages/cli/src/cli/commands/docker-init.ts`)
- New tests: verify Docker build directory structure, verify volume masking for directories and files, verify masking only applies to project mount paths, verify sentinel file creation, verify session directory structure, verify session directory is a functional Docker Compose project (all paths resolvable)

**User Story:** As a developer, when I define `container.ignore.paths: ['.clawmasons/', '.claude/', '.env']` in my ROLE.md, the generated docker-compose masks those paths inside the container's project mount at `/home/mason/workspace/project/` — directories become empty volumes, files become empty file mounts. My secrets never enter the container. Meanwhile, the materialized `.claude/` workspace at `/home/mason/workspace/.claude/` (with settings.json, commands, etc.) remains fully accessible to the agent. I can also `cd` into the session directory and run `docker compose logs` or `docker compose exec agent sh` for debugging.

**Testable output:** Docker build directory matches PRD §7.1 structure. Volume masking correctly generates named volumes for directories and bind mounts for files, targeting project mount paths only. Sentinel file is created with correct permissions. Proxy Dockerfile uses `@clawmasons/proxy` from pre-populated node_modules. Session directory is created with valid, self-contained compose file (all paths resolvable from session dir). `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**

---

## CHANGE 8: CLI Command Refactor

Refactor the CLI to use `clawmasons run <agent-type> --role <name>` as the primary command structure. Replace the `agent` command with `run`. Remove the `agent` package type.

**PRD refs:** §8 (Running Roles), §8.1 (Local Role), §8.2 (Packaged Role), §8.3 (Startup Sequence), §9 (CLI Changes), §9.1 (Command Structure), §9.2 (Revised Command Reference), §9.3 (Package Type Changes)

**Summary:** Replace the existing `agent` CLI command with a `run` command. The `run` command takes an agent type as a positional argument (`claude`, `codex`, `aider`) followed by `--role <name>`. Additionally, implement shorthand support: if the CLI receives a top-level argument that doesn't match any known command but matches a registered agent type, treat it as `clawmasons run <agent-type> ...` (e.g., `clawmasons claude --role x` → `clawmasons run claude --role x`). The startup sequence becomes: (1) Load ROLE_TYPES via `resolveRole()` from Change 5. (2) Resolve dependencies. (3) Materialize Docker build directory via `materializeForAgent()` from Change 6. (4) Create session directory. (5) Docker Compose up (proxy). (6) Start credential service. (7) Docker Compose run agent. Remove the `agent` package type — its fields (`runtimes`, `proxy`, `resources`, `credentials`) are now part of the role definition. Update `chapter list` to show roles instead of agents. Add `--acp` flag for ACP server mode. When a role reference resolves to an npm package name not found in `node_modules/`, the CLI must exit with a clear error message and install instructions — it must **not** auto-install packages.

**Scope:**
- Modify: `packages/cli/src/cli/commands/run-agent.ts` — rename `agent` command to `run`, accept agent type as positional arg and `--role` flag
- Modify: CLI argument parsing for `clawmasons run <agent-type> --role <name>` and shorthand `clawmasons <agent-type> --role <name>`
- Add: top-level argument fallback — unknown commands checked against agent type registry before erroring
- Modify: startup sequence to use ROLE_TYPES pipeline (discover → load → materialize → session → run)
- Remove: `agent` package type support from schema and resolver
- Add: clear error message when packaged role not found in node_modules (with install instructions, no auto-install)
- Modify: `chapter list` to discover and display roles
- Modify: `chapter build` to materialize Docker dirs for all discovered roles
- Add: `chapter validate` command for role definition validation
- New tests: CLI accepts `clawmasons run claude --role create-prd`, shorthand `clawmasons claude --role create-prd` works equivalently, CLI rejects unknown agent types, `--acp` flag works, `chapter list` shows roles, missing packaged role produces clear error with install instructions

**User Story:** As a developer, I run `clawmasons run claude --role create-prd` and the system loads my role, materializes it for Claude Code, and starts the agent session. I no longer need to create agent wrapper packages. If I try to run a packaged role I haven't installed, I get a clear error telling me how to install it.

**Testable output:** CLI parses `run <agent-type> --role <name>` correctly. Startup sequence uses ROLE_TYPES pipeline end-to-end. `chapter list` shows local and packaged roles. Agent package type is removed. Missing packaged role exits with error and install instructions (no auto-install). `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**

---

## CHANGE 9: Mason Skill — Project Scanner and ROLE.md Proposer

Create a built-in skill that scans a project's existing configuration and proposes a ROLE.md capturing the current setup as a portable role definition.

**PRD refs:** §10 (Mason Skill), §10.1 (Purpose), §10.2 (Capabilities), §10.3 (Use Cases)

**Summary:** Create `skills/mason/SKILL.md` — an AI-powered skill that inventories a project's existing skills, commands/slash-commands, MCP server configurations, and CLI tools, then proposes a draft ROLE.md. Capabilities: (1) **Inventory** — scan for existing skills, commands, MCP configs, and CLI tool usage. (2) **Propose** — generate draft ROLE.md with frontmatter populated from discovered config, tool-level permissions from usage patterns, container requirements from tool dependencies, and system prompt from existing AGENTS.md. (3) **Restrict** — propose minimal command-line argument allowlists. Installable via `npx skill add mason`.

**Scope:**
- New: `skills/mason/SKILL.md` — skill definition with system prompt for project analysis
- New: `skills/mason/` supporting files (templates, examples) as needed
- New: scanner utilities for discovering project configuration
- New tests: verify scanner discovers skills, commands, MCP configs in a mock project; verify proposed ROLE.md is valid and parseable

**User Story:** As a developer with an existing Claude Code setup (commands, MCP servers, skills), I run mason and it proposes a ROLE.md that captures my current configuration. I review it, save it, and now my setup is portable.

**Testable output:** Mason skill is installable. Scanner discovers existing configuration. Proposed ROLE.md parses correctly with the Change 2 parser. Permissions are minimal (least-privilege). `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**

---

## CHANGE 10: Monorepo Generation

Generate a publishable npm monorepo from a local role definition, enabling distribution through package registries.

**PRD refs:** §11 (Monorepo Generation), §11.1 (Purpose), §11.2 (Command), §11.3 (Generated Structure), §11.4 (Distribution Workflow)

**Summary:** Implement `mason init-repo --role <name> [--target-dir <path>]` — generates a complete npm workspace monorepo from a local role definition. Default target: `.clawmasons/repositories/<role-name>/`. Generated structure includes: root `package.json` (private workspace config), `roles/<name>/` with `package.json` (`chapter.type = "role"`) and ROLE.md, plus separate workspace packages for each dependency — `skills/`, `apps/`, `tasks/` directories with independently publishable packages. The generated monorepo supports `npm publish --workspaces` for registry distribution and `npm pack --workspaces` for tarball distribution.

**Scope:**
- New: `packages/cli/src/commands/mason-init-repo.ts` — `mason init-repo` command
- New: monorepo generator that reads a local RoleType and creates the workspace structure
- New: package.json generators for each dependency type (role, skill, app, task)
- New tests: generate monorepo from mock role, verify directory structure matches PRD §11.3, verify all package.json files are valid, verify workspace configuration

**User Story:** As a platform engineer, I run `mason init-repo --role create-prd` and get a complete npm monorepo at `.clawmasons/repositories/create-prd/` with my role and all its dependencies as separate packages. I can `npm publish --workspaces` to share with my team.

**Testable output:** Generated monorepo matches PRD §11.3 structure. Root package.json has valid workspace config. Each sub-package has valid package.json with correct `chapter.type`. ROLE.md in the generated role package parses correctly. `npm pack --workspaces` succeeds (dry run). `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**


---

## CHANGE 11: Dead Code Removal and Spec Cleanup

Remove code, types, and configuration related to the deprecated `agent` package type and update all spec files to reflect the new role-centric architecture.

**PRD refs:** §9.3 (Package Type Changes), §3 (Design Principles — "Roles replace agents as the top-level unit")

**Summary:** With the role-based pipeline fully operational (Changes 1–10), remove all remnants of the old `agent` package type from the codebase. This includes: (1) Remove `agent` from the `chapter.type` enum in package schemas. (2) Remove agent-specific resolver and loader code that is no longer reachable. (3) Remove agent-related CLI scaffolding (e.g., `init-agent` templates, agent-specific validation). (4) Update all `spec.md` files in `openspec/` to reflect the new role-centric terminology — replace references to "agent packages" with "roles", update command examples from `clawmasons agent` to `clawmasons run`, and remove any spec sections describing the deprecated agent workflow. (5) Update README and any developer documentation that references the old agent package type.

**Scope:**
- Remove: `agent` from `chapter.type` enum in `packages/shared/src/schemas/`
- Remove: agent package resolver/loader code in `packages/cli/src/` that is no longer used
- Remove: agent-specific CLI templates and scaffolding
- Update: all `openspec/**/*.md` spec files — replace agent package references with role references
- Update: command examples throughout specs from `agent` to `run`
- New tests: verify `chapter.type = "agent"` is rejected by schema validation, verify no dead imports or references remain

**User Story:** As a developer working on the codebase, I no longer encounter confusing references to the deprecated `agent` package type. All specs, schemas, and code consistently use the role-centric model.

**Testable output:** No references to `chapter.type = "agent"` in schemas or code. All spec files use role-centric terminology. No dead code related to agent packages. `npx tsc --noEmit` compiles. `npx eslint src/ tests/` passes. `npx vitest run` passes.

**Not Implemented Yet**

---

## CHANGE 12: End-to-End Test Suite Update

Update all end-to-end tests to exercise the new role-based pipeline and verify the complete workflow from ROLE.md to running container.

**PRD refs:** §12 (Use Cases — UC-1 through UC-6)

**Summary:** Update the e2e test suite in `e2e/` to cover the new role-based workflow. Tests should exercise: (1) Local role development — create a ROLE.md, run `clawmasons run claude --role <name>`, verify the agent starts with correct configuration. (2) Cross-agent portability — define a role in `.claude/roles/`, materialize for Codex, verify output. (3) Package and share — package a role to npm, install in a test project, run it. (4) Docker containerization — verify Dockerfile generation, volume masking, and session directory structure. (5) CLI commands — `chapter list`, `chapter build`, `chapter validate` with roles. (6) Error paths — missing roles, malformed ROLE.md, missing packaged roles with clear error messages. Remove or update any existing e2e tests that exercise the deprecated `agent` command.

**Scope:**
- Modify: `e2e/` test files — update all `clawmasons agent` invocations to `clawmasons run`
- New: e2e tests for local ROLE.md → materialize → run workflow
- New: e2e tests for cross-agent materialization (Claude role → Codex output)
- New: e2e tests for volume masking and container ignore
- New: e2e tests for session directory operability (`docker compose` commands)
- New: e2e tests for error paths (missing role, malformed ROLE.md, uninstalled package role)
- Remove: e2e tests that exercise deprecated agent package workflows

**User Story:** As a developer, I run `cd e2e && npx vitest run --config vitest.config.ts` and all tests pass, confirming the complete role-based pipeline works end-to-end — from ROLE.md authoring through Docker materialization to agent startup.

**Testable output:** All e2e tests pass. No references to deprecated `agent` command in test code. Coverage includes local roles, packaged roles, cross-agent materialization, volume masking, CLI commands, and error paths. `cd e2e && npx vitest run --config vitest.config.ts` passes.

**Not Implemented Yet**

---

## CHANGE 13: Documentation Updates

Update all user-facing and developer-facing documentation to reflect the role-centric architecture.

**PRD refs:** All sections (documentation should reflect the complete PRD)

**Summary:** Update the project's documentation to reflect the new role-based workflow: (1) `README.md` — update the project overview, getting started guide, and command examples to use `clawmasons run <agent-type> --role <name>` (and shorthand). Replace "agent" terminology with "role" where referring to the deployable unit. Document the ROLE.md format and local-first workflow. (2) `e2e/README.md` — update test documentation to describe the role-based test scenarios, how to run them, and what they cover. (3) `DEVELOPMENT.md` — update developer setup instructions, architecture overview, and contribution guidelines to reflect the ROLE_TYPES pipeline, dialect registry, and new package structure (no `agent` package type).

**Scope:**
- Modify: `README.md` — update overview, quick start, command reference, and examples
- Modify: `e2e/README.md` — update test descriptions and running instructions
- Modify: `DEVELOPMENT.md` — update architecture docs, package type descriptions, and contributor workflow
- Verify: all command examples use `clawmasons run` (or shorthand) syntax, no references to deprecated `agent` command

**User Story:** As a new user reading the README, I understand that roles are the primary unit — I create a ROLE.md, run `clawmasons run claude --role <name>`, and I'm up and running. As a contributor reading DEVELOPMENT.md, I understand the ROLE_TYPES pipeline and how to add a new agent dialect.

**Testable output:** All documentation uses current terminology and command syntax. No references to deprecated `agent` package type or `clawmasons agent` command. Quick start examples work as written.

**Not Implemented Yet**

