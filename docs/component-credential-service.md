---
title: Credential Service
description: Secure credential resolution and management for agent sessions
---

# Credential Service

The **Credential Service** (`@clawmasons/credential-service`) resolves credentials on-demand for role sessions. It ensures secrets are never exposed through environment variables, Docker inspect, or container filesystems.

## How It Works

1. A role declares the credentials it needs (in `ROLE.md` frontmatter or `package.json`)
2. At startup, the agent-entry bootstrap requests each credential through the [MCP Proxy](component-mcp-proxy.md)
3. The proxy relays the request to the credential service via WebSocket
4. The credential service validates the request and resolves the value
5. The value is returned through the proxy to the agent-entry process
6. Agent-entry injects credentials into the agent's child process environment only

The key security property: credentials exist only in the agent's child process memory, never in Docker environment variables or inspect output.

## Resolution Priority

The credential service resolves values from multiple sources in priority order:

| Priority | Source | Description |
|----------|--------|-------------|
| 1 | Session overrides | Credentials passed via ACP session configuration |
| 2 | Environment variables | Process environment of the credential service |
| 3 | macOS Keychain | System keychain lookup |
| 4 | `.env` file | Dotenv file in the project directory |

The first source that provides a value wins.

## Access Validation

Before resolving a credential, the service checks:
- The credential key is declared in the role's `credentials` field
- The request includes a valid session token

If either check fails, the request is denied and logged.

## Audit Logging

Every credential request is logged to the SQLite audit database with:

| Field | Description |
|-------|-------------|
| Timestamp | When the request was made |
| Agent | Which agent requested it |
| Key | The credential key requested |
| Outcome | `granted`, `denied`, or `error` |
| Source | Where the value was resolved from (env, keychain, dotenv) |
| Reason | Why it was denied (if applicable) |

## Architecture

The credential service always runs **in-process** on the host machine, within the `mason run` CLI process. It connects to the MCP proxy via WebSocket to relay credential requests from the agent container.

```
Host Machine:
  mason run CLI process
    ├─ Credential Service (in-memory SQLite)
    └─ WebSocket client → Proxy /ws/credentials

Docker:
  proxy:  → MCP Proxy (port 9090, relays credential requests)
  agent:  → Agent Runtime (requests credentials via proxy)
```

In **ACP mode** (`mason run <agent-type> --role <name> --acp`), credentials from the editor's session configuration are injected as session overrides, giving them highest resolution priority.

## Related

- [MCP Proxy](component-mcp-proxy.md) — Relays credential requests from agents
- [Security](security.md) — Full security model including credential isolation
- [Architecture](architecture.md) — How the credential service fits in the runtime
- [Role](role.md) — How roles declare credentials
