# Spec: Update all consumers, remove backwards-compat aliases

**Change:** CHANGE 2 from PRD `rename-apps`
**Date:** 2026-03-29

## Requirements

1. All TypeScript source files use `McpServerConfig`, `ResolvedMcpServer`, `UpstreamMcpConfig`, `.mcp` instead of legacy names
2. All test files use the new names
3. Fixture ROLE.md files use `mcp:` instead of `mcp_servers:`
4. Documentation uses `mcp:` instead of `mcp_servers:`
5. Backwards-compat aliases are removed from `@clawmasons/shared`
6. Zero stale references remain (verified by grep)
7. All tests pass in both repos

## Verification

```bash
# No stale type references
rg "appConfigSchema|AppConfig[^a-z]|ResolvedApp[^a-z]|UpstreamAppConfig" --type ts  # 0 hits

# mcp_servers only in backwards-compat fallback
rg "mcp_servers" --type ts  # only parser.ts, package-reader.ts

# No .apps on role objects
rg "\.apps\b" --type ts packages/  # 0 hits on role objects

# All tests pass
npm run lint && npm run build && npm run test && npm run test:e2e
cd ../mason-extensions && npm run lint && npm run build && npm run test && npm run test:e2e
```
