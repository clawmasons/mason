---
title: App
description: MCP server providing tools to agents
---

# App

An **app** is an MCP (Model Context Protocol) server that provides tools to agents. Apps are the bridge between agents and external capabilities — file systems, APIs, databases, and more.

## Package Definition

```json
{
  "name": "@acme.platform/app-filesystem",
  "version": "1.0.0",
  "description": "MCP filesystem server — read, write, and browse local files",
  "chapter": {
    "type": "app",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "./notes"],
    "tools": ["read_file", "write_file", "list_directory", "create_directory"],
    "capabilities": ["tools"]
  }
}
```

## Schema Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"app"` | Yes | Package type identifier |
| `description` | string | No | What this app provides |
| `transport` | enum | Yes | Communication protocol |
| `tools` | string[] | Yes | Tools this app exposes (min 1) |
| `capabilities` | string[] | Yes | MCP capabilities (min 1) |
| `credentials` | string[] | No | Required credential keys (default: `[]`) |
| `env` | object | No | Environment variables to inject |
| `command` | string | Conditional | Command to launch (required for `stdio`) |
| `args` | string[] | Conditional | Command arguments (required for `stdio`) |
| `url` | string | Conditional | Server URL (required for `sse`/`streamable-http`) |

### Transport Types

| Transport | Use Case | Required Fields |
|-----------|----------|----------------|
| `stdio` | Local process (most common) | `command`, `args` |
| `sse` | Remote server via Server-Sent Events | `url` |
| `streamable-http` | Remote server via HTTP streaming | `url` |

### stdio Example

Launches a local process and communicates via stdin/stdout:

```json
{
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "./notes"]
}
```

### SSE / HTTP Example

Connects to a remote MCP server:

```json
{
  "transport": "sse",
  "url": "http://localhost:8080/sse"
}
```

### Tool Declarations

The `tools` array must list every tool the app exposes. This is used for:
- **Validation** — Ensuring roles don't reference nonexistent tools
- **Permission filtering** — The [MCP proxy](component-mcp-proxy.md) uses this to build allow lists
- **Documentation** — Shows what capabilities are available

### Credentials

Apps that need secrets (API keys, tokens) declare them:

```json
{
  "credentials": ["GITHUB_TOKEN"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "GITHUB_TOKEN"
  }
}
```

The `env` field maps environment variable names to credential keys. At runtime, the [credential service](component-credential-service.md) resolves the values securely.

## Tool Prefixing

At runtime, the MCP proxy prefixes tool names with a short app identifier to avoid collisions. For example, if `@acme/app-github` exposes `create_pr`, the agent sees it as `github_create_pr`. This is transparent to the agent.

## Related

- [Role](role.md) — Roles define which app tools are permitted
- [Task](task.md) — Tasks declare which apps they require
- [MCP Proxy](component-mcp-proxy.md) — Manages app connections and tool routing
