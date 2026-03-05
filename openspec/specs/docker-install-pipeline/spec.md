# Docker & Install Pipeline Integration Specification

## Purpose

Define the install pipeline and Docker generation for the forge proxy container. The proxy uses the native `forge proxy` command with pre-built forge artifacts (no TypeScript compilation in Docker).

## Requirements

### Requirement: Agent proxy schema has no image field

The agent schema `proxy` field SHALL contain only `port` and `type` -- the `image` field is removed. The proxy is the forge binary itself.

#### Scenario: Proxy field without image
- **GIVEN** an agent package.json with `proxy: { port: 9090, type: "sse" }`
- **WHEN** the schema is validated
- **THEN** it succeeds with `port: 9090` and `type: "sse"`

#### Scenario: Proxy field with image is rejected
- **GIVEN** an agent package.json with `proxy: { image: "custom:latest", port: 9090 }`
- **WHEN** the schema is validated
- **THEN** the `image` field is stripped (zod strict mode) or ignored

### Requirement: Proxy Dockerfile uses single-stage pre-built approach

The `generateProxyDockerfile(agentName)` function SHALL return a single-stage Dockerfile that:
1. Uses `node:22-slim` as the sole base image (no `AS builder` stage)
2. Copies `forge/package.json` and `forge/package-lock.json` first (for Docker layer caching)
3. Runs `npm ci --omit=dev --ignore-scripts` to install production dependencies
4. Copies pre-built `forge/dist` and `forge/bin` into the image
5. Copies the agent workspace as `workspace/` under `/app/`
6. Creates `/home/node/data` and `/logs` directories with proper ownership
7. Runs as the `node` user (non-root)
8. Sets `WORKDIR /app/workspace`
9. Sets `ENTRYPOINT ["node", "/app/forge/bin/forge.js"]` and `CMD ["proxy", "--agent", "<agentName>"]`

The Dockerfile SHALL NOT contain:
- Any `AS builder` stage directive
- Any `npm run build` commands (TypeScript compilation)
- Any `COPY --from=builder` directives

#### Scenario: Single-stage Dockerfile for any agent
- **GIVEN** agent name `@test/agent-ops`
- **WHEN** `generateProxyDockerfile("@test/agent-ops")` is called
- **THEN** the returned Dockerfile starts with `FROM node:22-slim` (no `AS builder`), contains `npm ci --omit=dev`, `COPY forge/dist`, `COPY workspace/`, and `CMD ["proxy", "--agent", "@test/agent-ops"]`
- **AND** does NOT contain `AS builder`, `npm run build`, or `COPY --from=builder`

#### Scenario: Entrypoint uses forge/ prefix path
- **GIVEN** any agent name
- **WHEN** `generateProxyDockerfile(agentName)` is called
- **THEN** the entrypoint is `["node", "/app/forge/bin/forge.js"]`

#### Scenario: No null return
- **GIVEN** any agent (stdio or remote-only)
- **WHEN** `generateProxyDockerfile(agentName)` is called
- **THEN** it always returns a non-null Dockerfile string

#### Scenario: No mcp-proxy references
- **WHEN** `generateProxyDockerfile(agentName)` is called
- **THEN** the returned Dockerfile does not contain "mcp-proxy", "tbxark", or "/main"

### Requirement: Docker compose uses forge proxy build

The `generateDockerCompose()` function SHALL generate a proxy service that:
1. Always uses `build: ./forge-proxy` (no `image:` directive)
2. Has no `entrypoint:` or `command:` directives (uses Dockerfile ENTRYPOINT/CMD)
3. Does not mount `config.json` (forge proxy reads from workspace)
4. Mounts `./forge-proxy/logs:/logs` for log persistence
5. Passes `FORGE_PROXY_TOKEN` and app credential env vars

#### Scenario: Proxy service configuration
- **GIVEN** an agent with `proxy: { port: 9090 }`
- **WHEN** `generateDockerCompose(agent, runtimeServices)` is called
- **THEN** the proxy service has `build: ./forge-proxy`, no `image:`, no `config.json` mount, and correct port mapping

#### Scenario: No hasProxyDockerfile parameter
- **WHEN** `generateDockerCompose()` is called
- **THEN** it accepts only `agent` and `runtimeServices` parameters (no boolean flag needed)

### Requirement: Install command generates forge-proxy build context

The `runInstall()` function SHALL:
1. NOT generate `mcp-proxy/config.json`
2. NOT import or call `generateProxyConfig()`
3. Generate `forge-proxy/Dockerfile` using `generateProxyDockerfile(agentName)`
4. Copy pre-built forge artifacts (`dist/`, `bin/`) from `getForgeProjectRoot()` into `forge-proxy/forge/`
5. Copy `package.json` and `package-lock.json` from `getForgeProjectRoot()` into `forge-proxy/forge/`
6. NOT copy forge source files (`src/`), TypeScript config files, or `node_modules/` into the build context
7. Copy agent workspace directories (apps/, roles/, agents/, tasks/, skills/) into `forge-proxy/workspace/`

The `copyDirToFiles()` helper accepts a configurable `skipDirs` parameter (default: `["node_modules", ".git"]`).

#### Scenario: No mcp-proxy config generated
- **GIVEN** a valid agent
- **WHEN** `runInstall()` is called
- **THEN** no `mcp-proxy/config.json` file exists in the output directory

#### Scenario: Pre-built forge copied to build context
- **GIVEN** a valid agent
- **WHEN** `runInstall()` is called
- **THEN** `forge-proxy/forge/package.json` and `forge-proxy/forge/package-lock.json` exist in the output
- **AND** `forge-proxy/forge/dist/` and `forge-proxy/forge/bin/` directories exist
- **AND** no `forge-proxy/forge/src/` or `forge-proxy/forge/tsconfig*` files exist

#### Scenario: Workspace copied to build context
- **GIVEN** a valid agent with packages in apps/ and agents/
- **WHEN** `runInstall()` is called
- **THEN** `forge-proxy/workspace/agents/` and `forge-proxy/workspace/apps/` exist with the package.json files

### Requirement: Proxy config generator is deprecated

The `src/generator/proxy-config.ts` module SHALL continue to exist for backward compatibility but SHALL NOT be imported by the install command pipeline.

#### Scenario: Module exists but unused
- **GIVEN** the install command source code
- **WHEN** its imports are inspected
- **THEN** `proxy-config` is not referenced
