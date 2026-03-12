# Mason — Project Scanner and ROLE.md Proposer

Mason is a built-in skill that scans your project's existing configuration and proposes a `ROLE.md` capturing the current setup as a portable role definition.

## When to use

Use Mason when you want to:
- **Migrate** an existing agent workspace into a portable role definition
- **Audit** what tools and permissions an agent is actually using vs. what's declared
- **Onboard** — create your first role from an existing project setup

## How to use

1. **Scan the project** — Mason will inventory your existing skills, commands, MCP server configurations, and system prompts across all agent directories (`.claude/`, `.codex/`, `.aider/`).

2. **Review the scan results** — Mason will present what it found: which skills exist, what commands are defined, which MCP servers are configured, and what system prompt content was discovered.

3. **Generate a draft ROLE.md** — Based on the scan, Mason proposes a `ROLE.md` with:
   - Frontmatter fields populated from discovered configuration
   - **Least-privilege permissions** — MCP servers start with empty `tools.allow` lists. You explicitly add only the tools you need.
   - Credentials extracted from MCP server environment variables
   - Default container ignore paths for security (`.clawmasons/`, `.claude/`, `.env`)
   - System prompt from your existing `CLAUDE.md` or `AGENTS.md`

4. **Customize** — Review the proposed ROLE.md. Add tool permissions, adjust container requirements, refine the system prompt.

5. **Save** — Place the finalized `ROLE.md` in `.<agent>/roles/<role-name>/ROLE.md` to make it immediately runnable.

## Scanner capabilities

The scanner discovers configuration from:

| Source | Location | What's Found |
|--------|----------|--------------|
| Skills | `.<agent>/skills/*/SKILL.md` | Skill names and paths |
| Commands | `.<agent>/commands/*.md` | Command/slash-command names |
| MCP Servers | `.<agent>/settings.json`, `.<agent>/settings.local.json` | Server configs (name, command, args, env) |
| System Prompt | `CLAUDE.md`, `AGENTS.md` | Existing instructions |

## Permissions philosophy

Mason follows the **least-privilege principle**:

- MCP servers are proposed with **empty** `tools.allow` lists — no tools are granted by default
- You must explicitly list each tool the role needs
- Credentials are identified but never embedded — they are resolved at runtime by the credential service
- Container ignore paths hide sensitive directories from the agent

## Example output

See `templates/role-template.md` for a reference ROLE.md template.

## Programmatic API

The scanner and proposer are available as TypeScript utilities from `@clawmasons/shared`:

```typescript
import { scanProject, proposeRoleMd } from "@clawmasons/shared";

const scanResult = await scanProject("/path/to/project");
const roleMd = proposeRoleMd(scanResult, {
  roleName: "my-role",
  description: "My custom role",
});
```
