# Docker & Install Pipeline Specification (Updated for Pre-built Forge)

## Purpose

Update the proxy Dockerfile generation and install pipeline to use pre-built forge from node_modules instead of compiling from source in a multi-stage Docker build, as specified in PRD REQ-007 (Simplified Proxy Dockerfile).

## Requirements

### Requirement: Proxy Dockerfile uses single-stage pre-built approach

The `generateProxyDockerfile(agentName)` function SHALL return a single-stage Dockerfile that:
1. Uses `node:22-slim` as the sole base image (no `AS builder` stage)
2. Sets initial `WORKDIR /app/forge` for dependency installation
3. Copies `forge/package.json` and `forge/package-lock.json` first (for Docker layer caching)
4. Runs `npm ci --omit=dev --ignore-scripts` to install production dependencies
5. Copies pre-built `forge/dist` and `forge/bin` into the image
6. Copies the agent workspace as `workspace/` under `/app/`
7. Creates `/home/node/data` and `/logs` directories with proper ownership
8. Runs as the `node` user (non-root)
9. Sets final `WORKDIR /app/workspace`
10. Sets `ENTRYPOINT ["node", "/app/forge/bin/forge.js"]` and `CMD ["proxy", "--agent", "<agentName>"]`

The Dockerfile SHALL NOT contain:
- Any `AS builder` stage directive
- Any `npm run build` commands (TypeScript compilation)
- Any `COPY --from=builder` directives

#### Scenario: Single-stage Dockerfile for any agent
- **GIVEN** agent name `@test/agent-ops`
- **WHEN** `generateProxyDockerfile("@test/agent-ops")` is called
- **THEN** the returned Dockerfile starts with `FROM node:22-slim` (no `AS builder`), contains `COPY forge/dist`, `COPY workspace/`, `npm ci --omit=dev`, and `CMD ["proxy", "--agent", "@test/agent-ops"]`
- **AND** does NOT contain `AS builder`, `npm run build`, or `COPY --from=builder`

#### Scenario: Entrypoint uses forge/ prefix path
- **GIVEN** any agent name
- **WHEN** `generateProxyDockerfile(agentName)` is called
- **THEN** the entrypoint is `["node", "/app/forge/bin/forge.js"]`

#### Scenario: Non-root user
- **GIVEN** any agent name
- **WHEN** `generateProxyDockerfile(agentName)` is called
- **THEN** the Dockerfile contains `USER node`

#### Scenario: No mcp-proxy references
- **WHEN** `generateProxyDockerfile(agentName)` is called
- **THEN** the returned Dockerfile does not contain "mcp-proxy", "tbxark", or "/main"

### Requirement: Install command copies pre-built forge to build context

The `runInstall()` function SHALL:
1. Copy pre-built forge artifacts (`dist/`, `bin/`) from `getForgeProjectRoot()` into `forge-proxy/forge/`
2. Copy `package.json` and `package-lock.json` from `getForgeProjectRoot()` into `forge-proxy/forge/` (for `npm ci` in the Dockerfile)
3. NOT copy forge source files (`src/`) into the build context
4. NOT copy TypeScript config files (`tsconfig.json`, `tsconfig.build.json`) into the build context
5. NOT copy `node_modules/` directly (production deps are installed via `npm ci` in the Dockerfile)
6. Continue to copy workspace directories (apps/, tasks/, skills/, roles/, agents/) into `forge-proxy/workspace/`

The `copyDirToFiles()` helper function accepts a configurable `skipDirs` parameter (default: `["node_modules", ".git"]`) to control which directories are skipped during recursive copying. For forge dist/bin copying, only `.git` is skipped.

#### Scenario: Pre-built forge artifacts in build context
- **GIVEN** a valid agent
- **WHEN** `runInstall()` is called
- **THEN** `forge-proxy/forge/package.json` exists in the output
- **AND** `forge-proxy/forge/package-lock.json` exists in the output
- **AND** `forge-proxy/forge/bin/` directory exists in the output
- **AND** `forge-proxy/forge/dist/` directory exists in the output

#### Scenario: No source files in build context
- **GIVEN** a valid agent
- **WHEN** `runInstall()` is called
- **THEN** no file matching `forge-proxy/forge/src/**` exists in the output
- **AND** no file matching `forge-proxy/forge/tsconfig*` exists in the output

#### Scenario: Workspace directories still copied
- **GIVEN** a valid agent with packages in apps/ and agents/
- **WHEN** `runInstall()` is called
- **THEN** `forge-proxy/workspace/agents/` and `forge-proxy/workspace/apps/` exist with package.json files

### Requirement: Agent proxy schema unchanged

The agent schema `proxy` field remains unchanged -- only `port` and `type` fields. No schema changes are needed for this Dockerfile simplification.

### Requirement: Docker compose configuration unchanged

The `generateDockerCompose()` function is not modified. It continues to use `build: ./forge-proxy` for the proxy service, which is compatible with the new single-stage Dockerfile.
