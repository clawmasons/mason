## Context

The `example/` directory was the original workspace demonstrating forge's 5 component types (app, skill, task, role, agent) with `@example/*` scoped names. Change #1 (Create forge-core Package) migrated all components to `forge-core/` with `@clawmasons/*` naming. Change #3 (Template System) provides the new way for users to bootstrap projects. The `example/` directory is now dead code.

Two test files and the README still reference `example/`. These must be updated before the directory can be removed.

## Goals / Non-Goals

**Goals:**
- Remove the `example/` directory completely
- Update all test references from `@example/*` to `@clawmasons/*`
- Update all test paths from `example/` to `forge-core/`
- Update README.md to reflect the new project structure
- All existing tests continue to pass

**Non-Goals:**
- Rewriting the integration test script (mcp-proxy.sh) — only path and name references change
- Modifying any `src/` production code — this is purely a cleanup change
- Creating new test fixtures — `forge-core/` already has all needed components

## Decisions

### 1. forge-proxy.test.ts: Rename constant only

The `APP_NAME` constant in `tests/integration/forge-proxy.test.ts` is used as a logical identifier for the test's ResolvedApp object. It is not resolved by forge's discovery system — it's just a string constant. Changing it from `@example/app-filesystem` to `@clawmasons/app-filesystem` aligns naming with the project's canonical component names. No functional change.

### 2. mcp-proxy.sh: Point at forge-core/ directory

The shell script runs `forge install` from a workspace directory. Since `forge-core/` has the same directory structure as `example/` (apps/, tasks/, skills/, roles/, agents/) and uses `@clawmasons/*` names, the script is updated to:
- Set `EXAMPLE_DIR` to `$PROJECT_ROOT/forge-core` (and rename the variable to `WORKSPACE_DIR`)
- Change agent name from `@example/agent-note-taker` to `@clawmasons/agent-note-taker`
- Update cleanup to use `WORKSPACE_DIR`

### 3. README.md: Replace example section with template-based workflow

The README's "Example" section pointing at `example/` is replaced with guidance on using `forge init --template note-taker` and references to `forge-core/` as the component library. CLI examples use `@clawmasons/*` names.

## Risks / Trade-offs

- **[Low risk] mcp-proxy.sh uses forge-core as workspace** — forge-core is structured identically to example/ (same directory layout, same component types). The only difference is package naming (`@clawmasons/*` vs `@example/*`), which is updated in the script.
- **[No risk] forge-proxy.test.ts constant change** — The APP_NAME is a test-local constant, not resolved by discovery. The rename is cosmetic.
