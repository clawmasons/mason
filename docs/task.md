---
title: Task
description: Unit of work that agents execute
---

# Task

A **task** is a unit of work that defines what an agent does. Tasks declare what [apps](app.md) and [skills](skill.md) they need, and can be composed into workflows.

## Package Definition

```json
{
  "name": "@acme.platform/task-take-notes",
  "version": "1.0.0",
  "description": "Subagent task — create and organize markdown notes",
  "mason": {
    "type": "task",
    "taskType": "subagent",
    "prompt": "./prompts/take-notes.md",
    "requires": {
      "apps": ["@acme.platform/app-filesystem"],
      "skills": ["@acme.platform/skill-markdown-conventions"]
    }
  }
}
```

## Schema Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"task"` | Yes | Package type identifier |
| `taskType` | enum | Yes | Execution type (see below) |
| `prompt` | string | No | Path to prompt file |
| `requires` | object | No | Required apps and skills |
| `tasks` | string[] | No | Sub-tasks (for composite type) |
| `timeout` | string | No | Execution timeout |
| `approval` | enum | No | Approval mode |

### Task Types

| Type | Description |
|------|-------------|
| `subagent` | Delegates work to an AI sub-agent with a prompt |
| `script` | Executes a shell script or command |
| `composite` | Orchestrates multiple sub-tasks |
| `human` | Requires human input or approval |

### Requirements

Declare which apps and skills the task needs:

```json
{
  "requires": {
    "apps": ["@acme/app-filesystem", "@acme/app-github"],
    "skills": ["@acme/skill-markdown-conventions"]
  }
}
```

These dependencies are resolved at build time and ensured to be available at runtime.

### Prompt Files

For `subagent` tasks, the `prompt` field points to a markdown file containing the agent's instructions:

```json
{
  "taskType": "subagent",
  "prompt": "./prompts/take-notes.md"
}
```

The prompt file is injected into the agent's context during execution (e.g., as a slash command in Claude Code or a task prompt in other runtimes).

### Approval Modes

| Mode | Description |
|------|-------------|
| `auto` | Execute without approval |
| `confirm` | Require confirmation before execution |
| `review` | Require review of results after execution |

### Composite Tasks

Composite tasks orchestrate sub-tasks:

```json
{
  "taskType": "composite",
  "tasks": [
    "@acme/task-gather-requirements",
    "@acme/task-write-implementation",
    "@acme/task-run-tests"
  ]
}
```

## Related

- [Role](role.md) — Roles reference tasks to make them available
- [App](app.md) — Tools that tasks require
- [Skill](skill.md) — Knowledge that tasks use
