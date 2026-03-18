---
title: Configure Project
description: How mason configure analyzes your project and creates roles
---

# Configure Project

The `mason configure` command uses a built-in **supervisor role** to analyze your project and generate tailored [roles](role.md) for your team.

## Usage

```bash
mason configure --agent claude
```

The `--agent` flag tells Mason which agent runtime to use for the configuration process (e.g., `claude` for Claude Code).

## What It Does

The configure-project role runs in two phases:

### Phase 1: Plan

Mason scans your project to understand its structure and creates a role plan:

- **Skills** — Discovers existing skills in agent directories (e.g., `.claude/skills/`)
- **Commands** — Finds task/command files (e.g., `.claude/commands/*.md`)
- **MCP servers** — Reads MCP server configuration from agent settings files
- **System prompt** — Extracts context from `CLAUDE.md`, `AGENTS.md`, or agent-specific files
- **Credentials** — Identifies credential keys used by MCP server environment variables

From this scan, Mason generates a role plan at `.mason/{project}-role-plan.md` that proposes roles with appropriate skills, tools, and permissions for your project.

### Phase 2: Implement

Once you approve the plan, Mason creates `ROLE.md` files in `.mason/roles/` for each proposed role. These roles follow the principle of least privilege — each role only gets the tools and credentials it needs.

## Example Output

After running `mason configure`, you might see roles like:

```
.mason/roles/
├── developer/
│   └── ROLE.md       # Code writing, PR creation
├── lead/
│   └── ROLE.md       # PR review, issue management
└── devops/
    └── ROLE.md       # Infrastructure, deployment
```

Each `ROLE.md` contains the role's system prompt, tool permissions, skills, and credential declarations. See [Role](role.md) for the full format.

## Next Steps

After configuration, test your new roles:

1. Review the generated role plan in `.mason/{project}-role-plan.md`
2. Follow the manual verification steps in the plan
3. Run an agent with a role: `mason claude --role developer`
4. Adjust role permissions as needed by editing the `ROLE.md` files

## Related

- [Role](role.md) — Understanding the ROLE.md format
- [Getting Started](get-started.md) — Full setup walkthrough
- [CLI Reference](cli.md) — Complete command reference
- [Security Model](security.md) — How permissions and credentials work
