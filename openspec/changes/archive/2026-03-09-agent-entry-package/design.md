## Context

The credential service (CHANGE 2-3) resolves credentials from host sources (env/keychain/dotenv). The proxy (CHANGE 4) exposes a `/connect-agent` endpoint for session establishment and a `credential_request` MCP tool. Agent-entry is the bridge — it's the Docker container entrypoint that connects these pieces together, bootstrapping the agent runtime with credentials injected securely.

The proxy's `/connect-agent` returns `{ sessionToken, sessionId }`. The `credential_request` tool accepts `{ key, session_token }` and returns `{ key, value }` or `{ error }`. Agent-entry needs to call both: first the HTTP endpoint, then the MCP tool for each credential.

## Goals / Non-Goals

**Goals:**
- Single-file esbuild bundle that runs with Node.js and no node_modules
- Bootstrap flow: authenticate → retrieve credentials → launch runtime
- Child process isolation: credentials only in child env, not container env
- Stdio forwarding: container stdin/stdout/stderr piped to child
- Exit code propagation
- Retry logic for proxy connection (3 retries, 1s backoff)

**Non-Goals:**
- MCP session management (agent-entry doesn't maintain an MCP session)
- Credential caching or rotation
- Key pair signing (Phase 2)
- Docker image building (that's CHANGE 7)

## Decisions

### Decision 1: Lightweight MCP client using Streamable HTTP

**Choice**: Implement a minimal MCP client in `mcp-client.ts` that calls the `credential_request` tool using the MCP Streamable HTTP transport (POST to proxy endpoint). No SSE streaming needed — credential requests are simple request/response.

**Rationale**: The `@modelcontextprotocol/sdk` package is heavy and would bloat the esbuild bundle. Agent-entry only needs to call one tool (`credential_request`), so a minimal client using `fetch` is sufficient. The proxy supports Streamable HTTP transport (POST with JSON-RPC body, response as JSON).

### Decision 2: Environment variables for configuration

**Choice**: Agent-entry reads all configuration from environment variables:
- `MCP_PROXY_TOKEN` — proxy authentication token
- `MCP_PROXY_URL` — proxy URL (default: `http://proxy:3000`)
- `AGENT_CREDENTIALS` — JSON array of credential keys to request
- `AGENT_RUNTIME_CMD` — command to run (e.g., `node dist/index.js`)

**Rationale**: Environment variables are the natural Docker configuration mechanism. The proxy token is the only secret — it's generated per-session by `run-agent` and is not a long-lived credential. The credentials list and runtime command are non-sensitive metadata.

### Decision 3: child_process.spawn with explicit env

**Choice**: Use `child_process.spawn(command, args, { env: { ...filteredParentEnv, ...credentials }, stdio: 'inherit' })`. The parent env is filtered to remove `MCP_PROXY_TOKEN` and `AGENT_SESSION_TOKEN` — only the child gets credentials.

**Rationale**: `stdio: 'inherit'` is the simplest way to forward stdin/stdout/stderr. The explicit `env` option ensures credentials exist only in the child process. Filtering the parent env prevents token leakage to the runtime.

### Decision 4: esbuild config as TypeScript

**Choice**: `esbuild.config.ts` uses esbuild's JS API to bundle `src/index.ts` into `dist/agent-entry.js` as a single ESM file targeting `node22`. External: none (everything bundled).

**Rationale**: Single-file output means agent containers only need Node.js to run agent-entry. No npm install, no node_modules. The esbuild config is a simple script run with `tsx`.

## Risks / Trade-offs

- [Risk] MCP protocol changes could break the lightweight client → Mitigated by testing against the actual proxy; the Streamable HTTP transport is stable
- [Trade-off] Duplicating MCP protocol handling vs importing SDK → Bundle size matters more for container entrypoints
- [Trade-off] `stdio: 'inherit'` is simpler but means we can't intercept/transform child output → For the bootstrap use case, passthrough is correct
