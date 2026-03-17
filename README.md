# Mason

Mason is a MIT licensed tool provided by Clawmasons, to help you run your agents in containers, ASAP


# Why?
 1. Skills are not to be trusted (running arbitrary code from npm is a real risk) — [learn more]
 2. LLMs are not to be trusted — [learn more]
 3. Agent frameworks are not to be trusted (see #2) — [learn more]
 4. Fewer compromised machines means fewer incentives for attackers — [learn more]

# How we'll get there

`mason` combines security and productivity improvements to make it a no-brainer.

### How it improves your life
- **Define once, run on Any Agent, Anywhere** 
  - Continue to define skills in your agent of choice, mason can run them on any supported agent in a docker container  
  - Once mason roles are set up, anyone with access to your project can securely run their agents
  - run with a different Agent during outages
- Seamless MCP server re-authentication [learn why this is easy for us]
- Launch a project in a dev-container with agent enabled [learn more]
- [learn more about mason productivity improvements]

## How it improves security
 - **Docker Container** — First step: sandbox the agent into a container. Start here, even if you explore other features later.
 - **Securely share credentials with agents** — 
   - Know what tools the agent is going to use credentials for
   - Agents use a separate MCP proxy to run the tools, which enforces the role permissions
   - Agents never have direct access to your mcp tool credentials
   - [learn more about security]


## Prerequisites

- **Docker** — Required for running agents in containers
- **Claude Code** — Installed and authenticated (`claude setup-token` exports `CLAUDE_CODE_OAUTH_TOKEN`)

## Install

```bash
npm install -g @clawmasons/mason
```

## Run your agent in a container

```bash
cd ~/your-project
mason
mason claude
```

Your agent is now sandboxed to your project directory instead of your entire computer.

The agent starts with a pre-packaged "setup" role that walks you through configuring your project:
  - Define roles to control agent access [learn more about roles]
  - Set up operating system tools in your container, and MCP servers [learn more]
  - Add more agents to run your project 

Once setup is complete, you can run your project on any agent as any role.


## Quick Start


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
```

The `ROLE.md` uses agent-native field names (e.g., `commands` for Claude Code, `instructions` for Codex). The system normalizes these to a generic representation (ROLE_TYPES) and can materialize the role for any supported runtime.

### Command Reference

| Command | Description |
|---------|-------------|
| `mason run <agent> --role <name>` | Run a role on the specified agent runtime |
| `mason <agent> --role <name>` | Shorthand for `run` |
| `mason run <agent> --role <name> --acp` | Run as an ACP server |
| `mason run <agent> --role <name> --dev-container` | Run a dev container with Agent enabled within VScode |

## Documentation

| Doc | Description |
|-----|-------------|
| [Overview](docs/overview.md) | What Mason is and why it matters |
| [Getting Started](docs/get-started.md) | Install and run your first role |
| [Core Concepts](docs/concepts.md) | Roles, tasks, skills, apps, and how they compose |
| [Architecture](docs/architecture.md) | Runtime architecture with sequence diagrams |
| [CLI Reference](docs/cli.md) | Complete command reference |
| [Security Model](docs/security.md) | Credentials, permissions, audit logging |
| [MCP Proxy](docs/component-mcp-proxy.md) | Tool filtering and routing |
| [Credential Service](docs/component-credential-service.md) | Secure credential resolution |

## Editor Integration

Use VSCode with a remote dev container
```bash
mason run claude --role writer --dev-container
```


Integrate with your editor via the Agent Communication Protocol:

```bash
mason run claude --role writer --acp
```

Works with Zed, JetBrains, Neovim, and any ACP-compatible client. See the [CLI reference](docs/cli.md#mason-run) for configuration details.

## Contributing

See [DEVELOPMENT.md](DEVELOPMENT.md) for build instructions, project structure, and the programmatic API.

## License

MIT
