# Mason

npm-native packaging, governance, and runtime portability for AI agent roles.

## Why Mason?

AI agents need tools, but tool access today is ungoverned. Credentials leak via environment variables. There's no audit trail. Agent definitions are locked to a single runtime.

Mason solves this:

- **Credential isolation** — Secrets resolved on-demand, never in env vars or Docker inspect
- **Role-based tool filtering** — Agents only see tools their role permits
- **Audit logging** — Every tool call and credential access logged
- **Runtime portability** — Same role definition works on Claude Code, Codex, Aider, and more
- **Local-first authoring** — Define a role as a `ROLE.md` file and run it immediately
- **npm-native** — Package and share roles with standard npm tooling

## Install

```bash
npm install -g @clawmasons/chapter
```

## Quick Start

### Option 1: Local Role (recommended)

Create a `ROLE.md` file in your project:

```bash
mkdir -p .claude/roles/writer
cat > .claude/roles/writer/ROLE.md << 'EOF'
---
name: writer
description: A writing assistant with access to GitHub tools
mcp_servers:
  - name: github
    tools:
      allow: ['create_issue', 'list_repos']
---

You are a technical writer. Help create clear documentation.
EOF
```

Run it:

```bash
mason run claude --role writer
```

### Option 2: Chapter Workspace

```bash
# Initialize a lodge (organizational container)
mason init

# Create a chapter workspace with the note-taker template
mason chapter init --name acme.platform --template note-taker
cd acme.platform

# Build all roles
mason chapter build

# Run a role
mason run claude --role note-taker
```

This spins up an MCP proxy (tool filtering), credential service (secret management), and agent container — all governed by the role's permissions.

## How It Works

**Roles are the primary deployable unit.** A role is defined by a `ROLE.md` file — a markdown document with YAML frontmatter that declares the role's tasks, tools, permissions, container requirements, and system prompt.

Roles are composed from four npm package types:

| Type | Purpose |
|------|---------|
| **Role** | Deployable unit — tasks, tools, permissions, and system prompt |
| **App** | MCP server providing tools |
| **Skill** | Knowledge artifacts (prompts, conventions) |
| **Task** | Unit of work for the agent |

### ROLE.md Format

```yaml
---
name: create-prd
description: Creates product requirements documents
commands: ['define-change']
skills: ['@acme/skill-prd-writing']
mcp_servers:
  - name: github
    tools:
      allow: ['create_issue', 'create_pr']
container:
  packages:
    apt: ['jq']
risk: LOW
credentials: ['GITHUB_TOKEN']
---

You are a PRD author. Create clear, well-structured requirements documents.
```

The `ROLE.md` uses agent-native field names (e.g., `commands` for Claude Code, `instructions` for Codex). The system normalizes these to a generic representation (ROLE_TYPES) and can materialize the role for any supported runtime.

### Command Reference

| Command | Description |
|---------|-------------|
| `mason run <agent-type> --role <name>` | Run a role on the specified agent runtime |
| `mason <agent-type> --role <name>` | Shorthand for `run` |
| `mason run <agent-type> --role <name> --acp` | Run as an ACP server |
| `mason chapter build` | Build: resolve + materialize Docker dirs for all roles |
| `mason chapter list` | List available roles (local + installed) |
| `mason chapter validate` | Validate role definitions and dependency graphs |

## Documentation

| Doc | Description |
|-----|-------------|
| [Overview](docs/overview.md) | What Mason is and why it matters |
| [Getting Started](docs/get-started.md) | Install and run your first role |
| [Core Concepts](docs/concepts.md) | Lodges, chapters, roles, tasks, skills, apps |
| [Architecture](docs/architecture.md) | Runtime architecture with sequence diagrams |
| [CLI Reference](docs/cli.md) | Complete command reference |
| [Security Model](docs/security.md) | Credentials, permissions, audit logging |
| [MCP Proxy](docs/component-mcp-proxy.md) | Tool filtering and routing |
| [Credential Service](docs/component-credential-service.md) | Secure credential resolution |

## Editor Integration (ACP)

Integrate with your editor via the Agent Communication Protocol:

```bash
mason run claude --role writer --acp
```

Works with Zed, JetBrains, Neovim, and any ACP-compatible client. See the [CLI reference](docs/cli.md#mason-run) for configuration details.

## Contributing

See [DEVELOPMENT.md](DEVELOPMENT.md) for build instructions, project structure, and the programmatic API.

## License

MIT
