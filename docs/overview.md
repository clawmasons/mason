---
title: Overview
description: What is clawmasons and why secure agent packaging matters
---

# Overview

AI agents are powerful — but deploying them today means handing over broad tool access with no guardrails. Credentials leak through environment variables and Docker inspect. There's no audit trail of what tools were called or what data was accessed. And agent definitions are locked to a single runtime.

**Clawmasons Chapter** solves this with npm-native packaging, governance, and runtime portability for AI agents.

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
- **Pi-coding-agent** — Supports any LLM provider (OpenRouter, Anthropic, OpenAI, Google, Mistral, Groq, xAI, Azure)
- **MCP Agent** — Lightweight test runtime (no LLM required)

### npm-Native Packaging

Everything is a `package.json`. Agents, roles, tasks, skills, and apps are standard npm packages with a `chapter` metadata field. Use npm workspaces, publish to registries, and compose agents from reusable components.

### Editor Integration

Run agents in Docker containers for full isolation, or integrate directly with your editor via the Agent Communication Protocol (ACP). Supported editors include Zed, JetBrains, Neovim, and any ACP-compatible client.

## What It Is Not

- **Not an AI model** — Clawmasons orchestrates agents, it doesn't provide the LLM
- **Not a prompt framework** — It handles packaging, permissions, and runtime; bring your own prompts
- **Not a cloud platform** — Everything runs locally in Docker containers on your machine

## Next Steps

- [Getting Started](get-started.md) — Install and run your first agent
- [Core Concepts](concepts.md) — Understand the mental model
- [Architecture](architecture.mdx) — How the runtime works
