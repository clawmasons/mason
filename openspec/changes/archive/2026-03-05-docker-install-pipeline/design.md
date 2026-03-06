## Context

The forge proxy is now a native Node.js MCP server started via `forge proxy`. The Docker and install pipeline must be updated to use it instead of the external `tbxark/mcp-proxy` Go binary. This affects: the agent schema, docker-compose generation, proxy Dockerfile generation, and the install command.

The key insight: `forge proxy` reads its configuration from the agent package in the workspace — it doesn't need a `config.json` file. The proxy container just needs:
1. Node.js (for stdio apps)
2. The forge CLI installed
3. The agent workspace copied in
4. `forge proxy` as the entrypoint

## Goals / Non-Goals

**Goals:**
- Remove `proxy.image` from agent schema (no external proxy image needed)
- Generate a proxy Dockerfile that installs forge and runs `forge proxy`
- Update docker-compose.yml to run `forge proxy` natively
- Stop generating `mcp-proxy/config.json` in the install pipeline
- Copy agent workspace into proxy build context so `forge proxy` can discover packages

**Non-Goals:**
- Deleting `proxy-config.ts` (leave it for backward compatibility; just stop importing it)
- Changing the `forge proxy` CLI command itself
- Changing the MCP protocol or transport behavior

## Decisions

### D1: Always generate a proxy Dockerfile (no null case)

**Choice:** `generateProxyDockerfile()` always returns a Dockerfile string, never `null`.

**Rationale:** The old logic returned `null` when all apps were remote (the stock mcp-proxy image didn't need Node.js). Now the proxy IS forge, which always needs Node.js. Even with all-remote apps, we need the forge Dockerfile.

### D2: Proxy Dockerfile installs forge from local source

**Choice:** The Dockerfile copies the forge project source and runs `npm ci && npm run build` to produce a working `forge` CLI inside the container.

**Rationale:** The forge package is not published to npm yet, so we can't `npm install -g @clawmasons/forge`. Copying from local source and building is the reliable approach. The multi-stage build keeps the final image lean.

### D3: Copy agent workspace into proxy build context

**Choice:** The install command copies the agent workspace (apps/, roles/, agents/, etc.) into the proxy build context directory (`forge-proxy/workspace/`) so the Dockerfile can COPY it in.

**Rationale:** `forge proxy` needs the agent package files to discover and resolve the agent. Inside Docker, the workspace must be baked into the image (or mounted). Baking it in is simpler and more portable.

### D4: Rename proxy service directory from `mcp-proxy/` to `forge-proxy/`

**Choice:** Change the output directory from `mcp-proxy/` to `forge-proxy/` to reflect the new implementation.

**Rationale:** Avoids confusion — the directory no longer contains mcp-proxy artifacts. The name `forge-proxy` clearly indicates it's the native forge proxy.

### D5: Remove `hasProxyDockerfile` parameter from `generateDockerCompose`

**Choice:** The docker-compose generator always uses `build: ./forge-proxy` since a Dockerfile is always generated.

**Rationale:** The conditional `build` vs `image` logic was needed when remote-only agents could use the stock mcp-proxy image. Now the proxy is always forge, so the Dockerfile is always needed.

### D6: Keep FORGE_PROXY_TOKEN for now

**Choice:** Continue generating and passing `FORGE_PROXY_TOKEN` even though the native proxy doesn't yet use it for authentication.

**Rationale:** The runtime materializer (claude-code) already bakes the token into settings.json headers. Keeping the token ensures forward compatibility when authentication is added to the native proxy.

## Architecture Changes

### Agent Schema (`src/schemas/agent.ts`)
```typescript
// Before:
const proxySchema = z.object({
  image: z.string().optional(),
  port: z.number().int().positive().optional(),
  type: z.enum(["sse", "streamable-http"]).optional(),
});

// After:
const proxySchema = z.object({
  port: z.number().int().positive().optional(),
  type: z.enum(["sse", "streamable-http"]).optional(),
});
```

### ResolvedAgent type (`src/resolver/types.ts`)
```typescript
// Before:
proxy?: { image?: string; port?: number; type?: "sse" | "streamable-http" };

// After:
proxy?: { port?: number; type?: "sse" | "streamable-http" };
```

### Docker Compose (`src/compose/docker-compose.ts`)
- Service name stays `mcp-proxy` for backward compatibility with depends_on references from runtimes
- Always uses `build: ./forge-proxy`
- Command: `forge proxy --agent <agent-name> --port <port>`
- No more config.json mount
- Still mounts logs directory
- Still passes env vars for credentials

### Proxy Dockerfile (`src/generator/proxy-dockerfile.ts`)
```dockerfile
FROM node:22-slim AS builder
WORKDIR /build
COPY forge/ ./forge/
RUN cd forge && npm ci && npm run build

FROM node:22-slim
WORKDIR /app
COPY --from=builder /build/forge/dist ./dist
COPY --from=builder /build/forge/bin ./bin
COPY --from=builder /build/forge/node_modules ./node_modules
COPY --from=builder /build/forge/package.json ./
COPY workspace/ ./workspace/
ENTRYPOINT ["node", "/app/bin/forge.js"]
CMD ["proxy"]
```

### Install Command (`src/cli/commands/install.ts`)
- Remove `generateProxyConfig` import and call
- Remove `mcp-proxy/config.json` file generation
- Generate `forge-proxy/Dockerfile` (always)
- Copy forge project source into `forge-proxy/forge/` build context
- Copy agent workspace directories into `forge-proxy/workspace/`

## Risks / Trade-offs

- **Larger Docker image** → The forge proxy image now includes the full Node.js runtime + forge source instead of a single Go binary. → Acceptable; the proxy always needed Node.js for stdio apps anyway, and the multi-stage build minimizes bloat.

- **Build time** → `npm ci && npm run build` adds time to `docker compose build`. → Mitigated by Docker layer caching.

- **Forge source must be available** → The install command needs to locate the forge project root to copy source into the build context. → The forge CLI knows its own installation path via `import.meta.url`.
