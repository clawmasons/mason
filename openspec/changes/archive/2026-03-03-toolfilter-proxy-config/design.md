## Context

pam is a TypeScript/Node.js project (ESM, Zod, Vitest, Commander.js) with validated schemas for all five pam package types, a package discovery and dependency graph resolution engine, and a semantic validation engine. The resolver produces `ResolvedAgent` objects with all roles, tasks, apps, and skills resolved. The validator checks the graph for correctness.

The next step is generating the tbxark/mcp-proxy `config.json` — the runtime artifact that enforces governance at the network layer. The proxy config aggregates all app MCP servers behind a single endpoint and uses `toolFilter` entries to enforce least-privilege access.

PRD §6.3 defines the proxy config schema. PRD §6.3.1 defines the toolFilter generation algorithm. PRD §6.3.2 defines proxy authentication.

## Goals / Non-Goals

**Goals:**
- Implement the toolFilter generation algorithm: for each app, compute the union of all role allow-lists
- Generate a complete mcp-proxy `config.json` from a resolved agent
- Handle stdio transport (command+args+env) and remote transports (sse/streamable-http via url)
- Generate random `PAM_PROXY_TOKEN` for proxy authentication
- Preserve `${VAR}` interpolation in output (resolved at Docker runtime)
- Expose as a programmatic API (`computeToolFilters`, `generateProxyConfig`)

**Non-Goals:**
- CLI commands (`pam permissions`, `pam install`) — separate changes
- Docker Compose generation — separate change
- Runtime materializers (Claude Code, Codex workspaces) — separate change
- Writing the config to disk or managing file paths — callers handle that
- Strict per-role isolation mode (`--strict-roles`) — separate change

## Decisions

### 1. Two-function API surface

**Decision:** Expose two primary functions:
- `computeToolFilters(agent: ResolvedAgent): Map<string, ToolFilter>` — computes per-app toolFilter from role permission unions
- `generateProxyConfig(agent: ResolvedAgent, options?: ProxyConfigOptions): ProxyConfig` — generates the complete mcp-proxy config.json structure

**Rationale:** Separation of concerns. `computeToolFilters` is useful independently (for `pam permissions` display). `generateProxyConfig` composes it internally but callers can also use the raw filters. Both operate on the already-resolved agent — no filesystem I/O.

### 2. Generator source layout

**Decision:**
```
src/generator/
  toolfilter.ts     # computeToolFilters() — per-app allow-list union
  proxy-config.ts   # generateProxyConfig() — complete mcp-proxy config
  types.ts          # ToolFilter, ProxyConfig, McpServerEntry, ProxyConfigOptions
  index.ts          # Re-exports
```

**Rationale:** Mirrors existing `resolver/`, `validator/`, `schemas/` organization. Keeps toolFilter computation separate from config assembly for testability.

### 3. ToolFilter is the union of role allow-lists

**Decision:** For each app referenced by any role, collect all `allow` lists from every role that references that app, then compute the set union. The resulting `toolFilter` uses `mode: "allow"` with the union as the list.

**Rationale:** Direct implementation of PRD §6.3.1. The union provides the hard boundary — tools not in any role's allow-list are blocked. Per-role scoping is handled by the runtime layer (AGENTS.md, slash commands).

### 4. Config structure matches tbxark/mcp-proxy schema exactly

**Decision:** The `ProxyConfig` type mirrors the tbxark/mcp-proxy config.json schema: `mcpProxy` (baseURL, addr, name, version, type, options with authTokens and logging) and `mcpServers` (keyed by app short name, with command/args or url, env, and options.toolFilter).

**Rationale:** The generated JSON must be directly consumable by the mcp-proxy Docker image. No abstraction layer — the types match the target schema.

### 5. App short name as mcpServers key

**Decision:** Use the unscoped package name as the mcpServers key (e.g., `@clawforge/app-github` → `github`). Extract by taking the last segment after `/` and stripping the `app-` prefix if present.

**Rationale:** tbxark/mcp-proxy uses short names as server identifiers. The full npm package name is too verbose for config keys. This matches the PRD examples where `@clawforge/app-github` appears as `github`.

### 6. Token generation uses crypto.randomUUID

**Decision:** `PAM_PROXY_TOKEN` is generated via `crypto.randomUUID()` at config generation time. It's included in the `mcpProxy.options.authTokens` array. Callers (e.g., `pam install`) can override via `ProxyConfigOptions.authToken`.

**Rationale:** Simple, standard, no external dependencies. UUID v4 provides sufficient entropy for a local proxy token. Callers can supply their own token for deterministic testing or external secret management.

### 7. Environment variable interpolation is pass-through

**Decision:** The generator preserves `${VAR}` syntax in env values and the authTokens array. The output JSON contains literal strings like `"${GITHUB_TOKEN}"` — these are resolved by the mcp-proxy container at runtime via its own env interpolation.

**Rationale:** pam generates config at install time, not run time. Credential values aren't known during generation. The mcp-proxy natively supports `${}` interpolation in its config.

## Risks / Trade-offs

- **[Risk] App name collision:** Two apps with different scopes but same short name (e.g., `@org-a/app-github` and `@org-b/app-github`) would collide as mcpServers keys. Mitigation: the resolver already prevents duplicate app names in a single agent. If it becomes an issue, fall back to the full package name.
- **[Trade-off] No validation in generator:** The generator assumes the agent has already been validated. Passing an invalid agent (e.g., tools not in app.tools) produces a config with incorrect toolFilters. This is by design — validate before generating.
- **[Trade-off] Single proxy only:** This change generates config for a single mcp-proxy instance (union mode). The strict per-role isolation mode (`--strict-roles`) is deferred to a separate change.
