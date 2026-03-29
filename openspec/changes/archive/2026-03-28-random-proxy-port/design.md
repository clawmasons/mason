## Context

The proxy service maps a host port to container port 9090 via Docker Compose. Currently the host port is either a CLI flag (`--proxy-port`, default 3000) or hardcoded (9090 in `docker-generator.ts`). This fixed port is baked into the compose YAML at generation time and used for health checks, relay WebSocket connections, and the HostProxy client.

The flow today:
1. `generateSessionComposeYml()` writes `"${proxyPort}:9090"` into the compose file
2. `execCompose(["up", "-d", proxyServiceName])` starts the proxy
3. `waitForProxyHealth(`http://localhost:${proxyPort}/health`)` polls until ready
4. `defaultStartHostProxy({ relayUrl: `ws://localhost:${proxyPort}/ws/relay` })` connects the relay

All four steps use the same statically-known port. With random ports, step 1 no longer determines the port — a discovery step is needed between steps 2 and 3.

## Goals / Non-Goals

**Goals:**
- Eliminate host port conflicts between concurrent mason sessions
- Bind proxy only to localhost (`127.0.0.1`) for security
- Discover the random port reliably after container startup
- Minimal code changes — only the port mapping and post-startup wiring

**Non-Goals:**
- Changing the container-internal port (stays 9090)
- Changing how the agent connects to the proxy (Docker DNS, unchanged)
- Supporting user-specified host ports (remove `--proxy-port` for docker path)
- Changing the `mason proxy` standalone command (non-docker path keeps its own port flag)

## Decisions

### 1. Use Docker's random port syntax in compose YAML

**Decision**: Change port mapping from `"${proxyPort}:9090"` to `"127.0.0.1::9090"`

**Rationale**: Docker natively supports random port assignment when the host port is omitted. The `127.0.0.1` prefix restricts binding to localhost, which is more secure than the current behavior (binds to all interfaces).

**Alternative considered**: Letting the application find a free port and pass it to Docker — adds complexity and race conditions.

### 2. Discover port via `docker compose port` after startup

**Decision**: After `docker compose up -d` returns, run `docker compose port proxy-{role} 9090` and parse the output (`127.0.0.1:{port}`).

**Rationale**: This is Docker's built-in mechanism for random port discovery. It's reliable and doesn't require inspecting container metadata or parsing YAML.

**Implementation**: Add a helper function (e.g., `discoverProxyPort()`) in `run-agent.ts` that:
1. Calls `docker compose -f <file> port <service> 9090`
2. Parses the output to extract the port number
3. Returns the port as a number

This runs after `execCompose(["up", "-d", ...])` and before `waitForProxyHealth()`.

### 3. Remove `proxyPort` from compose generation, keep for non-docker paths

**Decision**: Remove the `proxyPort` parameter from `SessionComposeOptions` and `generateSessionComposeYml()`. The `--proxy-port` CLI flag stays but is only used for non-docker proxy scenarios (e.g., `mason proxy` standalone command).

**Rationale**: The port is no longer known at compose generation time. Keeping the flag for standalone proxy use avoids breaking that path.

### 4. Pass discovered port through existing call chain

**Decision**: After discovery, pass the port to `waitForProxyHealth()` and `startHostProxy()` exactly as today — just sourced from `docker compose port` instead of CLI options.

**Rationale**: Minimal change to the existing flow. The downstream code doesn't care where the port came from.

## Risks / Trade-offs

- **Port changes on container recreation**: Each `docker compose up` assigns a new port. Any cached port references become stale. → Mitigation: Port is only used within a single session lifecycle; no persistence needed.

- **`docker compose port` failure**: If the command fails or returns unexpected output, the session can't connect. → Mitigation: Parse strictly, fail fast with a clear error message. The command is reliable when the container is running.

- **Slight startup latency**: One extra subprocess call after compose up. → Mitigation: Negligible (~100ms). Already waiting for health check.

- **Print mode / non-interactive flows**: These also use the proxy port. Must ensure all code paths go through the new discovery step. → Mitigation: Audit all callers of `startHostProxy` and `waitForProxyHealth` during implementation.
