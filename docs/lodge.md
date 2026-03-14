---
title: Lodge
description: Top-level organizational container for agent governance
---

# Lodge

A **lodge** is the top-level organizational container in mason. It represents a governance boundary — like a company or team workspace — under which all agent [chapters](chapter.md) are organized.

## Creating a Lodge

```bash
mason init
```

Options:
- `--lodge <name>` — Lodge name (overrides `LODGE` env var)
- `--lodge-home <path>` — Lodge home directory (overrides `LODGE_HOME` env var)
- `--home <path>` — Mason home directory (overrides `MASON_HOME` env var)

## Directory Structure

```
~/.mason/
  config.json              # Registered lodges
  <lodge-name>/
    CHARTER.md             # Governance charter
    chapters/              # Chapter workspaces
```

## The Charter

Each lodge contains a `CHARTER.md` that defines governance rules for all agents in the lodge. This is the organizational policy layer — it sets expectations for how agents should behave, what risks are acceptable, and what approval processes apply.

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MASON_HOME` | `~/.mason` | Root directory for all mason data |
| `LODGE` | Auto-detected | Current lodge name |
| `LODGE_HOME` | `$MASON_HOME/$LODGE` | Current lodge directory |

## Multi-Lodge Setups

You can maintain multiple lodges for different organizations or contexts. Each lodge has its own charter and set of chapters, providing clean governance separation.

## Related

- [Chapter](chapter.md) — The workspace within a lodge
- [Getting Started](get-started.md) — Create your first lodge
