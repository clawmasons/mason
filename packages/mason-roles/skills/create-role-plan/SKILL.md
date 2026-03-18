---
name: create-role-plan
description: Generates a detailed plan to implement and use mason roles in this project
---

# create-role-plan — Project Scanner and Role Plan Generator


Scans your project and generates a `{project-dir}.mason/plans/initial-role-plan.md` — a planning document that captures proposed roles, implementation steps, and how to test them with mason.

## When to use

Use this skill when you want to:
- **Plan** a new mason setup for a project from scratch
- **Audit** an existing project to propose better role boundaries
- **Onboard** a project by producing a shareable role plan before committing any ROLE.md files

## How to use

1. **Scan the project** — Inventory existing skills, commands, MCP server configurations, and system prompts across all agent directories (`.claude/`, `.codex/`, `.aider/`).

2. **Determine the project name** — Use the root directory name or the `name` field from `package.json` / `pyproject.toml` if present.

3. **Generate `.mason/plans/initial-role-plan.md`** — Write the plan document with the structure below.
  - Summarize the roles that will created
  - document the exact ROLE.md that will be created in .mason/roles/{role-name}/ROLE.md
  - follow ## Document Output Structure

4. **Review with the user** — Walk through proposed roles, adjust risk classifications, rename roles to fit the project's language.

5. Write the role plan markdown file

## Output document structure

```markdown
# {Project Name} Role Plan

## Overview
Brief description of the project, what was scanned (skills, MCP servers, commands, system prompts found),
and a one-paragraph summary of the proposed role structure.

## Proposed Roles

### {role-name} (type: supervisor | project, risk: HIGH | MEDIUM | LOW)
**Rationale:** Why this role exists and who/what uses it.

**Skills:** list of skill names
**MCP Servers:** list with tool allow/deny lists
**Commands:** list of slash-commands
**Credentials:** list of required env vars
**Container ignore paths:** sensitive paths to hide from this agent

Repeat for each proposed role.

## {role-name} Implementation Steps

- [ ] Create `{project-dir}.mason/roles/{role-name}/ROLE.md` for each proposed role
- [ ] Populate frontmatter (name, description, version, type, risk, credentials, container)
- [ ] Write system prompt body in each ROLE.md
- [ ] Configure MCP server tool allow/deny lists
- [ ] Add container ignore paths (`.mason/`, `.claude/`, `.env` at minimum)
- [ ] Add a an "alias" to .mason/config.json to run this role with the current agent
## Testing

How to launch and verify each role with mason:

1. **Launch a role**: `mason run .mason/roles/{role-name}`
2. **Smoke test checklist**:
   - [ ] Role loads without credential errors
   - [ ] MCP servers connect and listed tools match allow list
   - [ ] Denied tools are not accessible
   - [ ] Container ignore paths are not visible to the agent
   - [ ] Skills resolve correctly
3. **Integration test**: Run the role's primary workflow end-to-end and confirm expected outputs
```

## Commit
Once are you done testing, you should commit the changes to the repository


## Scanner capabilities

| Source | Location | What's Found |
|--------|----------|--------------|
| Skills | `.<agent>/skills/*/SKILL.md` | Skill names and paths |
| Commands | `.<agent>/commands/*.md` | Command/slash-command names |
| MCP Servers | `.<agent>/settings.json`, `.<agent>/settings.local.json` | Server configs (name, command, args, env) |
| System Prompt | `CLAUDE.md`, `AGENTS.md` | Existing instructions |

## Permissions philosophy

Follow the **least-privilege principle**:
- MCP servers are proposed with **empty** `tools.allow` lists — no tools are granted by default
- Credentials are identified but never embedded — resolved at runtime by the credential service
- Container ignore paths hide sensitive directories from the agent

## Example Roles

### Researcher with Read and Write tools
```
---
name: researcher
description: researcher that can read and write notes
version: 1.0.0
type: project

skills:
  - ./.claude/skills/markdown-conventions

commands:
  - take-notes

mcp_servers:
  - name: filesystem
    transport: stdio
    command: npx
    args:
      - "-y"
      - "@modelcontextprotocol/server-filesystem"
      - "./notes"
    tools:
      allow:
        - read_file
        - write_file
        - list_directory
        - create_directory

container:
  ignore:
    paths:
      - '.mason/'
      - '.claude/'
      - '.env'

risk: LOW

---

You are a research and note-taking assistant.

```

### "reviewer" role with read only tools
```
---
name: reviewer
description: researche reviewer that can read  notes
version: 1.0.0
type: project

skills:
  - ./.claude/skills/markdown-conventions

commands:
  - take-notes

mcp_servers:
  - name: filesystem
    transport: stdio
    command: npx
    args:
      - "-y"
      - "@modelcontextprotocol/server-filesystem"
      - "./notes"
    tools:
      allow:
        - read_file
        - list_directory
      deny:
        - write_file
        - create_directory

container:
  ignore:
    paths:
      - '.mason/'
      - '.claude/'
      - '.env'

risk: LOW

---

You are a an assistant to research notes in the '/notes' directory.


```

