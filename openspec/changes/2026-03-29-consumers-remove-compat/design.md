# Design: Update all consumers, remove backwards-compat aliases

**Change:** CHANGE 2 from PRD `rename-apps`
**Date:** 2026-03-29

## Approach

This is a mechanical rename with no behavioral changes. The strategy is:

1. **Update source files first** (proxy, cli, agent-sdk, mcp-agent)
2. **Update test files** in both repos
3. **Update fixtures and docs**
4. **Remove backwards-compat aliases** from shared last (so builds succeed at each step)

## Detailed Changes

### Source Files (mason repo)

#### Proxy package (`packages/proxy/src/`)
- `upstream.ts`: `UpstreamAppConfig` -> `UpstreamMcpConfig`, `ResolvedApp` -> `ResolvedMcpServer`, `app` field -> `server` field
- `index.ts`: Update re-export `UpstreamAppConfig` -> `UpstreamMcpConfig`
- `host-proxy.ts`: `ResolvedApp` -> `ResolvedMcpServer`, `hostApps` -> stays (internal naming is fine, the type changes)

#### CLI package (`packages/cli/src/`)
- `cli/commands/run-agent.ts`: `AppConfig` -> `McpServerConfig`, `ResolvedApp` -> `ResolvedMcpServer`, `.apps` -> `.mcp`
- `cli/commands/proxy.ts`: `collectApps()` -> `collectMcpServers()`, `UpstreamAppConfig` -> `UpstreamMcpConfig`, `.apps` -> `.mcp`
- `cli/commands/list.ts`: `.apps` -> `.mcp`, display label stays as-is or changes to `mcp`
- `validator/validate.ts`: `ResolvedApp` -> `ResolvedMcpServer`, `.apps` -> `.mcp`
- `materializer/proxy-dependencies.ts`: `.apps` -> `.mcp`
- `resolver/resolve.ts`: `ResolvedApp` -> `ResolvedMcpServer`, `.apps` -> `.mcp`
- `resolver/index.ts`: Update re-export
- `index.ts`: Update re-export if needed

#### Agent SDK (`packages/agent-sdk/src/`)
- `types.ts`: `dialectFields.apps` -> `dialectFields.mcp`

#### MCP Agent (`packages/mcp-agent/`)
- No source changes expected (only tests)

### Test Files (mason repo)

- `packages/proxy/tests/upstream.test.ts`
- `packages/proxy/tests/integration-proxy.test.ts`
- `packages/proxy/tests/host-mcp/lifecycle.test.ts`
- `packages/proxy/tests/host-mcp/routing.test.ts`
- `packages/cli/tests/cli/run-agent.test.ts`
- `packages/cli/tests/validator/validate.test.ts`
- `packages/cli/tests/validator/integration.test.ts`
- `packages/cli/tests/resolver/resolve.test.ts`
- `packages/cli/tests/helpers/mock-agent-packages.ts`
- `packages/cli/tests/cli/permissions.test.ts`
- `packages/cli/tests/generator/agent-dockerfile.test.ts`
- `packages/cli/tests/materializer/mcp-agent.test.ts`
- `packages/mcp-agent/tests/materializer.test.ts`
- `packages/shared/tests/role.test.ts` (residual `.apps` refs)
- `packages/shared/tests/role-adapter.test.ts` (residual `.apps` refs)

### Test Files (mason-extensions repo)

- `agents/claude-code-agent/tests/materializer.test.ts`: `ResolvedApp` -> `ResolvedMcpServer`, `apps:` -> `mcp:`
- `agents/pi-coding-agent/tests/materializer.test.ts`: `ResolvedApp` -> `ResolvedMcpServer`, `apps:` -> `mcp:`
- `agents/codex-agent/tests/materializer.test.ts`: `apps:` -> `mcp:` (only in role construction, NOT in codex's own TOML `mcp_servers` config)

### Fixtures
- `packages/agent-sdk/fixtures/claude-test-project/.mason/roles/writer/ROLE.md`: `mcp_servers:` -> `mcp:`

### Documentation
- `docs/role.md`, `docs/security.md`, `docs/proxy.md`, `docs/concepts.md`: `mcp_servers` -> `mcp`
- `openspec/specs/role-md-parser-dialect-registry/spec.md`: `mcp_servers` -> `mcp`

### Remove backwards-compat aliases
- `packages/shared/src/index.ts`: Remove 3 deprecated re-exports
- `packages/shared/src/types.ts`: Remove `apps?: ResolvedMcpServer[]` from `ResolvedRole`

## Test Coverage

No new tests needed. All existing tests are updated to use the new names. The test suite validates:
- Type compilation (build step)
- Proxy upstream management with `UpstreamMcpConfig`
- CLI commands accessing `.mcp` on resolved roles
- Validator checking `.mcp` servers
- Parser backwards-compat fallback for `mcp_servers` frontmatter (tested in shared)

## Risks

- **Low**: Pure mechanical rename. If any reference is missed, TypeScript compiler will catch it.
- **mason-extensions**: Must be updated in lockstep since it depends on `@clawmasons/shared`.
