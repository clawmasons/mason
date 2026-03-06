## ADDED Requirements

### Requirement: generateDockerCompose produces a valid docker-compose.yml string

The system SHALL provide a `generateDockerCompose(agent, runtimeServices)` function that returns a YAML string for `docker-compose.yml`. The generated compose file SHALL contain:
- An `mcp-proxy` service built from `./chapter-proxy` that runs the native chapter proxy
- One service per runtime, as provided by `runtimeServices` (a map of runtime name to `ComposeServiceDef`)
- An `chapter-net` bridge network connecting all services

#### Scenario: Basic agent with one runtime produces valid compose
- **WHEN** `generateDockerCompose()` is called with a resolved agent having `runtimes: ["claude-code"]` and one `ComposeServiceDef` for claude-code
- **THEN** the output SHALL contain an `mcp-proxy` service and a `claude-code` service, both on the `chapter-net` network

### Requirement: mcp-proxy service uses native chapter proxy

The `mcp-proxy` service SHALL include:
- `build: ./proxy` (always builds from the per-member proxy Dockerfile)
- `restart: unless-stopped`
- Port mapping `${CHAPTER_PROXY_PORT:-<port>}:<port>` where port comes from `member.proxy.port` (default: 9090)
- Volume mount `./proxy/logs:/logs` for log persistence
- `CHAPTER_PROXY_TOKEN=${CHAPTER_PROXY_TOKEN}` always present in environment
- Environment variables for all app credentials collected from resolved apps' `env` fields
- `networks: [chapter-net]`
- JSON logging driver with `max-size: 10m` and `max-file: 5`
- No `entrypoint:` or `command:` directives (uses Dockerfile ENTRYPOINT/CMD)
- No `config.json` mount (chapter proxy reads from workspace)

#### Scenario: Proxy service has correct port and build
- **WHEN** the member has `proxy: { port: 8080 }`
- **THEN** the proxy service SHALL use `build: ./proxy` and port mapping `${CHAPTER_PROXY_PORT:-8080}:8080`

#### Scenario: Proxy service always includes CHAPTER_PROXY_TOKEN
- **WHEN** `generateDockerCompose()` is called
- **THEN** the mcp-proxy service environment SHALL always include `CHAPTER_PROXY_TOKEN=${CHAPTER_PROXY_TOKEN}`

#### Scenario: Proxy service collects app environment variables
- **WHEN** apps declare `env: { "GITHUB_TOKEN": "${GITHUB_TOKEN}", "SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}" }`
- **THEN** the proxy service environment SHALL include `GITHUB_TOKEN=${GITHUB_TOKEN}` and `SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}`

### Requirement: Runtime services are included as declared

Each entry in `runtimeServices` SHALL be rendered as a docker-compose service. The service name is the runtime name (e.g., `claude-code`). All fields from `ComposeServiceDef` SHALL be included: `build`, `restart`, `volumes`, `working_dir`, `environment`, `depends_on`, `stdin_open`, `tty`, `networks`.

#### Scenario: Multiple runtimes produce multiple services
- **WHEN** `runtimeServices` contains entries for `claude-code` and `codex`
- **THEN** the compose file SHALL contain both `claude-code` and `codex` services with their respective configurations

### Requirement: Network section declares chapter-net bridge

The compose file SHALL include a `networks` section declaring `chapter-net` with `driver: bridge`.

#### Scenario: Network is always present
- **WHEN** `generateDockerCompose()` is called
- **THEN** the output SHALL contain `networks:` with `chapter-net:` and `driver: bridge`
