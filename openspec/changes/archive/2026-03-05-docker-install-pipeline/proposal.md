## Why

The forge proxy is now a native Node.js MCP server (`forge proxy`), but the install pipeline and Docker generation still target the external `tbxark/mcp-proxy` Go binary. The `docker-compose.yml` mounts `mcp-proxy/config.json`, runs the `mcp-proxy` binary with a tee-to-log entrypoint, and the `proxy-dockerfile.ts` copies the binary from the tbxark image. The install command still generates `mcp-proxy/config.json`. The agent schema still has an `image` field for specifying a custom proxy image.

All of this is now dead code. The native `forge proxy` command reads configuration directly from the agent package — no config file needed. The proxy runs as forge itself, not an external binary.

## What Changes

- **Modified:** `src/schemas/agent.ts` — remove `image` from `proxySchema`
- **Modified:** `src/resolver/types.ts` — remove `image` from `ResolvedAgent.proxy`
- **Modified:** `src/compose/docker-compose.ts` — proxy service runs `forge proxy` instead of `mcp-proxy` binary; remove config.json mount; remove mcp-proxy entrypoint/command; use `build: ./forge-proxy` always (forge needs Node.js)
- **Modified:** `src/generator/proxy-dockerfile.ts` — generate a Dockerfile that installs forge and runs `forge proxy` instead of copying the mcp-proxy binary
- **Modified:** `src/cli/commands/install.ts` — stop generating `mcp-proxy/config.json`; generate forge-proxy Dockerfile; copy agent workspace into the proxy build context
- **Deprecated:** `src/generator/proxy-config.ts` — no longer called from install pipeline (proxy reads agent package directly)
- **Updated tests:** `tests/compose/docker-compose.test.ts`, `tests/generator/proxy-dockerfile.test.ts`, `tests/cli/install.test.ts`

## Capabilities

### Modified Capabilities
- `docker-compose-generation`: Proxy service now runs `forge proxy` natively
- `forge-install-command`: No longer generates `mcp-proxy/config.json`; generates forge-based proxy build context

### Deprecated Capabilities
- `proxy-config-generation`: No longer needed — proxy reads from agent package directly

## Impact

- **Modified:** `src/schemas/agent.ts`, `src/resolver/types.ts`, `src/compose/docker-compose.ts`, `src/generator/proxy-dockerfile.ts`, `src/cli/commands/install.ts`
- **Deprecated:** `src/generator/proxy-config.ts` (no longer imported)
- **Updated tests:** `tests/compose/docker-compose.test.ts`, `tests/generator/proxy-dockerfile.test.ts`, `tests/cli/install.test.ts`
- **No new dependencies**
- **PRD refs:** PRD §6.5 (Agent Schema Changes)
