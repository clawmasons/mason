# Proposal: Resource & Prompt Passthrough

## Why

The forge proxy currently aggregates upstream MCP tools with name prefixing, role-based filtering, audit logging, and approval workflows. However, MCP servers also expose **resources** (read-only data endpoints) and **prompts** (parameterized prompt templates). Runtimes connecting to the proxy cannot access these capabilities because the proxy doesn't forward `resources/list`, `resources/read`, `prompts/list`, or `prompts/get` requests.

**PRD ref:** REQ-009 (Resource and Prompt Passthrough)

Without resource and prompt passthrough, agents miss capabilities that upstream apps provide — e.g., reading repository metadata via resources or using pre-built prompt templates for code review.

## What Changes

- **Modify `src/proxy/router.ts`** — Add `ResourceRouter` and `PromptRouter` classes that handle name prefixing and resolution for resources and prompts. Unlike tools, these are NOT filtered by role permissions (read-only passthrough).
- **Modify `src/proxy/server.ts`** — Register MCP handlers for `resources/list`, `resources/read`, `prompts/list`, and `prompts/get`. Declare `resources` and `prompts` capabilities on the MCP server.
- **Extend `tests/proxy/router.test.ts`** — Add test suites for `ResourceRouter` and `PromptRouter`.
- **Extend `tests/proxy/server.test.ts`** — Add test suites for resource and prompt handler integration.

## Capabilities

### New Capabilities
- `resources/list` returns prefixed resource names from all upstream apps
- `resources/read` resolves prefixed name and forwards to correct upstream
- `prompts/list` returns prefixed prompt names from all upstream apps
- `prompts/get` resolves prefixed name and forwards to correct upstream

### Modified Capabilities
- MCP server capabilities now declare `resources` and `prompts` support
- `ForgeProxyServerConfig` accepts resource and prompt routers

## Impact

| Area | Details |
|------|---------|
| New files | None |
| Modified files | `src/proxy/router.ts`, `src/proxy/server.ts`, `tests/proxy/router.test.ts`, `tests/proxy/server.test.ts` |
| New dependencies | None (uses existing `@modelcontextprotocol/sdk` types) |
| Depends on | CHANGE 2 (UpstreamManager — `getResources`, `getPrompts`, `readResource`, `getPrompt`), CHANGE 3 (ToolRouter — prefixing pattern) |
| Breaking changes | None — additive only |
