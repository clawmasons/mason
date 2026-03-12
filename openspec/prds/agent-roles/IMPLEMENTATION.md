# Agent Roles — Implementation Plan

**PRD:** [PRD.md](./PRD.md)
**Status:** Not Started
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
| CLI (Change 8) | `clawmasons <agent-type> --role <name>` |
| Mason Skill (Change 9) | Scan project, propose ROLE.md |
| Monorepo Gen (Change 10) | `mason init-repo --role <name>` |

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

**Not Implemented Yet**

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

**Not Implemented Yet**

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

**Not Implemented Yet**

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

**Not Implemented Yet**

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

**Summary:** Generate the Docker build directory at `.clawmasons/docker/<role-name>/` with the structure from PRD §7.1: agent subdirectory with Dockerfile + workspace, mcp-proxy subdirectory, and docker-compose.yaml. Implement volume masking for `container.ignore.paths`: directories are masked with named empty volumes, files are masked with read-only bind mounts of a sentinel empty file (`.clawmasons/empty-file`, `chmod 444`). The project tree is mounted read-only. Session directories are created at `.clawmasons/sessions/<session-id>/` with a compose file referencing the role's Docker build dir.

**Scope:**
- Modify: Docker generation in `packages/cli/src/materializer/` to use role-centric build directory structure
- New: volume masking logic — detect directories vs files in ignore list, generate appropriate volume entries
- New: sentinel file creation (`.clawmasons/empty-file`)
- New: session directory creation with compose file generation
- Modify: docker-compose generation to include volume stacking for ignored paths
- New tests: verify Docker build directory structure, verify volume masking for directories and files, verify sentinel file creation, verify session directory structure

**User Story:** As a developer, when I define `container.ignore.paths: ['.clawmasons/', '.claude/', '.env']` in my ROLE.md, the generated docker-compose masks those paths inside the container — directories become empty volumes, files become empty file mounts. My secrets never enter the container.

**Testable output:** Docker build directory matches PRD §7.1 structure. Volume masking correctly generates named volumes for directories and bind mounts for files. Sentinel file is created with correct permissions. Session directory is created with valid compose file. `npx tsc --noEmit` compiles. `npx vitest run` passes.

**Not Implemented Yet**

---

## CHANGE 8: CLI Command Refactor

Refactor the CLI to use `clawmasons <agent-type> --role <name>` as the primary command structure. Remove the `agent` package type.

**PRD refs:** §8 (Running Roles), §8.1 (Local Role), §8.2 (Packaged Role), §8.3 (Startup Sequence), §9 (CLI Changes), §9.1 (Command Structure), §9.2 (Revised Command Reference), §9.3 (Package Type Changes)

**Summary:** Refactor the CLI so the first argument is an agent type (`claude`, `codex`, `aider`) followed by `--role <name>`. The startup sequence becomes: (1) Load ROLE_TYPES via `resolveRole()` from Change 5. (2) Resolve dependencies. (3) Materialize Docker build directory via `materializeForAgent()` from Change 6. (4) Create session directory. (5) Docker Compose up (proxy). (6) Start credential service. (7) Docker Compose run agent. Remove the `agent` package type — its fields (`runtimes`, `proxy`, `resources`, `credentials`) are now part of the role definition. Update `chapter list` to show roles instead of agents. Add `--acp` flag for ACP server mode.

**Scope:**
- Modify: `packages/cli/src/cli/commands/` — refactor agent command to accept `--role` flag
- Modify: CLI argument parsing to treat first arg as agent type
- Modify: startup sequence to use ROLE_TYPES pipeline (discover → load → materialize → session → run)
- Remove: `agent` package type support from schema and resolver
- Modify: `chapter list` to discover and display roles
- Modify: `chapter build` to materialize Docker dirs for all discovered roles
- Add: `chapter validate` command for role definition validation
- New tests: CLI accepts `clawmasons claude --role create-prd`, CLI rejects unknown agent types, `--acp` flag works, `chapter list` shows roles

**User Story:** As a developer, I run `clawmasons claude --role create-prd` and the system loads my role, materializes it for Claude Code, and starts the agent session. I no longer need to create agent wrapper packages.

**Testable output:** CLI parses `<agent-type> --role <name>` correctly. Startup sequence uses ROLE_TYPES pipeline end-to-end. `chapter list` shows local and packaged roles. Agent package type is removed. `npx tsc --noEmit` compiles. `npx vitest run` passes.

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
