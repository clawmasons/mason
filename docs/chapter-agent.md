---
title: Agent
description: Top-level deployable unit combining roles and runtime configuration
---

# Agent

An **agent** is the top-level deployable package in clawmasons. It combines one or more [roles](chapter-role.md) with runtime configuration, credential declarations, and proxy settings to create a complete, runnable agent.

## Package Definition

```json
{
  "name": "@acme.platform/agent-note-taker",
  "version": "1.0.0",
  "description": "Note-taker agent — creates and organizes markdown notes",
  "chapter": {
    "type": "agent",
    "name": "Note Taker",
    "slug": "note-taker",
    "description": "A note-taking agent that reads, writes, and organizes markdown files.",
    "runtimes": ["claude-code"],
    "roles": ["@acme.platform/role-writer"]
  }
}
```

## Schema Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"agent"` | Yes | Package type identifier |
| `name` | string | Yes | Human-readable agent name |
| `slug` | string | Yes | URL-safe identifier used in CLI commands |
| `description` | string | No | What this agent does |
| `runtimes` | string[] | Yes | Execution environments (min 1) |
| `roles` | string[] | Yes | Role package references (min 1) |
| `credentials` | string[] | No | Credential keys this agent needs (default: `[]`) |
| `resources` | object[] | No | External resource references (default: `[]`) |
| `proxy` | object | No | Proxy configuration (port, transport type) |
| `llm` | object | No | LLM provider and model |

### Runtimes

| Runtime | Description |
|---------|-------------|
| `claude-code` | Anthropic's Claude Code agent |
| `pi-coding-agent` | Multi-provider agent (requires `llm` field) |
| `mcp-agent` | Lightweight test runtime (no LLM) |

### LLM Configuration

Required for `pi-coding-agent` runtime:

```json
{
  "llm": {
    "provider": "openrouter",
    "model": "anthropic/claude-sonnet-4"
  }
}
```

Supported providers: `anthropic`, `openai`, `openrouter`, `google`, `mistral`, `groq`, `xai`, `azure`.

### Proxy Configuration

```json
{
  "proxy": {
    "port": 9090,
    "type": "sse"
  }
}
```

- `port` — Positive integer, proxy listen port
- `type` — `"sse"` or `"streamable-http"`

### Credentials

Declare credential keys the agent needs at runtime. These are resolved by the [credential service](component-credential-service.md) — never exposed via environment variables.

```json
{
  "credentials": ["GITHUB_TOKEN", "OPENAI_API_KEY"]
}
```

### Resources

External resource references:

```json
{
  "resources": [
    { "type": "github-repo", "ref": "acme/project", "access": "read-write" }
  ]
}
```

## Running an Agent

```bash
# Interactive Docker mode
clawmasons agent <slug> <role-name>

# ACP mode for editor integration
clawmasons acp --role <role-name>
```

See [CLI Reference](cli.md) for full options.

## Related

- [Role](chapter-role.md) — The permission boundaries an agent uses
- [Chapter](chapter.md) — The workspace containing agents
- [Architecture](architecture.md) — How agents run at runtime
- [Security](security.md) — Credential isolation and audit logging
