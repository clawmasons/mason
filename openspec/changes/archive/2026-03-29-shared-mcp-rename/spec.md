# Spec: Rename types, schemas, and internal functions in @clawmasons/shared

**Status:** Implemented
**Change:** IMPLEMENTATION.md Change #1
**PRD:** openspec/prds/rename-apps/PRD.md
**Branch:** shared-mcp-rename

## Summary

Renamed all type definitions, Zod schemas, internal functions, and dialect field mappings in the `@clawmasons/shared` package from legacy "apps" / "AppConfig" vocabulary to "mcp" / "McpServerConfig".

## Changes Made

### Source files modified

| File | Change |
|------|--------|
| `packages/shared/src/schemas/role-types.ts` | `appConfigSchema` -> `mcpServerConfigSchema`, roleSchema field `apps` -> `mcp` |
| `packages/shared/src/schemas/index.ts` | Updated barrel re-export |
| `packages/shared/src/types/role.ts` | `AppConfig` -> `McpServerConfig` |
| `packages/shared/src/types.ts` | `ResolvedApp` -> `ResolvedMcpServer`, `ResolvedRole.apps` -> `.mcp` (+ deprecated `apps?`) |
| `packages/shared/src/index.ts` | New primary exports + backwards-compat aliases |
| `packages/shared/src/role/dialect-registry.ts` | `DialectFieldMapping.apps` -> `.mcp`, defaults, static registrations |
| `packages/shared/src/role/parser.ts` | `normalizeApps` -> `normalizeMcp`, backwards-compat fallback |
| `packages/shared/src/role/package-reader.ts` | `normalizeApps` -> `normalizeMcp`, backwards-compat fallback |
| `packages/shared/src/role/adapter.ts` | `adaptApp` -> `adaptMcpServer`, field accesses |
| `packages/shared/src/mason/proposer.ts` | `frontmatter.mcp_servers` -> `frontmatter.mcp` |

### Test files modified

All 14 test files in `packages/shared/tests/` updated to use new names. 294 tests pass.

### Backwards compatibility

- **Type re-exports:** `AppConfig`, `appConfigSchema`, `ResolvedApp` re-exported from `index.ts` with `@deprecated` JSDoc
- **ResolvedRole.apps?:** Optional deprecated property alongside required `mcp`
- **Parser fallback:** `normalizeMcp()` in both parser.ts and package-reader.ts falls back to `frontmatter["mcp_servers"]` when the primary field is not found
- **Dialect defaults:** All dialects now map to `"mcp"` as the frontmatter field name

## Verification

- `npx tsc --noEmit` passes for shared package
- `npx eslint src/ tests/` passes for shared package
- `npx vitest run packages/shared/tests/` -- 294 tests pass (14 files)
- Backwards-compat fallback verified: YAML fixtures with `mcp_servers:` still parse correctly
