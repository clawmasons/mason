# Docker & Install Pipeline Integration Specification

## Purpose

Define the install pipeline and Docker generation for the chapter proxy container. The proxy uses the native `chapter proxy` command with pre-built chapter artifacts (no TypeScript compilation in Docker). The proxy build context is placed in the per-member `proxy/` directory.

## Requirements

### Requirement: Agent proxy schema has no image field

The agent schema `proxy` field SHALL contain only `port` and `type` -- the `image` field is removed. The proxy is the chapter binary itself.

#### Scenario: Proxy field without image
- **GIVEN** an agent package.json with `proxy: { port: 9090, type: "sse" }`
- **WHEN** the schema is validated
- **THEN** it succeeds with `port: 9090` and `type: "sse"`

#### Scenario: Proxy field with image is rejected
- **GIVEN** an agent package.json with `proxy: { image: "custom:latest", port: 9090 }`
- **WHEN** the schema is validated
- **THEN** the `image` field is stripped (zod strict mode) or ignored

### Requirement: Proxy Dockerfile uses single-stage pre-built approach

The `generateProxyDockerfile(memberName)` function SHALL return a single-stage Dockerfile that:
1. Uses `node:22-slim` as the sole base image (no `AS builder` stage)
2. Copies `chapter/package.json` first (for Docker layer caching)
3. Runs `npm install --omit=dev` to install production dependencies
4. Copies pre-built `chapter/dist` and `chapter/bin` into the image
5. Copies the member workspace as `workspace/` under `/app/`
6. Creates `/home/node/data` and `/logs` directories with proper ownership
7. Runs as the `node` user (non-root)
8. Sets `WORKDIR /app/workspace`
9. Sets `ENTRYPOINT ["node", "/app/chapter/bin/chapter.js"]` and `CMD ["proxy", "--member", "<memberName>"]`

The Dockerfile SHALL NOT contain:
- Any `AS builder` stage directive
- Any `npm run build` commands (TypeScript compilation)
- Any `COPY --from=builder` directives

#### Scenario: Single-stage Dockerfile for any member
- **GIVEN** member name `@test/member-ops`
- **WHEN** `generateProxyDockerfile("@test/member-ops")` is called
- **THEN** the returned Dockerfile starts with `FROM node:22-slim` (no `AS builder`), contains `npm install --omit=dev`, `COPY chapter/dist`, `COPY workspace/`, and `CMD ["proxy", "--member", "@test/member-ops"]`
- **AND** does NOT contain `AS builder`, `npm run build`, or `COPY --from=builder`

#### Scenario: Entrypoint uses chapter/ prefix path
- **GIVEN** any member name
- **WHEN** `generateProxyDockerfile(memberName)` is called
- **THEN** the entrypoint is `["node", "/app/chapter/bin/chapter.js"]`

#### Scenario: No null return
- **GIVEN** any member (stdio or remote-only)
- **WHEN** `generateProxyDockerfile(memberName)` is called
- **THEN** it always returns a non-null Dockerfile string

#### Scenario: No mcp-proxy references
- **WHEN** `generateProxyDockerfile(memberName)` is called
- **THEN** the returned Dockerfile does not contain "mcp-proxy", "tbxark", or "/main"

### Requirement: Docker compose uses per-member proxy build

The `generateDockerCompose()` function SHALL generate a proxy service that:
1. Always uses `build: ./proxy` (no `image:` directive)
2. Has no `entrypoint:` or `command:` directives (uses Dockerfile ENTRYPOINT/CMD)
3. Does not mount `config.json` (chapter proxy reads from workspace)
4. Mounts `./proxy/logs:/logs` for log persistence
5. Passes `CHAPTER_PROXY_TOKEN` and app credential env vars

#### Scenario: Proxy service configuration
- **GIVEN** a member with `proxy: { port: 9090 }`
- **WHEN** `generateDockerCompose(member, runtimeServices)` is called
- **THEN** the proxy service has `build: ./proxy`, no `image:`, no `config.json` mount, and correct port mapping

#### Scenario: No hasProxyDockerfile parameter
- **WHEN** `generateDockerCompose()` is called
- **THEN** it accepts only `member` and `runtimeServices` parameters (no boolean flag needed)

### Requirement: Install command generates proxy build context in proxy/ directory

The `runInstall()` function SHALL:
1. NOT generate `mcp-proxy/config.json`
2. NOT import or call `generateProxyConfig()`
3. Generate `proxy/Dockerfile` using `generateProxyDockerfile(memberName)`
4. Copy pre-built chapter artifacts (`dist/`, `bin/`) from `getChapterProjectRoot()` into `proxy/chapter/`
5. Copy `package.json` from `getChapterProjectRoot()` into `proxy/chapter/`
6. NOT copy chapter source files (`src/`), TypeScript config files, or `node_modules/` into the build context
7. Copy member workspace directories (apps/, roles/, members/, tasks/, skills/) into `proxy/workspace/`
8. Copy non-local packages from the resolved dependency graph into `proxy/workspace/{type}s/{basename}/` -- packages NOT in the member's resolved graph SHALL be excluded

The `copyDirToFiles()` helper accepts a configurable `skipDirs` parameter (default: `["node_modules", ".git"]`).

#### Scenario: No mcp-proxy config generated
- **GIVEN** a valid member
- **WHEN** `runInstall()` is called
- **THEN** no `mcp-proxy/config.json` file exists in the output directory

#### Scenario: Pre-built chapter copied to proxy build context
- **GIVEN** a valid agent member
- **WHEN** `runInstall()` is called
- **THEN** `proxy/chapter/package.json` exists in the output
- **AND** `proxy/chapter/dist/` and `proxy/chapter/bin/` directories exist
- **AND** no `proxy/chapter/src/` or `proxy/chapter/tsconfig*` files exist

#### Scenario: Workspace copied to proxy build context
- **GIVEN** a valid agent member with packages in apps/ and members/
- **WHEN** `runInstall()` is called
- **THEN** `proxy/workspace/members/` and `proxy/workspace/apps/` exist with the package.json files

#### Scenario: Non-local packages outside resolved graph are excluded
- **GIVEN** a local member `@vis/member-note-taker` and a node_modules package `@clawmasons/member-note-taker` with the same directory basename
- **WHEN** `runInstall()` is called for `@vis/member-note-taker`
- **THEN** `proxy/workspace/members/note-taker/package.json` SHALL contain `@vis/member-note-taker` (not `@clawmasons`)

### Requirement: Proxy config generator is deprecated

The `src/generator/proxy-config.ts` module SHALL continue to exist for backward compatibility but SHALL NOT be imported by the install command pipeline.

#### Scenario: Module exists but unused
- **GIVEN** the install command source code
- **WHEN** its imports are inspected
- **THEN** `proxy-config` is not referenced
