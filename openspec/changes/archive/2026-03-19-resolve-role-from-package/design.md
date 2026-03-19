## Context

`resolveRole(name, projectDir)` in `packages/shared/src/role/discovery.ts` resolves a role by:
1. Checking `.mason/roles/<name>/ROLE.md` (local)
2. Scanning all of `node_modules/` for packages with `chapter.type === "role"` and matching by `role.metadata.name`

This full-scan approach has two gaps:
- A caller passing `@clawmasons/role-configure-project` (a package name) gets matched by metadata name, not by package name — these can differ
- Globally installed packages (e.g., `npm install -g @clawmasons/role-configure-project`) are never searched
- The plain name `configure-project` has no auto-mapping to `@clawmasons/role-configure-project`
- When a package role is loaded, skill/task subdirectories are not validated to exist — missing deps surface as runtime errors rather than clear load-time errors

The installed example at `node_modules/@clawmasons/role-configure-project` shows the concrete pattern: `ROLE.md` at package root, with skills bundled as `skills/create-role-plan/` subdirectory.

## Goals / Non-Goals

**Goals:**
- Direct package-path lookup when name looks like an npm package name (contains `@` or `/`)
- Auto-convert plain unresolved role names to `@clawmasons/role-{name}` and retry
- Search global `node_modules` as a fallback after local lookup fails
- When loading a role from a package, validate all skill/task dependency subdirectories exist; collect all failures before throwing

**Non-Goals:**
- Changing the local `.mason/roles/` discovery behavior
- Changing how `discoverRoles()` (bulk discovery) works — only `resolveRole()` gains the new lookup logic
- Publishing or installing packages; this is read-only resolution
- Validating dependencies for local (non-package) roles

## Decisions

### Decision 1: Name classification drives lookup strategy

When `resolveRole(name, ...)` is called, check if `name` looks like a package name:
- **Package name**: contains `@` (scoped) or `/` (namespaced) — e.g., `@clawmasons/role-configure-project`
- **Plain name**: everything else — e.g., `configure-project`

For **package names**: skip local role lookup entirely. Go directly to package lookup (local node_modules, then global).

For **plain names**: check local `.mason/roles/` first (existing behavior), then check `@clawmasons/role-{name}` as a package (new), then fall back to full `node_modules` scan (existing).

**Why**: A package name like `@clawmasons/role-configure-project` is unambiguous — there's no `.mason/roles/@clawmasons/role-configure-project/ROLE.md` to find. Skipping local lookup avoids noise.

### Decision 2: Direct package path lookup

For a package name like `@clawmasons/role-configure-project`:
1. Check `<projectDir>/node_modules/@clawmasons/role-configure-project/` — if exists and is a role package, load it
2. If not found, check `<globalNodeModules>/@clawmasons/role-configure-project/`
3. If still not found, throw `RoleDiscoveryError`

**Why**: Direct path lookup is O(1) vs O(n) scan. Package name is a stable identifier — more reliable than metadata name matching.

### Decision 3: Global node_modules via `npm root -g`

Run `npm root -g` (cached per process invocation) to get the global node_modules path. If the command fails or returns empty, skip global lookup silently.

**Why**: `npm root -g` is the portable, cross-platform way to find global node_modules. Alternatives like hardcoded paths (`/usr/local/lib/node_modules`) are platform-specific and fragile.

Cache the result in a module-level variable to avoid repeated child process spawns within a single session.

### Decision 4: Auto-convert plain names

When a plain name `configure-project` is not found locally and not found via full scan, try `@clawmasons/role-configure-project` as a direct package lookup (local + global).

**Why**: Matches the convention that clawmasons roles are published as `@clawmasons/role-{name}`. Users shouldn't need to know the full package name.

### Decision 5: Dependency validation in `readPackagedRole`

After parsing ROLE.md fields, resolve each skill and task reference that does NOT start with `./` or `../` as a subdirectory of the package: `<packagePath>/skills/<name>/` for skills and `<packagePath>/tasks/<name>/` for tasks.

Collect all missing paths into an array, then throw a single `PackageDependencyError` listing:
- The path to the ROLE.md that was being loaded
- All missing dependency paths

**Why**: Fail-all reporting is far more useful than fail-fast when diagnosing broken packages. Users see the full list and can fix everything at once.

### Decision 6: New error type `PackageDependencyError`

Add `PackageDependencyError` to `package-reader.ts` with:
- `roleMdPath: string` — the ROLE.md that triggered the failure
- `missingPaths: string[]` — all dependency paths that were not found

**Why**: Separate from `PackageReadError` (which covers structural/parse failures) — callers may want to handle missing-dependency errors differently.

## Risks / Trade-offs

- **`npm root -g` subprocess cost**: Spawning a child process is slow (~100ms). Mitigated by caching the result at module level.
  → Mitigation: Cache result; skip global lookup if command fails rather than erroring

- **Convention assumption**: Auto-converting `configure-project` → `@clawmasons/role-configure-project` assumes the clawmasons convention. A project using a different scope would need to pass the full package name.
  → Mitigation: Auto-convert is a last-resort fallback after all other lookups fail; it never blocks resolution for other name patterns

- **Dependency validation scope**: Only skills and tasks named as plain strings (without `./` or `../`) get validated as package subdirectories. Path-relative refs are already resolved.
  → Acceptable: package-bundled deps use plain names; local path refs were already being resolved

## Open Questions

- Should `discoverRoles()` (bulk discovery) also include globally installed role packages? Currently out of scope but a natural follow-on.
- Should the `@clawmasons/role-{name}` convention be configurable (e.g., via mason config)? Out of scope for now.
