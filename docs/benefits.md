---
title: Benefits
description: Why role-based agent containers improve security and productivity
---

# Benefits

Mason's role-based container model delivers two key advantages: stronger security through isolation, and better agent performance through focus.

## Role-Based Access Control

RBAC is a well-established pattern for user credential management. Mason applies these same principles to AI agents and their container runtime environments.

Instead of giving an agent blanket access to every tool and credential on your machine, Mason lets you define [roles](role.md) with explicit allow/deny lists. Each role only sees the tools it needs — nothing more.

## Privileged Credential Management

Credentials are never exposed to the agent container via environment variables or Docker inspect. Instead, the [host proxy](proxy.md) resolves them on-demand and injects them only into the agent's child process memory. Every access is logged for audit.

### Credential Refreshes

Since credentials are managed by the [proxy](proxy.md) rather than the agent itself, long-lived tokens can be shared with the proxy, which can automatically refresh short-term credentials needed by MCP tools. Neither the agent nor the container ever sees the long-lived token directly.

## Focus

Too many tools and too many skills can confuse an agent. Scoping an agent to a specific role keeps it on task.

For example, you don't want your "Test Developer" role changing production code to make tests pass. But in a typical project, most skills and agent tips are about writing code. Before deploying Mason, we saw agents reverting to those instructions and modifying code to make tests pass instead of fixing the tests.

Mason allowed us to finally control the test development workflow by giving the test role only the tools it needs — and none of the code-editing skills that would tempt it off course.

Subagents help here too, but agents can be resourceful. Role-based isolation provides a hard boundary.

## Print Mode and Session Logging

Mason's print mode (`-p` / `--print`) lets you run an agent non-interactively and capture only the final result on stdout — ideal for scripting, CI pipelines, and automation.

Behind the scenes, Mason uses each agent's native JSON streaming output to capture the full session. Every streamed event is written to `.mason/logs/session.log`, giving you a complete record of the agent's reasoning and tool usage without polluting the terminal. Only the final result text is printed to stdout when the agent finishes.

This is accomplished through an adapter layer in the Agent Package SDK. Each agent package declares its own streaming format — for example, Claude Code uses `--output-format stream-json` while Pi uses `--mode json` — along with a parser that extracts the final result from the stream. Mason handles the rest: redirecting logs, capturing output line by line, and forwarding the exit code.

The same `session.log` file is used by ACP mode, so diagnostic output is always in a consistent location regardless of how the agent was launched.

## Related

- [Security Model](security.md) — Full security architecture
- [Role](role.md) — Defining roles with permissions
- [Proxy](proxy.md) — Tool filtering and credential resolution at runtime
