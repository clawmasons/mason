---
title: Overview
description: What is mason and why secure agent packaging matters
---

# Overview

Easily run your AI agents in secure Docker containers.

Agents are powerful — but dangerous. They need tools, credentials, and broad system access to be useful. Without guardrails, credentials leak through environment variables and `docker inspect`, there's no audit trail of what tools were called, and role definitions are locked to a single runtime.

**Mason** makes it easy to secure your agents with npm-native packaging, governance, and runtime portability.

## What It Does

### Secure Credential Isolation

Credentials are never exposed via environment variables or Docker inspect. Instead, they're resolved on-demand through a dedicated credential service and injected only into the agent's child process memory. Every credential access is logged.

### Role-Based Tool Filtering

Agents don't get blanket access to all tools. Each agent runs under a **role** that defines exactly which tools from which apps it can use — with explicit allow and deny lists. The MCP proxy enforces this at runtime.

### Audit Logging

Every tool call and credential request is logged to a local SQLite database with timestamps, agent identity, role context, and outcome. You can trace exactly what an agent did and when.

### Runtime Portability

The same agent definition works across multiple runtimes:

- **Claude Code** — Anthropic's coding agent
- **pi-coding-agent** — Supports any LLM provider (OpenRouter, Anthropic, OpenAI, Google, Mistral, Groq, xAI, Azure)
- **MCP Agent** — Lightweight test runtime (no LLM required)

Custom agents can be registered in `.mason/config.json` by pointing to any npm package that implements the Agent Package SDK. See [Project Configuration](cli.md#project-configuration) for the full schema.

### npm-Native Packaging

Everything is a `package.json`. Roles, tasks, skills, and apps are standard npm packages with a `mason` metadata field. Use npm workspaces, publish to registries, and compose roles from reusable components.

### Editor Integration

Run agents in Docker containers for full isolation, or integrate directly with your editor via the Agent Communication Protocol (ACP). Supported editors include Zed, JetBrains, Neovim, and any ACP-compatible client.

## Next Steps

- [Getting Started](get-started.md) — Install and run your first role
- [Core Concepts](concepts.md) — Understand the mental model
- [Architecture](architecture.md) — How the runtime works
