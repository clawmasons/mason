---
title: Getting Started
description: Install clawmasons and run your first agent in 5 minutes
---

# Getting Started

This guide walks you through installing clawmasons, creating a workspace, and running your first agent.

## Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later
- **Docker** (for agent execution)

## Install

```bash
npm install -g @clawmasons/chapter
```

This installs the `clawmasons` CLI globally.

## Step 1: Initialize a Lodge

A lodge is the top-level organizational container for your agent workspaces. See [Lodge](lodge.md) for details.

```bash
clawmasons init
```

This creates a lodge directory at `~/.clawmasons/<lodge-name>/` with a governance charter.

## Step 2: Create a Chapter Workspace

A chapter is an npm workspace containing your agent packages. The `--template note-taker` flag scaffolds a complete working example.

```bash
clawmasons chapter init --name acme.platform --template note-taker
cd acme.platform
```

This creates a workspace with:

```
acme.platform/
  apps/filesystem/          # MCP server for file operations
  tasks/take-notes/         # Task definition with prompt
  skills/markdown-conventions/  # Knowledge artifact
  roles/writer/             # Permission boundary
  agents/note-taker/        # Deployable agent
  .clawmasons/              # Workspace metadata
  package.json              # npm workspaces root
```

## Step 3: Explore the Workspace

List the agents and their dependency trees:

```bash
clawmasons chapter list
```

Validate the agent's dependency graph and permissions:

```bash
clawmasons chapter validate @acme.platform/agent-note-taker
```

View the resolved permission matrix:

```bash
clawmasons chapter permissions @acme.platform/agent-note-taker
```

## Step 4: Build

Resolve the agent graph, pack packages, and generate Docker artifacts:

```bash
clawmasons chapter build
```

This produces:
- `chapter.lock.json` — resolved dependency snapshot
- `dist/*.tgz` — packed npm packages
- `docker/` — Dockerfiles for proxy and agent containers

## Step 5: Run the Agent

Navigate to the project directory where you want the agent to work, then:

```bash
clawmasons agent note-taker writer
```

This spins up three Docker containers:
1. **MCP Proxy** — enforces role-based tool filtering
2. **Credential Service** — resolves credentials on-demand
3. **Agent** — runs the agent runtime (Claude Code by default)

The agent starts interactively, and you can give it tasks through the terminal.

## What Just Happened?

When you ran `clawmasons agent`, the system:

1. Resolved the agent's dependency graph (agent -> role -> tasks/skills/apps)
2. Started the MCP proxy with the role's permission rules
3. Launched the credential service for secure secret resolution
4. Started the agent container, which connected to the proxy
5. The proxy filtered available tools based on the writer role's permissions
6. The agent received only the tools it was authorized to use

All tool calls and credential accesses were logged for audit.

## Next Steps

- [Core Concepts](concepts.md) — Understand lodges, chapters, roles, agents, tasks, skills, and apps
- [CLI Reference](cli.md) — Full command reference
- [Architecture](architecture.mdx) — Runtime architecture with sequence diagrams
- [Security Model](security.md) — How credentials and permissions work
