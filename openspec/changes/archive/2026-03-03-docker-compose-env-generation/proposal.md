## Why

The forge pipeline can resolve agents, validate graphs, generate mcp-proxy configs, and materialize Claude Code workspaces — but it cannot yet produce the Docker Compose orchestration layer or credential/lock files. Without `docker-compose.yml`, `.env`, and `forge.lock.json`, the scaffolded agent directory is incomplete and cannot be brought up with `docker compose up`.

## What Changes

- Implement a Docker Compose generator that assembles `docker-compose.yml` from the mcp-proxy service definition, runtime materializer compose services, and the `agent-net` bridge network
- Implement an `.env` template generator that collects all environment variables from app `env` fields and runtime API keys, producing a template with placeholder values
- Implement a `forge.lock.json` generator that snapshots the resolved dependency graph with exact versions
- Wire these generators together as a cohesive "compose orchestration" module

## Capabilities

### New Capabilities
- `docker-compose-generation`: Generates a complete `docker-compose.yml` from a resolved agent, proxy config, and runtime materializer compose services
- `env-generation`: Collects all required environment variables and generates a `.env` template with placeholders
- `lock-file-generation`: Generates `forge.lock.json` with the resolved graph, versions, and generated file inventory

### Modified Capabilities
<!-- No existing spec-level behavior changes -->

## Impact

- **New module:** `src/compose/` with Docker Compose, `.env`, and lock file generators
- **New tests:** `tests/compose/` with unit tests for all three generators
- **Re-exports:** `src/index.ts` updated to export compose module
- **Dependencies:** `js-yaml` added for YAML generation (docker-compose.yml)
