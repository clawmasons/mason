# Spec: Proxy Static Config

## Purpose

The proxy container uses a pre-generated static config file (`proxy-config.json`) instead of runtime package discovery. This eliminates the need for `node_modules/` in the proxy container and enables build-time resolution of MCP server configurations with runtime env var substitution.

## Requirements

### Requirement: Proxy config is generated at build time

The build pipeline SHALL generate a `proxy-config.json` file in the Docker build context containing pre-resolved MCP server configurations. The config file SHALL contain:
- `role`: The role name string
- `toolFilters`: Pre-computed tool filter map from `computeToolFilters()`
- `approvalPatterns`: Array of approval patterns from role constraints
- `upstreams`: Array of `UpstreamMcpConfig` objects with env vars as unresolved `${VAR_NAME}` placeholders

#### Scenario: Config generated during mason build
- **WHEN** `mason build` is run for a project with a role that has 2 MCP servers
- **THEN** a `proxy-config.json` file SHALL exist in the Docker build context
- **AND** the `upstreams` array SHALL contain 2 entries with transport, command/args or url, and env placeholders

#### Scenario: Secrets are not baked into config
- **WHEN** a role's MCP server declares `env: { API_KEY: "${API_KEY}" }`
- **THEN** the config file SHALL contain the literal string `"${API_KEY}"` as the env value
- **AND** the actual secret SHALL NOT appear in the config file

### Requirement: Proxy reads config file on startup

The proxy entry point SHALL read `proxy-config.json` from its working directory on startup. It SHALL NOT perform runtime package discovery via `discoverPackages()` or `resolveRolePackage()`.

#### Scenario: Proxy starts from config file
- **WHEN** the proxy container starts with a valid `proxy-config.json` in its working directory
- **THEN** the proxy SHALL parse the config and create an `UpstreamManager` from the `upstreams` array
- **AND** the proxy SHALL NOT scan the filesystem for packages

#### Scenario: Missing config file fails fast
- **WHEN** the proxy container starts without a `proxy-config.json` in its working directory
- **THEN** the proxy SHALL exit with a non-zero exit code and a clear error message

### Requirement: Env var placeholders are resolved at runtime

The proxy SHALL resolve `${VAR_NAME}` placeholders in upstream server env vars from the container's environment variables at startup.

#### Scenario: Env var resolved from container environment
- **WHEN** the config contains `env: { API_KEY: "${API_KEY}" }` and the container has `API_KEY=secret123`
- **THEN** the resolved env passed to the upstream server SHALL be `{ API_KEY: "secret123" }`

#### Scenario: Missing env var at runtime
- **WHEN** the config references `${MISSING_VAR}` and the container environment does not define `MISSING_VAR`
- **THEN** the proxy SHALL log a warning and pass the unresolved placeholder (matching current behavior)

### Requirement: ensureProxyDependencies generates config instead of node_modules

The `ensureProxyDependencies()` function SHALL generate `proxy-config.json` and copy `proxy-bundle.cjs` to the Docker build context. It SHALL NOT collect, copy, or hoist npm packages into a `node_modules/` directory.

#### Scenario: Docker build context after ensureProxyDependencies
- **WHEN** `ensureProxyDependencies()` completes for a project
- **THEN** the Docker build context SHALL contain `proxy-bundle.cjs` and `proxy-config.json`
- **AND** the Docker build context SHALL NOT contain a `node_modules/` directory

### Requirement: synthesizeRolePackages is removed

The `synthesizeRolePackages()` function SHALL be removed. Inline MCP server configurations SHALL be serialized directly into `proxy-config.json` during build-time config generation.

#### Scenario: Role with inline MCP servers
- **WHEN** a role defines inline MCP servers (not backed by a package)
- **THEN** the inline server configs SHALL appear in `proxy-config.json` upstreams array
- **AND** no synthetic package.json files SHALL be created in the build context
