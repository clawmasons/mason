# Spec: readPackagedRole — Load NPM Packages into ROLE_TYPES

**Status:** Implemented
**PRD:** [agent-roles](../../prds/agent-roles/PRD.md) — §6.2, §6.3
**Change:** #3 in [IMPLEMENTATION.md](../../prds/agent-roles/IMPLEMENTATION.md)

---

## Overview

`readPackagedRole(packagePath: string): Promise<Role>` reads an NPM role package directory and produces a validated `Role` object — the same in-memory representation used by the local ROLE.md parser. This ensures local-to-package equivalence (PRD §6.3).

## Module

- **File:** `packages/shared/src/role/package-reader.ts`
- **Export:** `readPackagedRole`, `PackageReadError`
- **Barrel:** Re-exported from `packages/shared/src/role/index.ts` and `packages/shared/src/index.ts`

## Behavior

### Input

An absolute path to a package directory (e.g., `node_modules/@acme/role-create-prd/`).

### Processing Steps

1. **Read `package.json`** — parse JSON, validate `name` field exists
2. **Verify `chapter.type === "role"`** — reject with `PackageReadError` if missing or wrong type
3. **Read `ROLE.md`** — throw `PackageReadError` if missing
4. **Parse frontmatter** — reuse `parseFrontmatter()` from `parser.ts`
5. **Resolve dialect** — if `chapter.dialect` is set in package.json, use that dialect's field mapping; otherwise use generic ROLE_TYPES field names (`tasks`, `apps`, `skills`)
6. **Extract metadata** — `name` from frontmatter (fallback: package.json name), `version` from frontmatter (fallback: package.json version)
7. **Normalize fields** — tasks, apps, skills using the resolved dialect mapping
8. **Resolve skill paths** — local paths (`./`, `../`) resolve relative to package directory; package names kept as-is
8a. **Validate dependency subdirectories** — collect all plain-name (no `./`/`../`) skills and tasks; check each exists as a subdirectory in the package; if any are missing, throw `PackageDependencyError` with all missing paths collected
9. **Scan bundled resources** — reuse `scanBundledResources()` from `resource-scanner.ts`
10. **Set source** — `{ type: 'package', packageName: <package.json name> }`
11. **Validate** — pass through `roleSchema.parse()`

### Output

A validated `Role` object with `source.type = 'package'`.

### Error Cases

| Condition | Error Type | Message Pattern |
|-----------|-----------|-----------------|
| Missing package.json | `PackageReadError` | "Missing package.json" |
| Invalid JSON in package.json | `PackageReadError` | "Invalid package.json: ..." |
| Missing name in package.json | `PackageReadError` | "missing required field: name" |
| Wrong chapter.type | `PackageReadError` | 'does not have chapter.type = "role"' |
| Missing chapter field | `PackageReadError` | 'does not have chapter.type = "role"' |
| Missing ROLE.md | `PackageReadError` | "missing ROLE.md" |
| Missing description in ROLE.md | `PackageReadError` | "missing required field: description" |
| Unknown dialect | `PackageReadError` | 'Unknown dialect "..."' |
| Malformed YAML | `RoleParseError` | (from parseFrontmatter) |
| Missing bundled dependency paths | `PackageDependencyError` | includes roleMdPath + list of missing paths |

All `PackageReadError` messages include the package path.

## Equivalence Guarantee

The output `Role` from `readPackagedRole` is validated through the same `roleSchema` as local roles from `readMaterializedRole`. The only structural difference is the `source` field:
- Local: `{ type: 'local', agentDialect: '...', path: '...' }`
- Package: `{ type: 'package', packageName: '...' }`

All other fields (metadata, instructions, tasks, apps, skills, container, governance, resources) are identical in shape and validation.

## Tests

**File:** `packages/shared/tests/role-package-reader.test.ts` (19 tests)

- Valid package with generic field names
- Valid package with dialect-specific field names (via chapter.dialect)
- Fallback to package.json name when frontmatter name is absent
- Fallback to package.json version when frontmatter version is absent
- Bundled resource discovery
- Local path skill resolution relative to package directory
- Minimal role package
- Equivalence with local parse (same fields except source)
- Error: missing package.json
- Error: wrong chapter.type
- Error: missing chapter field
- Error: missing ROLE.md
- Error: missing description
- Error: invalid package.json
- Error: unknown dialect
- Error: package path in error messages
- Error: malformed YAML
- Dependency resolution: package references
- Dependency resolution: relative path references
