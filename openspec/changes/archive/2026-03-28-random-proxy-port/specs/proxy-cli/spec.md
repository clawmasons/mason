## ADDED Requirements

### Requirement: Run-agent uses discovered proxy port for relay and health check

After starting the proxy container with `docker compose up -d`, the run-agent command SHALL call `discoverProxyPort()` to obtain the randomly assigned host port. This discovered port SHALL be used for:

1. The health check URL: `http://localhost:{discoveredPort}/health`
2. The relay WebSocket URL: `ws://localhost:{discoveredPort}/ws/relay`

The run-agent command SHALL NOT use a static `--proxy-port` value for Docker-based sessions.

#### Scenario: Health check uses discovered port
- **WHEN** the proxy container is started and port discovery returns port `55123`
- **THEN** the health check SHALL poll `http://localhost:55123/health`

#### Scenario: Relay connection uses discovered port
- **WHEN** the proxy container is started and port discovery returns port `55123`
- **THEN** the HostProxy SHALL connect to `ws://localhost:55123/ws/relay`

#### Scenario: Port discovery happens between compose up and health check
- **WHEN** `docker compose up -d` completes for the proxy service
- **THEN** `discoverProxyPort()` SHALL be called before `waitForProxyHealth()` and before `startHostProxy()`
