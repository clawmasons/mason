# Spec: Unified Role Discovery

**Status:** Implemented
**PRD:** [agent-roles](../../prds/agent-roles/PRD.md) — §6, §6.1, §6.2, §6.3
**Change:** #5 in [IMPLEMENTATION.md](../../prds/agent-roles/IMPLEMENTATION.md)

---

## Overview

`discoverRoles(projectDir: string): Promise<RoleType[]>` scans all role sources in a project and returns a deduplicated, precedence-ordered list of available roles. `resolveRole(name: string, projectDir: string): Promise<RoleType>` resolves a single role by name using the same precedence rules.

## Module

- **File:** `packages/shared/src/role/discovery.ts`
- **Exports:** `discoverRoles`, `resolveRole`, `RoleDiscoveryError`
- **Barrel:** Re-exported from `packages/shared/src/role/index.ts` and `packages/shared/src/index.ts`

## Discovery Sources (Precedence Order)

1. **Local roles** — `<projectDir>/.<agent>/roles/*/ROLE.md` for each known agent directory from the dialect registry (`.claude/`, `.codex/`, `.aider/`). Parsed via `readMaterializedRole()` from Change 2.
2. **Packaged roles** — `<projectDir>/node_modules/*/package.json` and `<projectDir>/node_modules/@*/*/package.json` where `chapter.type === "role"`. Loaded via `readPackagedRole()` from Change 3.

Local roles take precedence over packaged roles with the same name (by `metadata.name`), enabling the "eject and customize" workflow (PRD §6.3).

## Behavior

### discoverRoles

1. Scan all known agent directories for local roles
2. Scan `node_modules/` for role packages (top-level and scoped)
3. Merge into a `Map<name, RoleType>` — packaged roles added first, local roles overwrite
4. Return as array

**Edge cases:**
- Missing agent directories are silently skipped
- Missing `node_modules/` is silently skipped
- Malformed ROLE.md files and packages are skipped (error isolation)
- Returns `[]` when no roles are found

### Requirement: Discovery uses project directory only — no CLAWMASONS_HOME scanning

`discoverRoles(projectDir)` and `resolveRole(name, projectDir)` SHALL scan only the project directory for local roles and `node_modules` for packaged roles. There SHALL be no scanning of `CLAWMASONS_HOME`, `chapters.json`, or any global registry.

#### Scenario: Discover local role from `.claude/roles/`
- **WHEN** `discoverRoles("/home/user/my-project")` is called
- **AND** `/home/user/my-project/.claude/roles/writer/ROLE.md` exists
- **THEN** the result SHALL include a RoleType for "writer"
- **AND** no reads to `~/.clawmasons/` SHALL occur

#### Scenario: Discover packaged role from `node_modules/`
- **WHEN** `discoverRoles("/home/user/my-project")` is called
- **AND** a package in `node_modules/` has `chapter.type === "role"`
- **THEN** the result SHALL include the packaged role
- **AND** no reads to `~/.clawmasons/chapters.json` SHALL occur

#### Scenario: Role resolution does not fall back to global registry
- **WHEN** `resolveRole("writer", "/home/user/my-project")` is called
- **AND** "writer" is not found locally or in `node_modules/`
- **THEN** a `RoleDiscoveryError` SHALL be thrown
- **AND** the function SHALL NOT attempt to read from `CLAWMASONS_HOME`

### resolveRole

1. Check local roles first (scan all agent directories for matching name)
2. Check packaged roles (scan `node_modules/`)
3. Throw `RoleDiscoveryError` if not found
4. SHALL NOT fall back to `CLAWMASONS_HOME` or any global registry

**Error message format:** `Role "<name>" not found. It is not a local role and is not installed as a package.`

### RoleDiscoveryError

A dedicated error class for discovery/resolution failures.

| Condition | Error Pattern |
|-----------|--------------|
| Role not found | `Role "<name>" not found. It is not a local role and is not installed as a package.` |

## Tests

**File:** `packages/shared/tests/role-discovery.test.ts` (21 tests)

- Discover local role from `.claude/roles/`
- Discover local role from `.codex/roles/`
- Discover local role from `.aider/roles/`
- Discover roles across multiple agent directories
- Discover multiple roles in the same agent directory
- Discover packaged role from `node_modules/`
- Discover scoped packaged role from `node_modules/@scope/`
- Exclude non-role packages from discovery
- Discover multiple packaged roles
- Local role shadows packaged role with same name
- Include both local and packaged roles with different names
- Return empty array when no roles exist
- Return empty array when agent dirs have no roles subdirectory
- Skip directories without ROLE.md
- Skip malformed ROLE.md files during discovery
- Handle no node_modules directory gracefully
- resolveRole: resolve local role by name
- resolveRole: resolve packaged role by name
- resolveRole: prefer local over packaged with same name
- resolveRole: throw RoleDiscoveryError when not found
- resolveRole: resolve from any agent directory
