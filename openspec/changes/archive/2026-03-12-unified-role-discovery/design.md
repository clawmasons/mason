## Architecture

`discoverRoles` and `resolveRole` compose the parser (`readMaterializedRole`) and package reader (`readPackagedRole`) from Changes 2 and 3 into a unified discovery layer. Discovery scans two sources in precedence order and deduplicates by role name.

### Discovery Sources (Precedence Order)

1. **Local roles** — `<projectDir>/.<agent>/roles/*/ROLE.md` for each known agent directory from the dialect registry (`.claude/`, `.codex/`, `.aider/`)
2. **Packaged roles** — `<projectDir>/node_modules/*/package.json` and `<projectDir>/node_modules/@*/*/package.json` where `chapter.type === "role"`

Local roles take precedence over packaged roles with the same name (enabling the "eject and customize" workflow from PRD §6.3).

### Flow

```
discoverRoles(projectDir)
├── 1. discoverLocalRoles(projectDir)
│   ├── For each known agent directory (from dialect registry):
│   │   ├── Glob: <projectDir>/.<agent>/roles/*/ROLE.md
│   │   └── readMaterializedRole() for each match
│   └── Collect into Map<name, RoleType> (first wins within locals)
├── 2. discoverPackagedRoles(projectDir)
│   ├── Glob: <projectDir>/node_modules/*/package.json
│   ├── Glob: <projectDir>/node_modules/@*/*/package.json
│   ├── Filter: chapter.type === "role"
│   └── readPackagedRole() for each match
├── 3. Merge: local map + package map (local wins on name collision)
└── Return: RoleType[]

resolveRole(name, projectDir)
├── 1. Try local roles first (scan all agent dirs for matching name)
├── 2. Try packaged roles (scan node_modules for matching name)
├── 3. Throw RoleDiscoveryError if not found
└── Return: RoleType
```

### Design Decisions

- **Filesystem scanning with graceful handling**: Discovery uses `readdir` to list directories. Missing directories (e.g., no `.claude/roles/`) are silently skipped — this is expected for projects that don't use all agent runtimes.
- **Name-based deduplication**: Roles are identified by `metadata.name`. When two sources provide the same name, the higher-precedence source wins (local > package).
- **Error isolation**: If a single ROLE.md or package is malformed, discovery logs a warning but continues scanning other roles. Only `resolveRole` throws when a specifically-requested role cannot be loaded.
- **No caching**: Discovery is stateless — it scans the filesystem on every call. Caching can be added later if performance requires it (PRD §13.1 allows up to 2 seconds for role loading).
- **resolveRole is optimized**: Instead of calling `discoverRoles` and filtering, `resolveRole` performs a targeted lookup — checking only the specific role name across sources.

### File Structure

```
packages/shared/src/role/
├── adapter.ts             (existing)
├── dialect-registry.ts    (existing)
├── discovery.ts           (NEW)
├── index.ts               (modified — add exports)
├── package-reader.ts      (existing)
├── parser.ts              (existing)
└── resource-scanner.ts    (existing)
```
