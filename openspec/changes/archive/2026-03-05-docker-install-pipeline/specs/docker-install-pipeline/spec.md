# Docker & Install Pipeline Integration Specification

## Purpose

Update the install pipeline and Docker generation to use the native `forge proxy` command instead of the external tbxark/mcp-proxy Go binary, as specified in PRD §6.5.

## Requirements

### Requirement: Agent proxy schema has no image field

The agent schema `proxy` field SHALL contain only `port` and `type` — the `image` field is removed. The proxy is the forge binary itself.

#### Scenario: Proxy field without image
- **GIVEN** an agent package.json with `proxy: { port: 9090, type: "sse" }`
- **WHEN** the schema is validated
- **THEN** it succeeds with `port: 9090` and `type: "sse"`

#### Scenario: Proxy field with image is rejected
- **GIVEN** an agent package.json with `proxy: { image: "custom:latest", port: 9090 }`
- **WHEN** the schema is validated
- **THEN** the `image` field is stripped (zod strict mode) or ignored

### Requirement: Proxy Dockerfile builds forge from source

The `generateProxyDockerfile(agentName)` function SHALL always return a Dockerfile string that:
1. Uses a multi-stage build with `node:22-slim` as base
2. Copies forge source into the builder stage and runs `npm ci && npm run build`
3. Copies build artifacts (dist, bin, node_modules, package.json) to runtime stage
4. Copies the agent workspace into the image
5. Sets ENTRYPOINT to `node /app/bin/forge.js` and CMD to `proxy --agent <agentName>`

#### Scenario: Dockerfile for any agent
- **GIVEN** agent name `@test/agent-ops`
- **WHEN** `generateProxyDockerfile("@test/agent-ops")` is called
- **THEN** the returned Dockerfile contains `FROM node:22-slim`, `COPY forge/`, `npm run build`, `COPY workspace/`, and `CMD ["proxy", "--agent", "@test/agent-ops"]`

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
4. Copy forge project source (src/, bin/, package.json, tsconfig files) into `forge-proxy/forge/`
5. Copy agent workspace directories (apps/, roles/, agents/, tasks/, skills/) into `forge-proxy/workspace/`

#### Scenario: No mcp-proxy config generated
- **GIVEN** a valid agent
- **WHEN** `runInstall()` is called
- **THEN** no `mcp-proxy/config.json` file exists in the output directory

#### Scenario: Forge source copied to build context
- **GIVEN** a valid agent
- **WHEN** `runInstall()` is called
- **THEN** `forge-proxy/forge/package.json` exists in the output directory

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
