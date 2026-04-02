## Context

The proxy and agent Docker containers each COPY a shared 96MB `node_modules/` directory. The proxy uses it solely for runtime package discovery (scanning `node_modules/` to find roles, apps, and MCP server configs). The agent container doesn't use it at all — `agent-entry` is a zero-dependency esbuild bundle.

Both containers already have self-contained bundles: `proxy-bundle.cjs` (1.8MB) and `agent-entry.js` (14KB). The 96MB `node_modules/` is redundant overhead.

The proxy currently does a 10-step startup: discover packages → resolve role → resolve apps → collect MCP configs → load env → create upstream manager → start server → connect upstreams → build routing → ready. Steps 1-5 are pure config resolution that should happen at build time.

## Goals / Non-Goals

**Goals:**
- Eliminate `node_modules/` from both Docker containers
- Generate a static `proxy-config.json` at build time with pre-resolved MCP server configs
- Replace the proxy's runtime discovery with config-file loading
- Use `COPY --chown` in Dockerfiles to avoid duplicate `chown -R` layers
- Remove dead code: discovery/resolution modules from proxy bundle, `synthesizeRolePackages()`, and most of `ensureProxyDependencies()` internals

**Non-Goals:**
- Changing how stdio apps are invoked (they use `npx`, unchanged)
- Modifying the proxy's upstream connection logic (connect + routing stays the same)

## Decisions

### 1. Config file shape: serialized `UpstreamMcpConfig[]` + metadata

Generate `proxy-config.json` at build time containing everything the proxy needs:

```typescript
interface ProxyConfigFile {
  role: string;
  toolFilters: Map<string, ...>;
  approvalPatterns: string[];
  upstreams: UpstreamMcpConfig[];  // env vars kept as ${VAR} placeholders
}
```

Env vars in `upstreams[].server.env` stay as `${VAR_NAME}` placeholders — resolved at runtime from the container environment. Secrets never enter the build artifact.

**Why this shape:** `UpstreamMcpConfig` already exists and is the exact input to `UpstreamManager`. No new types needed.

### 2. Proxy entry reads config file directly

`proxy-entry.ts` reads `proxy-config.json` from its working directory on startup. Startup becomes:

1. Read `proxy-config.json`
2. Resolve env var placeholders from container environment
3. Create `UpstreamManager` with resolved configs
4. Start HTTP server
5. Connect upstreams, build routing tables
6. Ready

No `--agent`/`--role` flags. No `discoverPackages()`. No `resolveRolePackage()`. The current `startProxy()` is replaced with this simplified flow.

### 3. `ensureProxyDependencies()` becomes config generation

The function currently does 6 things — BFS dependency collection, hoisting, workspace package copying, .bin link creation, package.json generation, and bundle copying. All but the last exist solely to support runtime discovery.

It becomes: copy `proxy-bundle.cjs` + generate `proxy-config.json`. The config generation reuses the existing `collectMcpServers()` logic (extracted from `proxy.ts`) and `computeToolFilters()` from `@clawmasons/shared`.

### 4. Dead code removal

**Remove entirely:**
- `discoverPackages()` and `resolveRolePackage()` — proxy is their only caller in production code
- `resolveRoleName()` and `collectMcpServers()` — local helpers in proxy.ts
- `synthesizeRolePackages()` — only existed to create synthetic packages in node_modules for runtime discovery. Inline MCP server configs are now serialized directly into the config file
- Internal functions in `proxy-dependencies.ts`: `collectPackages()`, `copyPackages()`, `hoistNestedDependencies()`, `createBinLinks()`, `walkScopedPackages()`, `copyWorkspacePackages()`
- `COPY node_modules/` and `ENV PATH` lines from agent Dockerfile generator
- `COPY package.json` and `COPY node_modules/` from proxy Dockerfile generator

**Keep (used elsewhere):**
- `computeToolFilters()` from `@clawmasons/shared` — also used by `permissions` command
- `resolveEnvVars()` from `@clawmasons/proxy` — still needed at runtime for env placeholders

**Proxy bundle gets smaller:** No longer bundles `discover.ts` (~500 lines), `resolve.ts` (~250 lines), and their transitive imports. Estimated ~15-25% bundle size reduction.

### 5. Agent Dockerfile: remove node_modules entirely

Remove `COPY node_modules/` and `ENV PATH` lines. `agent-entry` is self-contained with zero runtime dependencies.

### 6. COPY --chown optimization for both Dockerfiles

Create the mason user FIRST, then COPY with `--chown`:

```dockerfile
ARG HOST_UID=1000
ARG HOST_GID=1000
RUN (getent group $HOST_GID | cut -d: -f1 | xargs -r groupdel 2>/dev/null || true) \
    && (getent passwd $HOST_UID | cut -d: -f1 | xargs -r userdel 2>/dev/null || true) \
    && groupadd -g $HOST_GID mason && useradd -m -u $HOST_UID -g $HOST_GID mason \
    && mkdir -p /home/mason/data /logs /mason-logs /app/.cache/v8 /app/.cache/npm \
    && chown -R mason:mason /home/mason/data /logs /mason-logs /app/.cache

COPY --chown=mason:mason proxy-bundle.cjs ./
COPY --chown=mason:mason proxy-config.json ./
```

Eliminates the duplicate `chown -R /app` layer that currently doubles the size of copied content.

## Risks / Trade-offs

**[Config staleness]** → Config is a build-time snapshot. Role changes require rebuild. Already true for workspace files — no new risk.

**[Env var resolution]** → Env vars resolved at proxy startup from container environment. Missing vars fail at startup (same as today).

**[stdio apps]** → Use `npx` which downloads on first run. Unchanged. Future work may add Dockerfile install steps.
