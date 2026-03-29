# Rename apps/AppConfig to mcp/McpServerConfig — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** ClawForge, Inc.

---

## 1. Problem Statement

The codebase uses "apps" and "AppConfig" internally for what are actually MCP server configurations. This creates a naming mismatch across the three layers of the system:

- **Frontmatter layer** (YAML in ROLE.md): Uses `mcp_servers` — already correctly named, but verbose.
- **Internal Role types layer** (Zod schema + TypeScript): Uses `appConfigSchema` / `AppConfig` type, and the field name `apps` on the `roleSchema`. The word "app" does not describe what these objects represent.
- **Resolved types layer** (ResolvedAgent graph): Uses `ResolvedApp` interface and `apps` on `ResolvedRole`. Same mismatch.

This inconsistency makes the codebase harder to navigate. A developer encountering `role.apps` must learn that "apps" actually means "MCP servers." The frontmatter already uses `mcp_servers`, which is closer to the truth but needlessly long — `mcp` is sufficient and consistent with how the community refers to these.

---

## 2. Goals

### User Goals

- **G-1 Consistent naming.** All three layers use the term `mcp` for the field and `McpServerConfig` / `ResolvedMcpServer` for the types. A developer can follow a single name from ROLE.md frontmatter through to the resolved dependency graph.
- **G-2 Backwards compatibility.** Existing ROLE.md files that use `mcp_servers:` in frontmatter continue to work via a parser fallback. Users are not forced to update their files immediately.
- **G-3 Clean public API.** The `@clawmasons/shared` package exports `McpServerConfig`, `mcpServerConfigSchema`, and `ResolvedMcpServer` as the canonical names.

### Non-Goals

- **NG-1 Behavioral changes.** No changes to how MCP servers are parsed, validated, materialized, or launched. This is purely a naming refactor.
- **NG-2 New features.** No new fields, validation rules, or capabilities are added.
- **NG-3 Historical document updates.** Archived OpenSpec changes (`openspec/changes/archive/`) are not updated — they represent point-in-time state.

---

## 3. Design Principles

- **Bottom-up rename.** Change types and schemas first, then internal functions, then consumers, then tests. Each step should produce a compilable codebase.
- **Mechanical consistency.** Every occurrence of the old name is updated. No partial renames.
- **Graceful deprecation.** The parser falls back to `mcp_servers` when the new `mcp` field is not found, ensuring existing ROLE.md files keep working.

---

## 4. Naming Map

| Before | After | Location |
|--------|-------|----------|
| `appConfigSchema` | `mcpServerConfigSchema` | `packages/shared/src/schemas/role-types.ts` |
| `AppConfig` | `McpServerConfig` | `packages/shared/src/types/role.ts` |
| `roleSchema.apps` | `roleSchema.mcp` | `packages/shared/src/schemas/role-types.ts` |
| `ResolvedApp` | `ResolvedMcpServer` | `packages/shared/src/types.ts` |
| `ResolvedRole.apps` | `ResolvedRole.mcp` | `packages/shared/src/types.ts` |
| `UpstreamAppConfig` | `UpstreamMcpConfig` | `packages/proxy/src/upstream.ts` |
| `DialectFieldMapping.apps` | `DialectFieldMapping.mcp` | `packages/shared/src/role/dialect-registry.ts` |
| `AgentDialectInfo.dialectFields.apps` | `AgentDialectInfo.dialectFields.mcp` | `packages/shared/src/role/dialect-registry.ts` |
| `normalizeApps()` | `normalizeMcp()` | `packages/shared/src/role/parser.ts`, `package-reader.ts` |
| `adaptApp()` | `adaptMcpServer()` | `packages/shared/src/role/adapter.ts` |
| `collectApps()` | `collectMcpServers()` | `packages/cli/src/cli/commands/proxy.ts` |
| frontmatter `mcp_servers:` | frontmatter `mcp:` | All dialects via dialect-registry.ts |

**Not renamed:** `getAppShortName()` — it strips npm package type prefixes generically (e.g., `app-github` → `github`) and is not MCP-specific.

---

## 5. Changes by Layer

### 5.1 Schema & Type Definitions (`@clawmasons/shared`)

**Files:**
- `packages/shared/src/schemas/role-types.ts` — rename `appConfigSchema` → `mcpServerConfigSchema` (L28), rename `apps` → `mcp` on `roleSchema` (L107)
- `packages/shared/src/types/role.ts` — rename import and type: `AppConfig` → `McpServerConfig` (L6, L19)
- `packages/shared/src/types.ts` — rename `ResolvedApp` → `ResolvedMcpServer` (L16), rename `ResolvedRole.apps` → `ResolvedRole.mcp` (L102)
- `packages/shared/src/index.ts` — update all re-exports

### 5.2 Dialect Registry

**Files:**
- `packages/shared/src/role/dialect-registry.ts`:
  - Rename `DialectFieldMapping.apps` → `.mcp` (L19)
  - Rename `AgentDialectInfo.dialectFields.apps` → `.mcp` (L118)
  - Change default: `info.dialectFields?.apps ?? "mcp_servers"` → `info.dialectFields?.mcp ?? "mcp"` (L140)
  - All 3 static dialect registrations: `apps: "mcp_servers"` → `mcp: "mcp"` (L157, L167, L178)

### 5.3 Parser (with backwards-compat fallback)

**Files:**
- `packages/shared/src/role/parser.ts` — rename `normalizeApps()` → `normalizeMcp()`. Change `dialect.fieldMapping.apps` → `.mcp`. Add fallback: if field not found and `fieldName !== "mcp_servers"`, try `frontmatter["mcp_servers"]`.
- `packages/shared/src/role/package-reader.ts` — same pattern.

The fallback ensures existing ROLE.md files with `mcp_servers:` continue to parse correctly. This can be removed in a future version.

### 5.4 Adapter

**Files:**
- `packages/shared/src/role/adapter.ts` — rename `adaptApp()` → `adaptMcpServer()`, update `AppConfig` → `McpServerConfig` imports, update `role.apps` → `role.mcp`, update `aggregatePermissions()` parameter naming.

### 5.5 Proxy Package

**Files:**
- `packages/proxy/src/upstream.ts` — `UpstreamAppConfig` → `UpstreamMcpConfig`, `ResolvedApp` → `ResolvedMcpServer`
- `packages/proxy/src/index.ts` — update re-export
- `packages/proxy/src/host-proxy.ts` — `ResolvedApp` → `ResolvedMcpServer`

### 5.6 CLI Commands

**Files:**
- `packages/cli/src/cli/commands/run-agent.ts` — `AppConfig` → `McpServerConfig`, `role.apps` → `role.mcp`
- `packages/cli/src/cli/commands/proxy.ts` — `collectApps()` → `collectMcpServers()`, `UpstreamAppConfig` → `UpstreamMcpConfig`, `role.apps` → `role.mcp`
- `packages/cli/src/cli/commands/list.ts` — `role.apps` → `role.mcp`
- `packages/cli/src/validator/validate.ts` — `role.apps` → `role.mcp`
- `packages/cli/src/materializer/proxy-dependencies.ts` — `role.apps` → `role.mcp`

### 5.7 Proposer (frontmatter generation)

**Files:**
- `packages/shared/src/mason/proposer.ts` — `frontmatter.mcp_servers = ...` → `frontmatter.mcp = ...`

### 5.8 Agent SDK

**Files:**
- `packages/agent-sdk/src/types.ts` — `dialectFields.apps` → `dialectFields.mcp`

---

## 6. Test Updates

All test files are updated mechanically to match the renamed types and fields. Key files:

| Package | Files |
|---------|-------|
| `shared` | `role-adapter.test.ts`, `role-parser.test.ts`, `role.test.ts`, `schemas/role-types.test.ts`, `dialect-registry.test.ts`, `dialect-integration.test.ts`, `mason-proposer.test.ts`, `mason-scanner.test.ts`, `role-package-reader.test.ts` |
| `cli` | `validator/validate.test.ts`, `cli/run-agent.test.ts`, `cli/permissions.test.ts`, `helpers/mock-agent-packages.ts`, `generator/*.test.ts`, `materializer/*.test.ts`, `acp/*.test.ts` |
| `proxy` | `upstream.test.ts`, `host-mcp/*.test.ts` |
| `agent-sdk` | `helpers.test.ts` |

Changes in test files:
- Type imports: `AppConfig` → `McpServerConfig`, `ResolvedApp` → `ResolvedMcpServer`, `UpstreamAppConfig` → `UpstreamMcpConfig`
- Field references: `.apps` → `.mcp`, `apps:` → `mcp:`
- YAML strings: `mcp_servers:` → `mcp:` in test fixtures
- Schema references: `appConfigSchema` → `mcpServerConfigSchema`
- Dialect mapping assertions: `fieldMapping.apps` → `fieldMapping.mcp`, `"mcp_servers"` → `"mcp"`

---

## 7. Fixture & Documentation Updates

### 7.1 ROLE.md Files

All ROLE.md files in the project that use `mcp_servers:` must be updated to `mcp:`. Identified files:

- `packages/agent-sdk/fixtures/claude-test-project/.mason/roles/writer/ROLE.md` (L13) — `mcp_servers:` → `mcp:`

Files confirmed to NOT need changes (no `mcp_servers` field):
- `.mason/roles/developer/ROLE.md`
- `.mason/roles/lead/ROLE.md`
- `packages/cli/tests/e2e/fixtures/project-role/.mason/roles/writer/ROLE.md`

Files in `tmp/` are ephemeral test outputs and should not be tracked.

### 7.2 Documentation
- `docs/role.md` — update all `mcp_servers` references and examples to `mcp`
- `docs/security.md` — update `mcp_servers` examples
- `docs/proxy.md` — update `mcp_servers` examples
- `docs/concepts.md` — update `mcp_servers` examples

### 7.3 Specs
- `openspec/specs/role-md-parser-dialect-registry/spec.md` — update `mcp_servers` references

### 7.4 Not Updated
- `openspec/changes/archive/` — historical records, not updated.

---

## 8. Backwards Compatibility

### 8.1 ROLE.md Frontmatter

Existing ROLE.md files using `mcp_servers:` continue to work. The parser's `normalizeMcp()` function implements a fallback:

```typescript
function normalizeMcp(
  frontmatter: Record<string, unknown>,
  dialect: DialectEntry,
): Array<Record<string, unknown>> {
  const fieldName = dialect.fieldMapping.mcp;
  let raw = frontmatter[fieldName];

  // Backwards compat: accept old "mcp_servers" field
  if (!raw && fieldName !== "mcp_servers" && frontmatter["mcp_servers"]) {
    raw = frontmatter["mcp_servers"];
  }

  if (!raw || !Array.isArray(raw)) return [];
  // ... normalize items
}
```

This fallback can be removed in a future major version.

### 8.2 TypeScript API

No deprecated aliases are needed. All consumers are within the monorepo and will be updated atomically in the same PR.

---

## 9. Verification

1. **Compilation:** `npx tsc --noEmit` passes across all packages
2. **Linting:** `npx eslint src/ tests/` passes
3. **Unit tests per package:**
   - `npx vitest run packages/shared/tests/`
   - `npx vitest run packages/cli/tests/`
   - `npx vitest run packages/proxy/tests/`
   - `npx vitest run packages/agent-sdk/tests/`
4. **Stale reference check:** `rg "appConfigSchema|AppConfig|ResolvedApp|UpstreamAppConfig" --type ts` returns zero hits (excluding node_modules)
5. **Stale frontmatter check:** `rg "mcp_servers" --type ts` only appears in the backwards-compat fallback in `parser.ts` and `package-reader.ts`
