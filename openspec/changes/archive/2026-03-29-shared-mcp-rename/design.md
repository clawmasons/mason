# Design: Rename types, schemas, and internal functions in @clawmasons/shared

**Change:** IMPLEMENTATION.md Change #1
**PRD refs:** sections 4, 5.1, 5.2, 5.3, 5.4, 5.7, 8

## Architecture

This is a pure naming refactor with no behavioral changes. The rename flows bottom-up through the shared package:

```
schemas/role-types.ts  (Zod schema definitions)
    -> schemas/index.ts  (barrel re-export)
    -> types/role.ts     (TypeScript type aliases)
    -> types.ts          (resolved interfaces)
    -> index.ts          (package barrel with backwards-compat aliases)

role/dialect-registry.ts  (field mapping interfaces + static registrations)
role/parser.ts            (normalizeApps -> normalizeMcp + fallback)
role/package-reader.ts    (normalizeApps -> normalizeMcp + fallback)
role/adapter.ts           (adaptApp -> adaptMcpServer, field accesses)
mason/proposer.ts         (frontmatter field name output)
```

## Detailed Changes

### 1. Schema rename (role-types.ts)
- `appConfigSchema` -> `mcpServerConfigSchema`
- `roleSchema` field: `apps: z.array(appConfigSchema)` -> `mcp: z.array(mcpServerConfigSchema)`

### 2. Schema barrel (schemas/index.ts)
- Update re-export from `appConfigSchema` to `mcpServerConfigSchema`

### 3. Type alias (types/role.ts)
- Import rename: `appConfigSchema` -> `mcpServerConfigSchema`
- Type rename: `AppConfig` -> `McpServerConfig`

### 4. Resolved types (types.ts)
- Interface rename: `ResolvedApp` -> `ResolvedMcpServer`
- Field rename: `ResolvedRole.apps` -> `ResolvedRole.mcp`
- Add deprecated `apps?: ResolvedMcpServer[]` for transition

### 5. Package barrel (index.ts)
- Primary exports use new names
- Add backwards-compat deprecated re-exports: `AppConfig`, `appConfigSchema`, `ResolvedApp`

### 6. Dialect registry (dialect-registry.ts)
- `DialectFieldMapping.apps` -> `.mcp`
- `AgentDialectInfo.dialectFields.apps` -> `.mcp`
- Default: `info.dialectFields?.apps ?? "mcp_servers"` -> `info.dialectFields?.mcp ?? "mcp"`
- Static registrations: `apps: "mcp_servers"` -> `mcp: "mcp"`

### 7. Parser (parser.ts)
- `normalizeApps()` -> `normalizeMcp()`
- `dialect.fieldMapping.apps` -> `.mcp`
- `apps,` -> `mcp,` in roleData
- Backwards-compat fallback: try `frontmatter["mcp_servers"]` when primary field not found

### 8. Package reader (package-reader.ts)
- `normalizeApps()` -> `normalizeMcp()`
- `GENERIC_FIELD_MAPPING.apps` -> `.mcp`
- Same backwards-compat fallback as parser

### 9. Adapter (adapter.ts)
- `adaptApp()` -> `adaptMcpServer()`
- `AppConfig` imports -> `McpServerConfig`
- `ResolvedApp` imports -> `ResolvedMcpServer`
- `role.apps` -> `role.mcp`
- `aggregatePermissions(apps)` -> `aggregatePermissions(mcp)`

### 10. Proposer (proposer.ts)
- `frontmatter.mcp_servers` -> `frontmatter.mcp`

## Test Coverage

All existing tests updated to use new names. Specifically:

| Test file | Changes |
|-----------|---------|
| `role.test.ts` | `appConfigSchema` -> `mcpServerConfigSchema`, `.apps` -> `.mcp` |
| `schemas/role-types.test.ts` | `appConfigSchema` -> `mcpServerConfigSchema` |
| `role-adapter.test.ts` | `.apps` -> `.mcp` in role construction and assertions |
| `role-parser.test.ts` | `fieldMapping.apps` -> `.mcp`, YAML `mcp_servers:` -> `mcp:`, `.apps` -> `.mcp` |
| `role-package-reader.test.ts` | `.apps` -> `.mcp`, YAML `mcp_servers:` -> `mcp:` (package-reader uses generic field names, so `apps:` in YAML -> `mcp:`) |
| `dialect-registry.test.ts` | `fieldMapping.apps` -> `.mcp`, expected `"mcp_servers"` -> `"mcp"` |
| `dialect-integration.test.ts` | Same as dialect-registry |
| `mason-proposer.test.ts` | `mcp_servers:` -> `mcp:` in assertions, `.apps` -> `.mcp` |
| `mason-scanner.test.ts` | `apps: "mcp_servers"` -> `mcp: "mcp"` in dialect field mapping |
| `setup-dialects.ts` | No changes needed (dialectFields don't specify `apps` for test agents -- they get the default) |

**New test added:** Backwards-compat fallback test in parser -- verifying that ROLE.md files with `mcp_servers:` still parse correctly after the rename.

## Non-Goals

- No downstream package changes (proxy, cli, agent-sdk)
- No behavioral changes
- No new features
