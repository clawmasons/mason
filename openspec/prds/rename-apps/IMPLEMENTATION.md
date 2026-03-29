# Rename apps/AppConfig to mcp/McpServerConfig — Implementation Plan

**PRD:** [openspec/prds/rename-apps/PRD.md](./PRD.md)
**Phase:** Full rename (pure refactor, no behavioral changes)

---

## Implementation Steps

### CHANGE 1: Rename types, schemas, and internal functions in @clawmasons/shared

Rename all type definitions, Zod schemas, internal functions, and dialect field mappings in the shared package. Add temporary backwards-compat re-exports so downstream packages (proxy, cli, agent-sdk, mason-extensions) continue to compile. Update all shared package tests.

**PRD refs:** §4 Naming Map, §5.1 Schema & Type Definitions, §5.2 Dialect Registry, §5.3 Parser, §5.4 Adapter, §5.7 Proposer, §8 Backwards Compatibility

**User Story:** As a developer working on mason, I want the foundational types in `@clawmasons/shared` to use `McpServerConfig` / `ResolvedMcpServer` / `mcpServerConfigSchema` instead of the legacy `AppConfig` / `ResolvedApp` / `appConfigSchema` names, so that the type names match what these objects actually represent — MCP server configurations, not "apps."

**Scope:**

#### 1.1 Schema rename — `packages/shared/src/schemas/role-types.ts`
- Rename `appConfigSchema` → `mcpServerConfigSchema` (schema definition)
- Rename `roleSchema` field `apps` → `mcp` (field on the Zod role schema)

#### 1.2 Schema barrel re-export — `packages/shared/src/schemas/index.ts`
- Update export: `appConfigSchema` → `mcpServerConfigSchema`

#### 1.3 Type rename — `packages/shared/src/types/role.ts`
- Update import: `appConfigSchema` → `mcpServerConfigSchema`
- Rename type alias: `AppConfig` → `McpServerConfig`

#### 1.4 Resolved type rename — `packages/shared/src/types.ts`
- Rename interface: `ResolvedApp` → `ResolvedMcpServer`
- Rename field on `ResolvedRole`: `apps: ResolvedApp[]` → `mcp: ResolvedMcpServer[]`

#### 1.5 Package barrel with backwards-compat aliases — `packages/shared/src/index.ts`
- Update primary exports to new names: `McpServerConfig`, `mcpServerConfigSchema`, `ResolvedMcpServer`
- Add temporary backwards-compat re-exports so downstream packages still compile:
  ```typescript
  /** @deprecated Use McpServerConfig */
  export { McpServerConfig as AppConfig } from "./types/role.js";
  /** @deprecated Use mcpServerConfigSchema */
  export { mcpServerConfigSchema as appConfigSchema } from "./schemas/index.js";
  /** @deprecated Use ResolvedMcpServer */
  export { ResolvedMcpServer as ResolvedApp } from "./types.js";
  ```
  Note: These aliases do NOT cover the `ResolvedRole.apps` → `.mcp` property rename. Downstream code accessing `.apps` will get a TypeScript error. To handle this, add a temporary optional `apps?` property alongside `mcp` on `ResolvedRole` in `types.ts`:
  ```typescript
  export interface ResolvedRole {
    // ...
    mcp: ResolvedMcpServer[];
    /** @deprecated Use mcp */
    apps?: ResolvedMcpServer[];
    // ...
  }
  ```
  Similarly for `Role` in the schema output — the Zod schema field rename from `apps` to `mcp` means the parsed type changes. The adapter and parser already produce `mcp`, but downstream code may still read `.apps`. The temporary `apps?` field on `ResolvedRole` covers the most common access pattern.

#### 1.6 Dialect Registry — `packages/shared/src/role/dialect-registry.ts`
- Rename `DialectFieldMapping` property: `apps` → `mcp`
- Rename `AgentDialectInfo.dialectFields` property: `apps` → `mcp`
- Change default value in `registerAgentDialect()`: `info.dialectFields?.apps ?? "mcp_servers"` → `info.dialectFields?.mcp ?? "mcp"`
- Update all 3 static dialect registrations (codex, aider, mason): `apps: "mcp_servers"` → `mcp: "mcp"`

#### 1.7 Parser — `packages/shared/src/role/parser.ts`
- Rename function: `normalizeApps()` → `normalizeMcp()`
- Update field mapping access: `dialect.fieldMapping.apps` → `dialect.fieldMapping.mcp`
- Update roleData construction: `apps,` → `mcp,`
- Add backwards-compat fallback in `normalizeMcp()`:
  ```typescript
  const fieldName = dialect.fieldMapping.mcp;
  let raw = frontmatter[fieldName];
  // Backwards compat: accept old "mcp_servers" field
  if (!raw && fieldName !== "mcp_servers" && frontmatter["mcp_servers"]) {
    raw = frontmatter["mcp_servers"];
  }
  ```

#### 1.8 Package Reader — `packages/shared/src/role/package-reader.ts`
- Rename function: `normalizeApps()` → `normalizeMcp()`
- Update `GENERIC_FIELD_MAPPING`: `apps: "apps"` → `mcp: "mcp"`
- Update field mapping access: `dialect.fieldMapping.apps` → `dialect.fieldMapping.mcp`
- Update roleData construction: `apps,` → `mcp,`
- Add same backwards-compat fallback as parser

#### 1.9 Adapter — `packages/shared/src/role/adapter.ts`
- Update imports: `AppConfig` → `McpServerConfig`, `ResolvedApp` → `ResolvedMcpServer`
- Rename function: `adaptApp()` → `adaptMcpServer()`
- Update `aggregatePermissions()` parameter: `apps: AppConfig[]` → `mcp: McpServerConfig[]`
- Update field accesses: `role.apps` → `role.mcp`
- Update resolved role construction: `apps,` → `mcp,`

#### 1.10 Proposer — `packages/shared/src/mason/proposer.ts`
- Update frontmatter field: `frontmatter.mcp_servers = ...` → `frontmatter.mcp = ...`

#### 1.11 Shared package tests (all files)
Update all test files in `packages/shared/tests/` to use new names:
- `role.test.ts` — `appConfigSchema` → `mcpServerConfigSchema`, `.apps` → `.mcp`
- `schemas/role-types.test.ts` — `appConfigSchema` → `mcpServerConfigSchema`
- `role-adapter.test.ts` — `.apps` → `.mcp` in role construction and assertions
- `role-parser.test.ts` — `fieldMapping.apps` → `fieldMapping.mcp`, YAML `mcp_servers:` → `mcp:`, `.apps` → `.mcp`
- `role-package-reader.test.ts` — `.apps` → `.mcp`, YAML `mcp_servers:` → `mcp:` in test fixtures
- `dialect-registry.test.ts` — `fieldMapping.apps` → `fieldMapping.mcp`, expected values `"mcp_servers"` → `"mcp"`
- `dialect-integration.test.ts` — `fieldMapping.apps` → `fieldMapping.mcp`, expected values `"mcp_servers"` → `"mcp"`
- `mason-proposer.test.ts` — `.apps` → `.mcp`, `"mcp_servers:"` → `"mcp:"` in assertions
- `mason-scanner.test.ts` — `apps: "mcp_servers"` → `mcp: "mcp"` in dialect field mapping

**Testable output:** All shared package unit tests pass with the new names. Downstream packages still compile via backwards-compat aliases. Run `npx vitest run packages/shared/tests/` — all tests green.

**Tests to be run:**
   - `npm run lint`
   - `npm run build`
   - `npm run test`
   - `npm run test:e2e`
   - in `../mason-extensions`, run `npm run lint`
   - in `../mason-extensions`, run `npm run build`
   - in `../mason-extensions`, run `npm run test`
   - in `../mason-extensions`, run `npm run test:e2e`

**Not Implemented Yet**

---

### CHANGE 2: Update all consumers, remove backwards-compat aliases, update fixtures and docs

Update all downstream packages (proxy, cli, agent-sdk) in the mason repo and test files in mason-extensions to use the new type names. Remove the temporary backwards-compat re-exports and deprecated `apps?` property from shared. Update ROLE.md fixtures and documentation.

**PRD refs:** §5.5 Proxy Package, §5.6 CLI Commands, §5.8 Agent SDK, §6 Test Updates, §7 Fixture & Documentation Updates, §9 Verification

**User Story:** As a developer working across any mason package, I see consistent `McpServerConfig` / `ResolvedMcpServer` / `.mcp` naming everywhere — no more legacy `AppConfig` / `ResolvedApp` / `.apps` references remain in the codebase.

**Scope:**

#### 2.1 Remove backwards-compat aliases — `packages/shared/src/index.ts`
- Remove the deprecated re-exports added in CHANGE 1 (`AppConfig`, `appConfigSchema`, `ResolvedApp`)

#### 2.2 Remove deprecated `apps?` field — `packages/shared/src/types.ts`
- Remove the temporary `apps?: ResolvedMcpServer[]` property from `ResolvedRole`

#### 2.3 Proxy package — `packages/proxy/src/`
- `upstream.ts` — Rename interface `UpstreamAppConfig` → `UpstreamMcpConfig`, update import `ResolvedApp` → `ResolvedMcpServer`
- `index.ts` — Update re-export: `UpstreamAppConfig` → `UpstreamMcpConfig`
- `host-proxy.ts` — Update import and type: `ResolvedApp` → `ResolvedMcpServer`

#### 2.4 CLI commands — `packages/cli/src/cli/commands/`
- `run-agent.ts` — Update imports (`AppConfig` → `McpServerConfig`, `ResolvedApp` → `ResolvedMcpServer`), all `.apps` → `.mcp` accesses, local variable types
- `proxy.ts` — Rename function `collectApps()` → `collectMcpServers()`, update import `UpstreamAppConfig` → `UpstreamMcpConfig`, `.apps` → `.mcp`
- `list.ts` — `.apps` → `.mcp`

#### 2.5 CLI internals — `packages/cli/src/`
- `validator/validate.ts` — `ResolvedApp` → `ResolvedMcpServer`, `.apps` → `.mcp`
- `materializer/proxy-dependencies.ts` — `.apps` → `.mcp`
- `resolver/resolve.ts` — `ResolvedApp` → `ResolvedMcpServer`, `.apps` → `.mcp` (if present)
- `resolver/index.ts` — update re-export
- `index.ts` — update re-export

#### 2.6 Agent SDK — `packages/agent-sdk/src/types.ts`
- `dialectFields.apps` → `dialectFields.mcp`

#### 2.7 Proxy package tests
- `packages/proxy/tests/upstream.test.ts` — `UpstreamAppConfig` → `UpstreamMcpConfig`, `ResolvedApp` → `ResolvedMcpServer`
- `packages/proxy/tests/integration-proxy.test.ts` — `ResolvedApp` → `ResolvedMcpServer`
- `packages/proxy/tests/host-mcp/lifecycle.test.ts` — `ResolvedApp` → `ResolvedMcpServer`
- `packages/proxy/tests/host-mcp/routing.test.ts` — `ResolvedApp` → `ResolvedMcpServer`

#### 2.8 CLI package tests
- `packages/cli/tests/cli/run-agent.test.ts` — `.apps` → `.mcp`
- `packages/cli/tests/validator/validate.test.ts` — `ResolvedApp` → `ResolvedMcpServer`, `.apps` → `.mcp`
- `packages/cli/tests/resolver/resolve.test.ts` — `.apps` → `.mcp`
- `packages/cli/tests/helpers/mock-agent-packages.ts` — `apps: "mcp_servers"` → `mcp: "mcp"` in dialectFields
- `packages/cli/tests/cli/permissions.test.ts` — YAML `mcp_servers:` → `mcp:` in test fixtures
- Other CLI test files with `ResolvedApp` / `.apps` references (generator, materializer, acp tests)

#### 2.9 Other package tests
- `packages/mcp-agent/tests/materializer.test.ts` — `ResolvedApp` → `ResolvedMcpServer`, `apps:` → `mcp:`
- `packages/agent-sdk/tests/helpers.test.ts` — update if it references dialectFields

#### 2.10 mason-extensions test files
- `agents/claude-code-agent/tests/materializer.test.ts` — `ResolvedApp` → `ResolvedMcpServer`, `apps:` → `mcp:`
- `agents/pi-coding-agent/tests/materializer.test.ts` — `ResolvedApp` → `ResolvedMcpServer`, `apps:` → `mcp:`
- Note: codex-agent's `mcp_servers` in TOML config is codex's own format — NOT our rename target

#### 2.11 Fixture updates
- `packages/agent-sdk/fixtures/claude-test-project/.mason/roles/writer/ROLE.md` — `mcp_servers:` → `mcp:`

#### 2.12 Documentation updates
- `docs/role.md` — update all `mcp_servers` references and examples to `mcp`
- `docs/security.md` — update `mcp_servers` examples
- `docs/proxy.md` — update `mcp_servers` examples
- `docs/concepts.md` — update `mcp_servers` examples
- `openspec/specs/role-md-parser-dialect-registry/spec.md` — update `mcp_servers` references

#### 2.13 Verification — stale reference check
After all changes, run:
- `rg "appConfigSchema|AppConfig[^a-z]|ResolvedApp[^a-z]|UpstreamAppConfig" --type ts` → 0 hits (excluding node_modules)
- `rg "mcp_servers" --type ts` → only in parser.ts and package-reader.ts backwards-compat fallback
- `rg "\\.apps" --type ts` on role/resolved objects → 0 hits (excluding unrelated `.apps` like DOM/express)

**Testable output:** Zero stale references. All tests pass across both repos. The codebase consistently uses `mcp` / `McpServerConfig` / `ResolvedMcpServer` everywhere.

**Tests to be run:**
   - `npm run lint`
   - `npm run build`
   - `npm run test`
   - `npm run test:e2e`
   - in `../mason-extensions`, run `npm run lint`
   - in `../mason-extensions`, run `npm run build`
   - in `../mason-extensions`, run `npm run test`
   - in `../mason-extensions`, run `npm run test:e2e`

**Not Implemented Yet**
