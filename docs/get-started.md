---
title: Getting Started
description: Install clawmasons and run your first role in 5 minutes
---

# Getting Started

This guide walks you through installing clawmasons, creating a workspace, and running your first role.

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

A lodge is the top-level organizational container for your workspaces. See [Lodge](lodge.md) for details.

```bash
clawmasons init
```

This creates a lodge directory at `~/.clawmasons/<lodge-name>/` with a governance charter.

## Step 2: Create a Chapter Workspace

A chapter is an npm workspace containing your role packages. The `--template note-taker` flag scaffolds a complete working example.

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
  roles/writer/             # Role definition (deployable unit)
  .clawmasons/              # Workspace metadata
  package.json              # npm workspaces root
```

## Step 3: Explore the Workspace

List the roles and their dependency trees:

```bash
clawmasons chapter list
```

Validate a role's dependency graph and permissions:

```bash
clawmasons chapter validate @acme.platform/role-writer
```

View the resolved permission matrix:

```bash
clawmasons chapter permissions @acme.platform/role-writer
```

## Step 4: Build

Resolve the role graph, pack packages, and generate Docker artifacts:

```bash
clawmasons chapter build
```

This produces:
- `chapter.lock.json` — resolved dependency snapshot
- `dist/*.tgz` — packed npm packages
- `docker/` — Dockerfiles for proxy and agent containers

## Step 5: Run the Role

Navigate to the project directory where you want the agent to work, then:

```bash
clawmasons run claude --role writer
```

This starts two Docker containers and an in-process credential service:
1. **MCP Proxy** (Docker) — enforces role-based tool filtering
2. **Credential Service** (in-process) — resolves credentials on-demand from your host
3. **Agent** (Docker) — runs the agent runtime (Claude Code by default)

The agent starts interactively, and you can give it tasks through the terminal.

## What Just Happened?

When you ran `clawmasons run`, the system:

1. Discovered the role and resolved its dependency graph (role -> tasks/skills/apps)
2. Started the MCP proxy with the role's permission rules
3. Started the credential service in-process for secure secret resolution
4. Started the agent container, which connected to the proxy
5. The proxy filtered available tools based on the writer role's permissions
6. The agent received only the tools it was authorized to use

All tool calls and credential accesses were logged for audit.

> **Tip:** You can also define roles as local `ROLE.md` files without creating a full chapter workspace. See [Role](chapter-role.md) for the ROLE.md format and discovery rules.

## Next Steps

- [Core Concepts](concepts.md) — Understand lodges, chapters, roles, tasks, skills, and apps
- [Initialization](initialization.md) — How directories and metadata are set up
- [CLI Reference](cli.md) — Full command reference
- [Architecture](architecture.md) — Runtime architecture with sequence diagrams
- [Security Model](security.md) — How credentials and permissions work
