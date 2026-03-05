## Why

All the forge proxy components exist — database, upstream client manager, tool router, proxy server, audit logging, approval hooks, and resource/prompt passthrough — but there is no way to start them. The proxy can only be used programmatically by constructing each piece manually. Without a CLI command, agent operators cannot run the proxy. Without credential loading, stdio apps that need API keys from `.env` files cannot receive them.

## What Changes

- New `forge proxy` CLI command in `src/cli/commands/proxy.ts` that orchestrates the full startup sequence: discover packages → resolve agent → compute tool filters → load credentials → open SQLite → start upstream clients → build routing tables → start MCP server
- New `src/proxy/credentials.ts` module that loads `.env` files and resolves `${VAR}` references in app `env` fields to actual values
- Register the proxy command in `src/cli/commands/index.ts`
- CLI flags: `--port <number>` (default from agent config or 9090), `--startup-timeout <seconds>` (default 60), `--agent <name>` (auto-detect if only one agent)

## Capabilities

### New Capabilities
- `proxy-cli`: The `forge proxy` CLI command that ties together all proxy subsystems into a single runnable command
- `credential-loading`: Loading `.env` files and resolving `${VAR}` references in app environment configurations

### Modified Capabilities
- `cli-framework`: Register the new `proxy` command

## Impact

- **New file:** `src/cli/commands/proxy.ts`
- **New file:** `src/proxy/credentials.ts`
- **Modified file:** `src/cli/commands/index.ts` — add `registerProxyCommand` import and call
- **New test:** `tests/cli/proxy.test.ts`
- **New test:** `tests/proxy/credentials.test.ts`
- **Dependencies:** `dotenv` (for `.env` file parsing) — or hand-rolled for minimal deps
- **Depends on:** All prior proxy modules (db, upstream, router, server, hooks)
- **PRD refs:** REQ-010 (Configuration from Agent Package), REQ-011 (Credential Loading from .env), REQ-014 (Startup Timeout Configuration)
