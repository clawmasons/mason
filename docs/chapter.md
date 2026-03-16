---
title: Chapter
description: Workspace for packaging and managing AI agent role components
---

// todo: remove this document any anything linking to it.  we no longer use chapters, but just rely on the project.

# Chapter

A **chapter** is an npm workspace containing role packages. It's the development unit where you create, compose, and build [roles](chapter-role.md), [tasks](chapter-task.md), [skills](chapter-skill.md), and [apps](chapter-app.md).

## Creating a Chapter

```bash
mason chapter init --name <lodge>.<chapter>
```

Options:
- `--name <name>` (required) — Workspace name in `<lodge>.<chapter>` format (e.g., `acme.platform`)
- `--template <template>` — Use a project template (e.g., `note-taker`)

Example:

```bash
mason chapter init --name acme.platform --template note-taker
```

## Directory Structure

```
<workspace>/
  apps/            # App packages (MCP servers)
  tasks/           # Task packages
  skills/          # Skill packages
  roles/           # Role packages
  .mason/
    chapter.json   # Workspace metadata
  package.json     # npm workspaces root
```

## Workspace Management

```bash
# Add a chapter package dependency
mason chapter add @clawmasons/app-github

# Remove a dependency
mason chapter remove @clawmasons/app-github

# List roles and dependency trees
mason chapter list

# Validate a role's graph and permissions
mason chapter validate @acme.platform/role-writer
```

## Building

```bash
mason chapter build
```

Build resolves the role dependency graph, packs all workspace packages to `dist/*.tgz`, and generates Docker artifacts. The output includes:

- `chapter.lock.json` — Resolved dependency snapshot
- `dist/*.tgz` — Packed npm packages
- `docker/` — Dockerfiles for proxy and agent containers

## Related

- [Lodge](lodge.md) — The organizational container a chapter belongs to
- [Role](chapter-role.md) — The deployable units within a chapter
- [CLI Reference](cli.md) — Full command reference for chapter management
