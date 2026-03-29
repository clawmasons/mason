# Proposal: Rename types, schemas, and internal functions in @clawmasons/shared

**Change:** IMPLEMENTATION.md Change #1
**PRD:** openspec/prds/rename-apps/PRD.md
**Date:** 2026-03-29

## Problem

The `@clawmasons/shared` package uses "apps" / "AppConfig" terminology internally for what are actually MCP server configurations. This naming mismatch makes the codebase harder to navigate. The field `role.apps` actually means "MCP servers," and `AppConfig` describes an MCP server config, not an application.

## Proposed Solution

Rename all type definitions, Zod schemas, internal functions, and dialect field mappings in the shared package from the legacy "apps" / "AppConfig" vocabulary to "mcp" / "McpServerConfig":

- **Schema:** `appConfigSchema` -> `mcpServerConfigSchema`, roleSchema field `apps` -> `mcp`
- **Types:** `AppConfig` -> `McpServerConfig`, `ResolvedApp` -> `ResolvedMcpServer`, `ResolvedRole.apps` -> `ResolvedRole.mcp`
- **Dialect registry:** `DialectFieldMapping.apps` -> `.mcp`, default field value `"mcp_servers"` -> `"mcp"`, all static registrations updated
- **Parser/package-reader:** `normalizeApps()` -> `normalizeMcp()`, field mapping access updated, backwards-compat fallback for `mcp_servers` in frontmatter
- **Adapter:** `adaptApp()` -> `adaptMcpServer()`, parameter/field renames
- **Proposer:** frontmatter output `mcp_servers` -> `mcp`

Temporary backwards-compat re-exports (`AppConfig`, `appConfigSchema`, `ResolvedApp`) will be added to `packages/shared/src/index.ts` so downstream packages continue to compile during the transition. A deprecated `apps?` property will be added to `ResolvedRole`.

## Scope

Only the `@clawmasons/shared` package source and tests. No downstream consumer packages are changed in this PR.

## Risks

- **Low:** Pure rename refactor with no behavioral changes.
- **Backwards-compat aliases** ensure downstream packages are not broken.

## Success Criteria

- All shared package unit tests pass with new names
- `npx tsc --noEmit` compiles cleanly
- `npx eslint src/ tests/` passes
- Downstream packages still compile via backwards-compat aliases
