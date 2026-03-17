---
title: Getting Started
description: Install Mason and run your first role in 5 minutes
---

# Getting Started

This guide walks you through installing Mason, creating a workspace, and running your first role.

## Prerequisites

- **Node.js** 22 or later
- **npm** 9 or later
- **Docker** (for agent execution)

## Install

```bash
npm install -g @clawmasons/mason
```

This installs the `mason` CLI globally.

## Step 1: Run `mason configure` on your project

```bash
mason configure --agent claude
```

This will create a plan to setup mason, and implement it once approved.


## Step 2: Test your new project roles

Follow the manual verification steps in `.mason/{project}-role-plan.md`

These steps will teach you how to run your agents using mason.


## Next Steps

- [Core Concepts](concepts.md) — Understand roles, tasks, skills, and apps
- [CLI Reference](cli.md) — Full command reference
- [Architecture](architecture.md) — Runtime architecture with sequence diagrams
- [Security Model](security.md) — How credentials and permissions work
