## 1. Docker Compose Generation

- [x] 1.1 Change proxy port mapping in `docker-generator.ts` from `"${proxyPort}:9090"` to `"127.0.0.1::9090"`
- [x] 1.2 Remove `proxyPort` parameter from `SessionComposeOptions` interface and `generateSessionComposeYml()` function
- [x] 1.3 Update any callers that pass `proxyPort` to `generateSessionComposeYml()`

## 2. Port Discovery

- [x] 2.1 Add `discoverProxyPort(composeFile, serviceName)` function in `run-agent.ts` that runs `docker compose port` and parses the output
- [x] 2.2 Integrate `discoverProxyPort()` call after `docker compose up -d` and before `waitForProxyHealth()` in interactive mode
- [x] 2.3 Integrate `discoverProxyPort()` in print mode and any other code paths that start the proxy container

## 3. Relay and Health Check Wiring

- [x] 3.1 Update `waitForProxyHealth()` call to use discovered port instead of static `proxyPort`
- [x] 3.2 Update `startHostProxy()` call to use discovered port for relay WebSocket URL
- [x] 3.3 Remove or deprecate `--proxy-port` CLI flag for Docker-based sessions (keep for standalone `mason proxy`)

## 4. Tests

- [x] 4.1 Update `docker-generator` unit tests for new port mapping format (`127.0.0.1::9090`)
- [x] 4.2 Add unit tests for `discoverProxyPort()` output parsing (success and failure cases)
- [x] 4.3 Verify existing tests still pass after removing `proxyPort` from compose options
