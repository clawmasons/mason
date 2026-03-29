# Tasks: Rename types, schemas, and internal functions in @clawmasons/shared

## Implementation Tasks

- [x] 1. Rename schema: `appConfigSchema` -> `mcpServerConfigSchema` in `role-types.ts`
- [x] 2. Rename roleSchema field: `apps` -> `mcp` in `role-types.ts`
- [x] 3. Update schema barrel: `appConfigSchema` -> `mcpServerConfigSchema` in `schemas/index.ts`
- [x] 4. Rename type: `AppConfig` -> `McpServerConfig` in `types/role.ts`
- [x] 5. Rename interface: `ResolvedApp` -> `ResolvedMcpServer` in `types.ts`
- [x] 6. Rename field: `ResolvedRole.apps` -> `ResolvedRole.mcp` in `types.ts` (add deprecated `apps?`)
- [x] 7. Update package barrel `index.ts`: new primary exports + backwards-compat aliases
- [x] 8. Update dialect registry: field mapping, defaults, static registrations
- [x] 9. Rename `normalizeApps` -> `normalizeMcp` in parser.ts + add fallback
- [x] 10. Rename `normalizeApps` -> `normalizeMcp` in package-reader.ts + add fallback
- [x] 11. Update adapter.ts: `adaptApp` -> `adaptMcpServer`, field accesses
- [x] 12. Update proposer.ts: `frontmatter.mcp_servers` -> `frontmatter.mcp`
- [x] 13. Update all shared test files

## Verification

- [x] 14. `npx tsc --noEmit` passes (shared package)
- [x] 15. `npx eslint src/ tests/` passes in shared package
- [x] 16. `npx vitest run packages/shared/tests/` all green (294 tests, 14 files)
- [x] 17. Downstream packages compile via backwards-compat type aliases (field rename requires Change #2)
