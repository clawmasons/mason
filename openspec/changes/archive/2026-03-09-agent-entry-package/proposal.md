## Why

Agent containers currently have no secure bootstrap mechanism. When an agent container starts, it needs to authenticate with the proxy, retrieve credentials from the credential service, and launch the agent runtime — all without exposing credentials in the container's own environment variables. Without agent-entry, credentials would need to be injected via docker-compose environment variables, making them visible in `docker inspect` and `/proc/1/environ`.

## What Changes

- Create `packages/agent-entry` as a new monorepo package (`@clawmasons/agent-entry`)
- Implement bootstrap flow: read `MCP_PROXY_TOKEN` → connect to proxy `/connect-agent` → retrieve credentials via `credential_request` MCP tool → spawn child process with credentials in child env only
- Build with esbuild into a single bundled `.js` file (no node_modules required at runtime)
- Pipe container stdio to child process, propagate exit code
- Handle errors: proxy unreachable (retry 3x), invalid token, credential request denied

### New Capabilities
- `agent-entry-bootstrap`: Standalone entrypoint binary that securely bootstraps agent containers
- `agent-entry-mcp-client`: Lightweight MCP client for calling `credential_request` tool via fetch + SSE

### Modified Capabilities
- None (entirely new package)

## Impact

- New: `packages/agent-entry/package.json`
- New: `packages/agent-entry/tsconfig.json`
- New: `packages/agent-entry/tsconfig.build.json`
- New: `packages/agent-entry/esbuild.config.ts`
- New: `packages/agent-entry/src/index.ts` (main entrypoint with bootstrap, connectToProxy, requestCredentials, launchRuntime)
- New: `packages/agent-entry/src/mcp-client.ts` (lightweight MCP client using fetch + SSE)
- New: `packages/agent-entry/tests/index.test.ts` (unit tests with mocked proxy)
- New: `packages/agent-entry/tests/launch.test.ts` (child process isolation tests)
- Modified: `tsconfig.json` (add agent-entry paths and includes)
- Modified: `vitest.config.ts` (add agent-entry alias)
- Modified: `package.json` (add esbuild dev dependency, update build script)
