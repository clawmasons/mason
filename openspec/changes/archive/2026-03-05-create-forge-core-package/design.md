## Context

Forge's `example/` directory contains a complete note-taker agent with all 5 component types (`@example/*` scope). These components are useful building blocks but are inaccessible outside the repo. The forge-packaging PRD (REQ-001, REQ-002) requires a publishable `@clawforge/forge-core` workspace package containing these components with `@clawforge/*` naming.

The root `package.json` is `@clawforge/forge` (version 0.1.0) — a standard npm package with `bin`, `main`, `types`, and build scripts. It does not currently use npm workspaces.

## Goals / Non-Goals

**Goals:**
- Create `forge-core/` as an npm workspace member with correct package structure
- Copy all 5 component types from `example/` with `@clawforge/*` naming
- Ensure `npm install` at root succeeds with the workspace config
- Ensure `npm pack` in forge-core produces a valid tarball with all components

**Non-Goals:**
- Modifying discovery to scan workspace dirs inside node_modules (Change 2)
- Creating templates (Change 3)
- Removing `example/` (Change 5)
- Updating existing tests to use forge-core

## Decisions

### 1. Copy files rather than move
Copy from `example/` to `forge-core/` rather than moving. The `example/` directory is used by existing tests and the integration test scripts. Removing it is a separate change (Change 5) that updates all test references first.

### 2. Package structure mirrors example
`forge-core/` uses the same workspace directory layout (`apps/`, `tasks/`, `skills/`, `roles/`, `agents/`) as `example/`. This is the standard forge workspace structure that discovery already knows how to scan.

### 3. forge-core is JSON/markdown only — no build step
The package contains only `package.json` files, markdown prompts, and skill artifacts. No TypeScript, no compilation. The `files` array in `forge-core/package.json` lists all component directories.

### 4. Root workspaces config is `["forge-core"]` (not `["forge-core/*"]`)
The root `package.json` adds `"workspaces": ["forge-core"]` — treating forge-core itself as the workspace member. The sub-component package.json files inside forge-core are for forge's resolver, not npm's workspace system. npm doesn't need to manage them as individual packages.

### 5. Scope naming: `@clawforge/<type>-<name>`
All components follow the pattern: `@clawforge/app-filesystem`, `@clawforge/task-take-notes`, `@clawforge/skill-markdown-conventions`, `@clawforge/role-writer`, `@clawforge/agent-note-taker`. This matches the PRD naming convention.

## Risks / Trade-offs

- **[Risk] npm workspace hoisting conflicts** → forge-core has no npm dependencies (JSON-only package), so no hoisting issues.
- **[Risk] forge-core sub-components treated as npm workspace packages** → Using `"workspaces": ["forge-core"]` (not `["forge-core/*"]`) avoids npm trying to resolve sub-component package.json files as workspace members.
- **[Risk] Duplicate content between example/ and forge-core/** → Temporary duplication until Change 5 removes example/. Acceptable trade-off for safe incremental migration.
