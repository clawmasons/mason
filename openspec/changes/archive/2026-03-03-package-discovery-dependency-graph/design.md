## Context

pam is a TypeScript/Node.js project (ESM, Zod, Vitest, Commander.js) with validated schemas for all five pam package types (app, skill, task, role, agent) and a CLI entry point with `pam init`. The next step is the graph resolver — the core engine that reads installed packages, parses their `pam` fields, and walks the typed dependency graph to produce a `ResolvedAgent`.

The PRD defines a strict dependency hierarchy (§3.1): agent → role → task/app/skill, where higher-level types depend on lower-level types, never the reverse. The resolver must enforce this hierarchy and detect violations.

## Goals / Non-Goals

**Goals:**
- Define resolved types (`ResolvedAgent`, `ResolvedRole`, etc.) that downstream commands operate on
- Discover pam packages from node_modules and workspace directories
- Resolve the full dependency graph from an agent name to a flattened `ResolvedAgent`
- Detect circular dependencies in composite task chains
- Produce actionable error messages for missing/invalid dependencies
- Export resolver as a public API for use by validate, install, build commands

**Non-Goals:**
- CLI commands that use the resolver (validate, install, build — those are separate changes)
- npm operations (npm install, npm publish — not needed for resolution)
- Runtime behavior (proxy config generation, Docker compose — downstream of resolver)
- Lock file generation (downstream, uses resolver output)

## Decisions

### 1. Package discovery via filesystem scanning

**Decision:** Discover packages by scanning `node_modules/` directories and workspace directories (`apps/`, `tasks/`, `skills/`, `roles/`, `agents/`), reading each `package.json`, and parsing the `pam` field with existing Zod schemas.

**Rationale:** npm already resolves and installs packages to disk. We read what npm wrote rather than reimplementing resolution. Workspace directories handle the monorepo case where packages aren't in node_modules yet (pre-install local packages). This is the same approach tools like `turbo` and `nx` use.

### 2. Resolved types as plain objects (not classes)

**Decision:** `ResolvedAgent`, `ResolvedRole`, `ResolvedTask`, `ResolvedApp`, `ResolvedSkill` are TypeScript interfaces with all fields populated. No class hierarchies or methods.

**Rationale:** Plain objects are serializable (for lock files), testable (deep equals), and composable. Methods would couple behavior to the data model. Any graph operations are standalone functions that take resolved types as input.

### 3. Two-phase resolution: discover then resolve

**Decision:** Split into two phases:
1. **Discover:** Scan filesystem, parse all pam packages into a `Map<string, DiscoveredPackage>` keyed by package name
2. **Resolve:** Given an agent name and the discovery map, walk the dependency graph depth-first, building the resolved tree

**Rationale:** Separating discovery from resolution allows caching (discover once, resolve many agents), better error messages (distinguish "package not installed" from "package has invalid pam field"), and testability (resolution can be tested with in-memory maps, no filesystem needed).

### 4. Circular dependency detection via visited set

**Decision:** Track visited package names during depth-first traversal. If a package is encountered while already in the current traversal path, report a circular dependency error with the full cycle path.

**Rationale:** Standard cycle detection algorithm. The visited set is per-traversal-path (not global) to allow diamond dependencies (A→B→D, A→C→D is fine). Only cycles are errors.

### 5. Source layout

**Decision:**
```
src/resolver/
  types.ts        # ResolvedAgent, ResolvedRole, etc. + DiscoveredPackage
  discover.ts     # Package discovery from filesystem
  resolve.ts      # Graph resolution from discovery map
  errors.ts       # Typed error classes for resolution failures
  index.ts        # Re-exports
```

**Rationale:** Mirrors the schemas/ organization. Each file has a single responsibility. The errors module provides structured error types that downstream commands can pattern-match on for user-friendly messages.

### 6. DiscoveredPackage includes both raw metadata and parsed pam field

**Decision:** `DiscoveredPackage` includes `name`, `version`, `packagePath` (filesystem location), and the validated `PamField` (already parsed by Zod). Invalid packages are reported as warnings during discovery, not included in the map.

**Rationale:** Downstream code never deals with raw JSON — it always has validated pam fields. This pushes validation to the boundary (discovery time) and keeps the resolver clean.

## Risks / Trade-offs

- **[Risk] Large node_modules scanning is slow** → Mitigation: Only scan direct subdirectories of node_modules (or scoped @org/ dirs) and workspace directories. Don't recurse into nested node_modules. The discovery function takes explicit paths to scan.
- **[Risk] Workspace packages not yet installed** → Mitigation: Scan workspace directories (apps/, tasks/, etc.) in addition to node_modules. Workspace packages are found by their package.json in the workspace dir, even pre-install.
- **[Trade-off] No caching across runs** → Acceptable for now. Each CLI invocation discovers fresh. A cache layer can be added later using pam.lock.json.
- **[Trade-off] Diamond dependencies allowed** → By design. If role-A and role-B both depend on app-github, it's resolved once and referenced by both. Only cycles are errors.
