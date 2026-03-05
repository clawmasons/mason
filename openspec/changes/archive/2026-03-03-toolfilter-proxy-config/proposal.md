## Why

forge can discover packages, resolve the full agent dependency graph, and validate it for semantic correctness — but it cannot yet generate the runtime infrastructure that enforces governance. The tbxark/mcp-proxy `config.json` with per-app `toolFilter` entries is the hard security boundary that blocks unauthorized tool access at the network layer. Without this, the resolved and validated agent graph has no runtime enforcement mechanism.

## What Changes

- Implement the toolFilter generation algorithm that computes per-app tool allow-list unions across all roles in a resolved agent
- Implement the mcp-proxy `config.json` generator that produces the complete proxy configuration from a resolved agent
- Generate proxy authentication tokens (`FORGE_PROXY_TOKEN`) for bearer-token auth
- Handle both stdio (command+args) and remote (sse/streamable-http via url) app transports
- Preserve `${VAR}` environment variable interpolation in generated config (resolved at Docker runtime, not build time)

## Capabilities

### New Capabilities
- `toolfilter-generation`: Compute per-app toolFilter allow-lists from the union of all role permissions in a resolved agent. Validates that every tool in the union exists in the app's tool list.
- `proxy-config-generation`: Generate a complete tbxark/mcp-proxy `config.json` from a resolved agent, including mcpProxy settings (addr, type, name, auth), mcpServers entries for all apps (stdio command/args or remote url, env vars, toolFilter), and logging configuration.

### Modified Capabilities
_None._

## Impact

- **New source files:** `src/generator/` directory with toolFilter computation and proxy config generation logic
- **Depends on:** `src/resolver/` for `ResolvedAgent`, `ResolvedRole`, `ResolvedApp` types
- **New test files:** `tests/generator/toolfilter.test.ts`, `tests/generator/proxy-config.test.ts`
- **Updated exports:** `src/index.ts` updated to export generator functions and types
- **No CLI changes:** This change provides the programmatic API. CLI integration (`forge permissions`, `forge install`) will use these functions in subsequent changes.
