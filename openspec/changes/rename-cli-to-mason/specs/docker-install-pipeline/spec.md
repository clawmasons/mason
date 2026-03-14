## MODIFIED Requirements

### Requirement: Proxy Dockerfile uses single-stage pre-built approach

The `generateProxyDockerfile(memberName)` function SHALL return a single-stage Dockerfile that:
1. Uses `node:22-slim` as the sole base image (no `AS builder` stage)
2. Copies `mason/package.json` first (for Docker layer caching)
3. Runs `npm install --omit=dev` to install production dependencies
4. Copies pre-built `mason/dist` and `mason/bin` into the image
5. Copies the member workspace as `workspace/` under `/app/`
6. Creates `/home/node/data` and `/logs` directories with proper ownership
7. Runs as the `node` user (non-root)
8. Sets `WORKDIR /app/workspace`
9. Sets `ENTRYPOINT ["node", "/app/mason/bin/mason.js"]` and `CMD ["proxy", "--member", "<memberName>"]`

The Dockerfile SHALL NOT contain:
- Any `AS builder` stage directive
- Any `npm run build` commands (TypeScript compilation)
- Any `COPY --from=builder` directives

#### Scenario: Single-stage Dockerfile for any member
- **GIVEN** member name `@test/member-ops`
- **WHEN** `generateProxyDockerfile("@test/member-ops")` is called
- **THEN** the returned Dockerfile starts with `FROM node:22-slim` (no `AS builder`), contains `npm install --omit=dev`, `COPY mason/dist`, `COPY workspace/`, and `CMD ["proxy", "--member", "@test/member-ops"]`
- **AND** does NOT contain `AS builder`, `npm run build`, or `COPY --from=builder`

#### Scenario: Entrypoint uses mason/ prefix path
- **GIVEN** any member name
- **WHEN** `generateProxyDockerfile(memberName)` is called
- **THEN** the entrypoint is `["node", "/app/mason/bin/mason.js"]`

#### Scenario: No null return
- **GIVEN** any member (stdio or remote-only)
- **WHEN** `generateProxyDockerfile(memberName)` is called
- **THEN** it always returns a non-null Dockerfile string

#### Scenario: No mcp-proxy references
- **WHEN** `generateProxyDockerfile(memberName)` is called
- **THEN** the returned Dockerfile does not contain "mcp-proxy", "tbxark", or "/main"

### Requirement: Install command generates proxy build context in proxy/ directory

The `runInstall()` function SHALL:
1. NOT generate `mcp-proxy/config.json`
2. NOT import or call `generateProxyConfig()`
3. Generate `proxy/Dockerfile` using `generateProxyDockerfile(memberName)`
4. Copy pre-built mason artifacts (`dist/`, `bin/`) from `getMasonProjectRoot()` into `proxy/mason/`
5. Copy `package.json` from `getMasonProjectRoot()` into `proxy/mason/`
6. NOT copy source files (`src/`), TypeScript config files, or `node_modules/` into the build context
7. Copy member workspace directories (apps/, roles/, members/, tasks/, skills/) into `proxy/workspace/`
8. Copy non-local packages from the resolved dependency graph into `proxy/workspace/{type}s/{basename}/` -- packages NOT in the member's resolved graph SHALL be excluded

#### Scenario: No mcp-proxy config generated
- **GIVEN** a valid member
- **WHEN** `runInstall()` is called
- **THEN** no `mcp-proxy/config.json` file exists in the output directory

#### Scenario: Pre-built mason copied to proxy build context
- **GIVEN** a valid agent member
- **WHEN** `runInstall()` is called
- **THEN** `proxy/mason/package.json` exists in the output
- **AND** `proxy/mason/dist/` and `proxy/mason/bin/` directories exist
- **AND** no `proxy/mason/src/` or `proxy/mason/tsconfig*` files exist

#### Scenario: Workspace copied to proxy build context
- **GIVEN** a valid agent member with packages in apps/ and members/
- **WHEN** `runInstall()` is called
- **THEN** `proxy/workspace/members/` and `proxy/workspace/apps/` exist with the package.json files

#### Scenario: Non-local packages outside resolved graph are excluded
- **GIVEN** a local member `@vis/member-note-taker` and a node_modules package `@clawmasons/member-note-taker` with the same directory basename
- **WHEN** `runInstall()` is called for `@vis/member-note-taker`
- **THEN** `proxy/workspace/members/note-taker/package.json` SHALL contain `@vis/member-note-taker` (not `@clawmasons`)
