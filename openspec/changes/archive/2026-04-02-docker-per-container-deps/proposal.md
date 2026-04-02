## Why

Both proxy and agent containers share a single 96MB `node_modules` directory at `.mason/docker/node_modules/`, even though neither container actually needs it. The proxy bundle (`proxy-bundle.cjs`, 1.8MB) already contains all framework code via esbuild, and the agent entry (`agent-entry.js`, 14KB) is a zero-dependency bundle. The `node_modules` exists solely so the proxy can do runtime package discovery — re-resolving roles and MCP servers that were already resolved at build time. This is redundant work that inflates Docker images by ~96MB per container.

## What Changes

- **Generate static proxy config at build time**: During `mason build`/`mason run`, resolve roles, permissions, and MCP servers into a `proxy-config.json` file that the proxy reads directly at startup — no filesystem discovery needed
- **Add config-based startup path to proxy**: The proxy accepts a pre-built config file instead of scanning `node_modules/` for packages
- **Remove `node_modules/` from both Dockerfiles**: Neither container copies `node_modules/` anymore
  - Proxy container: `proxy-bundle.cjs` + `proxy-config.json` (~2MB total)
  - Agent container: `agent-entry.js` only (~14KB)
- **Simplify `ensureProxyDependencies()`**: No longer needs to collect, hoist, and copy framework packages and their transitive dependencies into a shared `node_modules/`
- **Optimize Dockerfile layer efficiency**: Create the mason user with configurable UID/GID early via build args, then `COPY --chown=mason:mason` all files so they land with correct ownership in a single layer — eliminates the duplicate `chown -R` layer that currently doubles the size of copied content

## Capabilities

### New Capabilities

- `proxy-static-config`: Defines the build-time config generation for the proxy — the shape of `proxy-config.json`, how it captures resolved MCP servers with env var placeholders, and how the proxy consumes it at startup

### Modified Capabilities

- `project-local-docker-build`: Docker build directory no longer includes a shared `node_modules/`; proxy gets a config file instead
- `agent-dockerfile`: Agent Dockerfile no longer COPYs `node_modules/`; only needs the bundled `agent-entry.js`. Uses `COPY --chown` to avoid duplicate layers

## Impact

- **Code**: `packages/cli/src/materializer/proxy-dependencies.ts` (major simplification), `packages/cli/src/cli/commands/proxy.ts` (config-based startup path), `packages/cli/src/generator/proxy-dockerfile.ts`, `packages/cli/src/generator/agent-dockerfile.ts`, `packages/cli/src/cli/proxy-entry.ts`
- **Docker images**: Both containers drop ~96MB of `node_modules/`. Proxy goes from ~98MB to ~2MB. Agent goes from ~96MB to ~14KB.
- **Build time**: Faster Docker builds due to smaller build context
- **Startup time**: Proxy skips runtime discovery (steps 1-6 of current 10-step startup), going straight to MCP server connection
- **Stdio apps**: No change — these use `npx` at runtime; future installs will be handled via Dockerfile install steps like agents
