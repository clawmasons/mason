## 1. Proxy Dockerfile Generator

- [x] 1.1 Remove `role: ResolvedRole` parameter from `generateProxyDockerfile()` in `packages/cli/src/generator/proxy-dockerfile.ts`
- [x] 1.2 Remove the `COPY --chown=mason:mason ${roleShortName}/mcp-proxy/proxy-config.json ./` line from the generated Dockerfile
- [x] 1.3 Remove the role-specific comment (`# Proxy Dockerfile for role: ${roleShortName}`) from the generated Dockerfile
- [x] 1.4 Update all call sites of `generateProxyDockerfile()` to pass no arguments

## 2. Proxy Dependencies Materializer

- [x] 2.1 In `ensureProxyDependencies()`, split proxy bundle copy (shared at `.mason/docker/mcp-proxy/`) from per-role config generation (`.mason/docker/{role}/mcp-proxy/`)
- [x] 2.2 Move `copyProxyBundle()` call out of `ensureProxyDependencies()` or make it write to the shared `mcp-proxy/` directory instead of the docker root

## 3. Docker Generator - Shared Dockerfile Path

- [x] 3.1 In `docker-generator.ts`, move proxy Dockerfile generation out of the per-role loop
- [x] 3.2 Write the shared proxy Dockerfile to `.mason/docker/mcp-proxy/Dockerfile` instead of `.mason/docker/{role}/mcp-proxy/Dockerfile`
- [x] 3.3 Copy `proxy-bundle.cjs` to `.mason/docker/mcp-proxy/` (alongside the shared Dockerfile)

## 4. Docker Generator - Compose YAML

- [x] 4.1 Update proxy service `image:` to `mason-{projectHash}-proxy` (drop `-{roleName}` suffix)
- [x] 4.2 Add volume mount for `proxy-config.json`: `{relDockerDir}/{roleName}/mcp-proxy/proxy-config.json:/app/proxy-config.json:ro`
- [x] 4.3 Update proxy service `build.context` and `build.dockerfile` to point to shared `.mason/docker/mcp-proxy/`

## 5. Build Command

- [x] 5.1 Update `packages/cli/src/cli/commands/build.ts` to generate one shared proxy Dockerfile (outside per-role loop) instead of per-role

## 6. Tests

- [x] 6.1 Update proxy Dockerfile generator tests to call `generateProxyDockerfile()` with no arguments and assert no `proxy-config.json` COPY
- [x] 6.2 Update docker-compose generation tests to verify proxy config volume mount and shared image name
- [x] 6.3 Update project-local-docker-build tests to verify shared Dockerfile at `.mason/docker/mcp-proxy/` and per-role config only
- [x] 6.4 Run `npx tsc --noEmit`, `npx eslint src/ tests/`, and `npx vitest run packages/cli/tests/` to verify all changes
