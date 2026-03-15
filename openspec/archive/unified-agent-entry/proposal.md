## Why

Every agent container currently has a hardcoded entrypoint command in its Dockerfile (`claude`, `pi`, `mcp-agent`). Credentials are always injected as environment variables. This breaks for Claude Code, which requires credentials as a file at `~/.claude/.credentials.json`, and makes adding new agent types (like bash-agent) require touching the Dockerfile generator. Additionally, agent-entry's MCP client lacks SSE response parsing that was fixed in mcp-agent, causing failures when the proxy returns SSE responses.

We need a single, configurable entry command (`agent-entry`) for all agent containers that:
- Reads an `agent-launch.json` config to know what credentials to fetch and how to install them (env var or file)
- Supports file-based credential installation (Claude Code needs `~/.claude/.credentials.json`)
- Pipes stdin/stdout correctly to the launched agent process
- Has SSE parsing fixes from mcp-agent's MCP client

The credential service also needs to handle `security.*` keys via a hardcoded allowlist, rejecting anything not explicitly permitted — not arbitrary keychain access.

## What Changes

### 1. agent-entry: `agent-launch.json` config-driven bootstrap
- New `agent-launch.json` schema: credentials (key, type=env|file, path), command, args
- `bootstrap()` reads `agent-launch.json` instead of env vars for credential config and runtime command
- Credentials with `type: "file"` are written to `path` in the container before launching
- Credentials with `type: "env"` are set as env vars (current behavior)
- `MCP_PROXY_TOKEN` and `MCP_PROXY_URL` still come from environment (Docker Compose sets these)

### 2. agent-entry: MCP client SSE fix
- Port `parseMcpResponse()` from mcp-agent's mcp-client.ts to agent-entry's mcp-client.ts
- Add `Accept: "application/json, text/event-stream"` header
- Handle SSE responses in `initializeMcpSession()` and `callTool()`

### 3. Credential service: `security.*` allowlist support
- Add allowlisted `security.*` credential key handling in the resolver
- Reject any `security.*` key not in the allowlist with ACCESS_DENIED

### 4. Materializers: generate `agent-launch.json`
- Each materializer generates an `agent-launch.json` in workspace
- Claude Code: credential `CLAUDE_CODE_OAUTH_TOKEN` as env, command `claude`
- Pi Coding Agent: credential `OPENROUTER_API_KEY` as env, command `pi`
- MCP Agent: credential `TEST_TOKEN` as env, command `mcp-agent`
- All agent Dockerfiles use `agent-entry` as ENTRYPOINT

### 5. New agent type: bash-agent
- Materializer that generates `agent-launch.json` with `CLAUDE_CODE_OAUTH_TOKEN` as env credential
- Command: `bash` (interactive shell)
- Register in materializer registry

### 6. Agent Dockerfile generator
- All agent types use `ENTRYPOINT ["agent-entry"]` (unified)
- Remove per-runtime entrypoint logic (entrypoint comes from `agent-launch.json`)
- Keep runtime-specific install steps (npm install -g, etc.)

## How to Verify

```bash
npx tsc --noEmit          # TypeScript compiles
npx vitest run             # All tests pass
npx eslint src/ tests/     # Lint passes
```
