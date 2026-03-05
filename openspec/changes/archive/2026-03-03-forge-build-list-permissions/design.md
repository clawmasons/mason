# Design: forge build, list, and permissions Commands

## Context

The existing codebase has all the building blocks: `discoverPackages()`, `resolveAgent()`, `computeToolFilters()`, and `generateLockFile()`. These three commands are thin orchestration layers that compose existing functions and format output. The pattern follows `validate.ts` and `install.ts`.

## Goals / Non-Goals

**Goals:**
- Implement `forge build <agent>` that writes `forge.lock.json` to the workspace
- Implement `forge list` that shows a tree of all discovered agents and their dependency trees
- Implement `forge permissions <agent>` that displays the permission matrix and toolFilter
- All commands support `--json` for machine-readable output
- Non-zero exit codes on errors (agent not found, no agents installed)

**Non-Goals:**
- Interactive output (colors, spinners) — plain text is sufficient
- Modifying any existing pipeline functions
- Adding new dependency resolution logic

## Decisions

### 1. Build writes to workspace root by default

`forge build <agent>` writes `forge.lock.json` to the current working directory (or `--output <path>`). It does NOT write to the scaffolded agent directory — that's `forge install`'s job. Build is a lightweight graph-lock operation.

**Alternative:** Write to `.forge/agents/<name>/forge.lock.json`. Rejected because build should be usable without a prior install, and the lock file is a CI artifact.

### 2. List scans workspace without requiring an agent argument

`forge list` discovers all packages, finds all agent-typed packages, and resolves each one. No argument required. If `--agent <name>` is provided, shows only that agent's tree.

**Alternative:** Require an agent name. Rejected because the primary use case is "what's in this workspace?"

### 3. Permissions reuses computeToolFilters for the proxy-level view

`forge permissions <agent>` shows two views:
- **Per-role breakdown:** role → app → allowed tools (from `role.permissions`)
- **Proxy-level toolFilter:** app → union of allowed tools (from `computeToolFilters()`)

This matches the two-tier governance model in the PRD.

### 4. Tree rendering uses indented text, not box-drawing characters

Simple indented text with `├──` and `└──` for the tree. No external dependency needed.

## Risks / Trade-offs

- **Large workspaces:** `forge list` resolves all agents, which could be slow with many packages. Acceptable for now — optimize later if needed.
- **No color output:** Plain text only. Color support can be added in a future change without breaking the spec.
