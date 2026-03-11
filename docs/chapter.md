---
title: Chapter
description: Workspace for packaging and managing AI agent components
---

# Chapter

A **chapter** is an npm workspace containing agent packages. It's the development unit where you create, compose, and build [agents](chapter-agent.md), [roles](chapter-role.md), [tasks](chapter-task.md), [skills](chapter-skill.md), and [apps](chapter-app.md).

## Creating a Chapter

```bash
clawmasons chapter init --name <lodge>.<chapter>
```

Options:
- `--name <name>` (required) — Workspace name in `<lodge>.<chapter>` format (e.g., `acme.platform`)
- `--template <template>` — Use a project template (e.g., `note-taker`)

Example:

```bash
clawmasons chapter init --name acme.platform --template note-taker
```

## Directory Structure

```
<workspace>/
  apps/            # App packages (MCP servers)
  tasks/           # Task packages
  skills/          # Skill packages
  roles/           # Role packages
  agents/          # Agent packages
  .clawmasons/
    chapter.json   # Workspace metadata
  package.json     # npm workspaces root
```

## Workspace Management

```bash
# Add a chapter package dependency
clawmasons chapter add @clawmasons/app-github

# Remove a dependency
clawmasons chapter remove @clawmasons/app-github

# List agents and dependency trees
clawmasons chapter list

# Validate an agent's graph and permissions
clawmasons chapter validate @acme.platform/agent-note-taker
```

## Building

```bash
clawmasons chapter build
```

Build resolves the agent dependency graph, packs all workspace packages to `dist/*.tgz`, and generates Docker artifacts. The output includes:

- `chapter.lock.json` — Resolved dependency snapshot
- `dist/*.tgz` — Packed npm packages
- `docker/` — Dockerfiles for proxy and agent containers

## Related

- [Lodge](lodge.md) — The organizational container a chapter belongs to
- [Agent](chapter-agent.md) — The deployable units within a chapter
- [CLI Reference](cli.md) — Full command reference for chapter management
