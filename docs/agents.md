---
title: Supported Agents
description: Agent runtimes that Mason can run in containers
---

# Supported Agents

Mason supports multiple agent runtimes out of the box. The same [role](role.md) definition works across all of them — Mason's materializer translates role configuration into each runtime's native format.

## Built-in Agents

### Claude Code

[Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code-agent/overview) is Anthropic's coding agent with full IDE capabilities.

| | |
|---|---|
| **Package** | `@clawmasons/claude-code-agent` |
| **Alias** | `claude` |
| **Install** | `npm install -g @anthropic-ai/claude-code` |
| **Credentials** | `CLAUDE_CODE_OAUTH_TOKEN` |

```bash
mason run claude --role developer
```

Mason generates `.claude/` directory structure, `AGENTS.md`, `settings.json`, slash commands for tasks, and skill files.

### Pi Coding Agent

[Pi Coding Agent](https://github.com/nicobailey/pi-coding-agent) supports any LLM provider through OpenRouter, Anthropic, OpenAI, Google, Mistral, Groq, xAI, and Azure.

| | |
|---|---|
| **Package** | `@clawmasons/pi-coding-agent` |
| **Alias** | `pi` |
| **Install** | `npm install -g @mariozechner/pi-coding-agent` |
| **Credentials** | Configured via `llm.provider` and `llm.model` |

```bash
mason run pi --role developer
```

Mason generates `.pi/` directory structure with settings, MCP config, and task extensions.

### MCP Agent

A lightweight test runtime that doesn't require an LLM. Useful for testing roles, validating tool permissions, and debugging MCP server configurations.

| | |
|---|---|
| **Package** | `@clawmasons/mcp-agent` |
| **Alias** | `mcp` |
| **Install** | Included with Mason |
| **Credentials** | `TEST_TOKEN` |

```bash
mason run mcp --role developer
```

The MCP agent provides a REPL interface for calling tools directly and an ACP mode for editor integration.

## Custom Agents

You can register custom agent runtimes by adding them to your project's `.mason/config.json`:

```json
{
  "agents": {
    "my-agent": {
      "package": "@my-org/my-agent-package"
    }
  }
}
```

The package must implement the Agent Package SDK — exporting an `AgentPackage` with a `RuntimeMaterializer` that generates the runtime's native workspace format. See [Architecture](architecture.md#materializer-pattern) for details on the materializer pattern.

## Related

- [Architecture](architecture.md) — How agent runtimes fit in the system
- [Role](role.md) — Defining roles that work across runtimes
- [CLI Reference](cli.md) — Running agents from the command line
- [Getting Started](get-started.md) — Install and run your first role
