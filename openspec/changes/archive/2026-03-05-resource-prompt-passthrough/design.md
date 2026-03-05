# Design: Resource & Prompt Passthrough

## Context

The forge proxy aggregates upstream MCP servers behind a single endpoint. Tools are already prefixed (`<app>_<tool>`) and filtered by role permissions. The `UpstreamManager` already exposes `getResources()`, `getPrompts()`, `readResource()`, and `getPrompt()` methods — the plumbing exists, but the proxy server doesn't wire these to MCP handlers.

Resources and prompts are read-only capabilities. Per the PRD (REQ-009), they are NOT filtered by role permissions — all resources and prompts from all upstream apps are passed through with name prefixing.

## Goals

- Forward all four MCP resource/prompt operations through the proxy with `<app>_` name prefixing
- Reuse the same prefixing convention as tools (`getAppShortName()` + underscore)
- Keep resource/prompt routing separate from tool routing (no filtering logic)

## Non-Goals

- Role-based filtering of resources or prompts
- Audit logging for resource reads or prompt gets (tools only for now)
- Resource template support (future MCP feature)

## Decisions

### D1: Separate router classes for resources and prompts

**Choice:** Create `ResourceRouter` and `PromptRouter` as lightweight classes in `router.ts`, separate from `ToolRouter`.

**Rationale:** Resources and prompts have different MCP types (`Resource` vs `Prompt` vs `Tool`) and different routing semantics (no filtering). Mixing them into `ToolRouter` would complicate its constructor and violate single-responsibility. Separate classes keep each focused.

**Alternative considered:** A generic `PrefixRouter<T>` base class. Rejected because the three types have different shapes (resources have `uri` + `name`, prompts have `name` + `arguments`, tools have `name` + `inputSchema`) and the generics would add complexity for only 3 users.

### D2: Resources route by prefixed name, not by URI

**Choice:** Prefix the resource `name` field (e.g., `github_repository`), and route `resources/read` by matching the prefixed name back to the app + original URI.

**Rationale:** The MCP `resources/read` request takes a `uri` parameter, but the runtime discovers resources via `resources/list` which returns `name` + `uri`. We prefix the `name` for disambiguation across apps but must also make the `uri` unique. We prefix the URI with the app short name scheme: `<app>://<original-uri-without-scheme>` or simply store the mapping from prefixed name → (app, original URI).

Actually, on reflection: the MCP `resources/read` request uses the `uri` field, not the `name` field. So we need to make URIs unique across apps. The simplest approach: store a routing map from original URI → appName. If two apps expose the same URI, the first one wins (edge case — documented as a limitation).

**Alternative considered:** Prefixing URIs with a custom scheme like `forge+github://...`. Rejected as it changes URI semantics and may confuse clients.

### D3: Pass upstream UpstreamManager directly to server for resource/prompt operations

**Choice:** The server calls `upstream.getResources(appName)` and `upstream.readResource(appName, uri)` directly, using the router only for name/URI resolution.

**Rationale:** Consistent with how tool calls work — the router resolves the target, the upstream manager executes. Keeps the server as the orchestrator.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Two apps expose same resource URI | First app wins in routing table. Log a warning. Edge case unlikely in practice. |
| Resource/prompt listing is async (requires upstream calls) | Router is built once at startup from pre-fetched data, same pattern as tools |
| MCP SDK capabilities must declare resources/prompts | Add `resources: {}` and `prompts: {}` to server capabilities |
