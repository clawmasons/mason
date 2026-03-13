## Architecture

`readPackagedRole` mirrors `readMaterializedRole` (the local parser from Change 2) but operates on an NPM package directory instead of a local agent directory. The key difference is how the role is located and how source metadata is set.

### Flow

```
node_modules/@acme/role-create-prd/
├── package.json          ← (1) Read & validate chapter.type === "role"
├── ROLE.md               ← (2) Parse frontmatter + body (reuse parseFrontmatter)
├── templates/            ← (3) Scan bundled resources
│   └── prd-template.md
└── ...
```

1. Read `package.json` from the package directory, extract `chapter` field
2. Validate `chapter.type === "role"` — reject otherwise with clear error
3. Read `ROLE.md` from the package root — throw `PackageReadError` if missing
4. Parse frontmatter + body using the existing `parseFrontmatter()` utility
5. Extract metadata from frontmatter (name falls back to package.json `name`)
6. Normalize fields: since packaged roles are dialect-agnostic, use a "generic" field mapping where the frontmatter uses ROLE_TYPES generic names (`tasks`, `apps`, `skills`) directly — no dialect normalization needed
7. Scan bundled resources relative to the package directory
8. Resolve skill/task references: local paths (`./`) resolved relative to package dir, package names left as references
9. Build `RoleType` with `source: { type: 'package', packageName }` and validate through `roleTypeSchema`

### Design Decisions

- **No dialect detection for packages**: Packaged roles use generic ROLE_TYPES field names in their frontmatter (`tasks` not `commands`, `apps` not `mcp_servers`). The dialect is an authoring convenience for local roles; packages are pre-normalized. However, we also support dialect-specific field names for backward compatibility — if the package contains a `chapter.dialect` field, we use that dialect's mapping.
- **PackageReadError**: A dedicated error class (like `RoleParseError`) with the package path attached, enabling clear diagnostics.
- **Reuse parseFrontmatter**: The YAML frontmatter parsing logic is identical for local and packaged roles — we reuse it directly.
- **Metadata from package.json**: The role name defaults to the frontmatter `name` field, falling back to `package.json` `name`. The `version` comes from frontmatter first, then `package.json` `version`. The `packageName` is always from `package.json` `name`.
- **Path resolution from package dir**: All relative paths in skills/tasks resolve from the package directory, not from a project root. This ensures packages are self-contained.
- **Equivalence guarantee**: The output RoleType is validated through the same `roleTypeSchema` as local roles. The only difference is `source.type = 'package'` and `source.packageName` being set.

### File Structure

```
packages/shared/src/role/
├── dialect-registry.ts    (existing)
├── index.ts               (modified — add exports)
├── package-reader.ts      (NEW)
├── parser.ts              (existing — reuse parseFrontmatter)
└── resource-scanner.ts    (existing — reuse scanBundledResources)
```
