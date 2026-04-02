## Context

The proxy container is a thin shim: it reads `proxy-config.json` at startup via `proxy-entry.ts` and connects to upstream MCP servers. The only role/project-specific artifact is that config file, yet the current Dockerfile `COPY`s it at build time, producing a unique image per role. Rebuilding takes ~10 seconds even though nothing in the image layer stack changes except one small JSON file.

Currently:
- Dockerfile lives at `.mason/docker/{role}/mcp-proxy/Dockerfile`
- `COPY --chown=mason:mason {role}/mcp-proxy/proxy-config.json ./` bakes config into the image
- Image tagged as `mason-{projectHash}-proxy-{roleName}` — one image per role
- `proxy-entry.ts` reads `proxy-config.json` from CWD (`/app/proxy-config.json`)

## Goals / Non-Goals

**Goals:**
- Eliminate proxy image rebuilds when roles or agents change
- Single shared proxy Docker image per project (built once, reused across roles)
- Mount role-specific config at runtime via docker-compose volumes
- Preserve the existing proxy-config.json generation pipeline (no changes to config content)

**Non-Goals:**
- Changing how `proxy-entry.ts` reads its config (still reads from `/app/proxy-config.json`)
- Modifying the proxy bundle or its startup behavior
- Changing agent Dockerfile generation
- Making the proxy image shareable across projects (project hash remains in image name)

## Decisions

### 1. Shared Dockerfile at `.mason/docker/mcp-proxy/Dockerfile`

**Decision**: Move the proxy Dockerfile from `.mason/docker/{role}/mcp-proxy/Dockerfile` to `.mason/docker/mcp-proxy/Dockerfile`. Generate it once during `mason build`, not per-role.

**Rationale**: The Dockerfile is identical for all roles (same base image, same user setup, same entrypoint). The only role-specific line was the `COPY proxy-config.json` which we're removing.

**Alternative considered**: Keep per-role Dockerfiles but skip rebuild if identical — rejected because it's unnecessary complexity and Docker's layer cache would still hash the build context.

### 2. Remove `COPY proxy-config.json` from Dockerfile

**Decision**: The proxy Dockerfile will only COPY `proxy-bundle.cjs`. The config file is mounted at runtime.

**Rationale**: This is what makes the image role-agnostic. The proxy entry point already reads config from CWD at startup, so there's no code change needed — just change how the file gets there.

### 3. Mount config via docker-compose volume

**Decision**: Session compose mounts `.mason/docker/{role}/mcp-proxy/proxy-config.json` to `/app/proxy-config.json` as a read-only bind mount.

```yaml
proxy-{roleName}:
  volumes:
    - {relDockerDir}/{roleName}/mcp-proxy/proxy-config.json:/app/proxy-config.json:ro
```

**Rationale**: Bind mount is the simplest approach. Read-only because the proxy never writes to it. The host path uses the existing per-role config location — no change to `ensureProxyDependencies()` output paths.

### 4. Image name: `mason-{projectHash}-proxy`

**Decision**: Drop the `-{roleName}` suffix. All roles share one proxy image: `mason-{projectHash}-proxy`.

**Rationale**: Since the image no longer contains role-specific content, including the role name is misleading. One image, multiple containers with different configs mounted.

### 5. `generateProxyDockerfile()` drops role parameter

**Decision**: Change signature from `generateProxyDockerfile(role: ResolvedRole)` to `generateProxyDockerfile()`. Remove the role-specific COPY line and the comment referencing role short name.

**Rationale**: Function no longer needs role info since there's nothing role-specific in the output.

### 6. Build-time: generate Dockerfile once, config per-role

**Decision**: In `docker-generator.ts`, move proxy Dockerfile generation out of the per-role `generateRoleDockerBuildDir()` loop. Write it to `.mason/docker/mcp-proxy/Dockerfile` once. Config generation in `ensureProxyDependencies()` stays per-role.

**Rationale**: Separates the one-time shared artifact (Dockerfile) from per-role artifacts (config). `ensureProxyDependencies()` still writes `proxy-config.json` to `.mason/docker/{role}/mcp-proxy/` — this path is referenced by the compose mount.

## Risks / Trade-offs

- **[Risk] Config file missing at container start** → The proxy-entry.ts already exits with a clear error if `proxy-config.json` is not found. No additional error handling needed.
- **[Risk] Stale config after role change** → `mason build` regenerates config; `mason run` calls build first. Same as today — no regression.
- **[Trade-off] Per-role mcp-proxy/ directory still exists** → We keep `.mason/docker/{role}/mcp-proxy/` for the config file even though the Dockerfile moved out. This is fine — the directory serves a purpose (holding the role's config) and the Dockerfile now lives one level up at `.mason/docker/mcp-proxy/`.
- **[Breaking] Image name change** → Existing cached images with the old name (`-proxy-{roleName}`) won't be reused. Docker will build a new image on first run. One-time cost.
