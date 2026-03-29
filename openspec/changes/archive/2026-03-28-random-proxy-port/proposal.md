## Why

The proxy service currently binds to a fixed host port (default 9090 or `--proxy-port`), which causes port conflicts when running multiple mason sessions simultaneously. Using Docker's random port assignment (`127.0.0.1::9090`) eliminates collisions and simplifies multi-session workflows.

## What Changes

- **Docker Compose generation**: Change proxy port mapping from `"${proxyPort}:9090"` to `"127.0.0.1::9090"` (random host port, localhost only)
- **Port discovery**: After `docker compose up`, run `docker compose port proxy-{role} 9090` to discover the assigned host port
- **Relay connection**: Use the discovered random port for the `ws://localhost:{port}/ws/relay` WebSocket URL instead of the static `--proxy-port` value
- **Agent service unchanged**: Agent continues connecting to `http://proxy-{role}:9090` via Docker internal networking (no change)
- **BREAKING**: `--proxy-port` CLI flag becomes unnecessary for the docker-compose path; may be removed or repurposed

## Capabilities

### New Capabilities

_None — this modifies existing capabilities._

### Modified Capabilities

- `docker-compose-generation`: Port mapping changes from fixed host port to Docker random port (`127.0.0.1::9090`)
- `proxy-cli`: Host port discovery changes from static config to runtime lookup via `docker compose port`

## Impact

- **Code**: `docker-generator.ts` (port mapping template), `run-agent.ts` (relay URL construction, port discovery after compose up)
- **CLI**: `--proxy-port` flag may be removed or made optional with no default
- **Specs**: `docker-compose-generation/spec.md`, `proxy-cli/spec.md`, `acp-proxy-cli-command/spec.md`
- **No container-side changes**: Proxy still listens on 9090 inside the container; agent still connects via Docker DNS
