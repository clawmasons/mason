## Why

The proxy Docker image currently COPYs `proxy-config.json` at build time, making it role-specific. This means every role change or agent addition triggers a full proxy image rebuild (~10 seconds). The proxy container itself is generic — it just reads a config file at startup — so baking the config into the image is unnecessary overhead.

## What Changes

- **BREAKING**: Move proxy Dockerfile to `.mason/docker/mcp-proxy/` (shared, not per-role)
- Remove `COPY proxy-config.json` from the proxy Dockerfile — config is no longer baked into the image
- Mount `proxy-config.json` via docker-compose volumes instead (from `.mason/docker/{role}/mcp-proxy/proxy-config.json`)
- Simplify proxy image name to `mason-{projectHash}-proxy` (drop the `-{roleName}` suffix since the image is now role-agnostic)
- Continue generating per-role config at `.mason/docker/{role}/mcp-proxy/proxy-config.json` as before

## Capabilities

### New Capabilities

- `proxy-shared-image`: The proxy Docker image is generic and shared across all roles in a project, with role-specific config mounted at runtime

### Modified Capabilities

- `docker-compose-generation`: Session compose must mount proxy-config.json into the proxy container instead of relying on it being COPYed into the image
- `proxy-config-generation`: Proxy Dockerfile no longer needs the role parameter; config file path in container changes from build-time COPY to runtime mount
- `project-local-docker-build`: Proxy Dockerfile moves from `.mason/docker/{role}/mcp-proxy/` to `.mason/docker/mcp-proxy/`; image naming simplified

## Impact

- `packages/cli/src/generator/proxy-dockerfile.ts` — Remove role parameter, remove COPY of proxy-config.json
- `packages/cli/src/materializer/proxy-dependencies.ts` — Write Dockerfile to shared location instead of per-role
- `packages/cli/src/materializer/docker-generator.ts` — Mount proxy-config.json in compose, update image naming, update Dockerfile path
- `packages/cli/src/cli/commands/build.ts` — Generate one shared proxy Dockerfile instead of per-role
- Existing tests for proxy Dockerfile generation and docker-compose generation
