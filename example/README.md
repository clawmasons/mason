# Example: Note-Taker Agent

A complete PAM workspace demonstrating all 5 component types with a self-contained note-taking agent. No external API keys needed — it uses the MCP filesystem server to read and write local files.

## Component Overview

```
@example/agent-note-taker          (agent — claude-code runtime)
└── @example/role-writer           (role — permissions boundary)
    ├── @example/task-take-notes   (task — subagent)
    │   ├── requires: @example/app-filesystem
    │   └── requires: @example/skill-markdown-conventions
    ├── permissions: @example/app-filesystem → [read_file, write_file, list_directory, create_directory]
    └── @example/skill-markdown-conventions
```

| Type  | Package                              | Purpose                            |
|-------|--------------------------------------|------------------------------------|
| App   | `@example/app-filesystem`            | MCP filesystem server (stdio)      |
| Skill | `@example/skill-markdown-conventions`| Markdown formatting guide          |
| Task  | `@example/task-take-notes`           | Subagent: create & organize notes  |
| Role  | `@example/role-writer`               | Permission boundary for filesystem |
| Agent | `@example/agent-note-taker`          | Top-level agent (claude-code)      |

## Quick Start

```bash
cd example

# Validate the agent graph (all 4 checks should pass)
node ../bin/pam.js validate @example/agent-note-taker

# List all discovered packages
node ../bin/pam.js list

# Install and generate deployment artifacts
node ../bin/pam.js install @example/agent-note-taker

# Inspect the generated output
ls .pam/agents/note-taker/
```

## Directory Structure

```
example/
├── package.json                  # Root workspace (private)
├── README.md                     # This file
├── apps/
│   └── filesystem/
│       └── package.json          # @example/app-filesystem
├── skills/
│   └── markdown-conventions/
│       ├── package.json          # @example/skill-markdown-conventions
│       └── SKILL.md              # Formatting conventions artifact
├── tasks/
│   └── take-notes/
│       ├── package.json          # @example/task-take-notes
│       └── prompts/
│           └── take-notes.md     # Task prompt
├── roles/
│   └── writer/
│       └── package.json          # @example/role-writer
└── agents/
    └── note-taker/
        └── package.json          # @example/agent-note-taker
```

## How It Works

1. **App** (`@example/app-filesystem`) — Launches the MCP filesystem server via `npx`, giving the agent tools to interact with local files.

2. **Skill** (`@example/skill-markdown-conventions`) — Provides a `SKILL.md` artifact that teaches the agent markdown formatting rules.

3. **Task** (`@example/task-take-notes`) — A subagent task with a prompt that instructs the agent to create notes. Declares that it requires the filesystem app and the markdown skill.

4. **Role** (`@example/role-writer`) — Groups the task and skill together and defines which filesystem tools are allowed (`read_file`, `write_file`, `list_directory`, `create_directory`).

5. **Agent** (`@example/agent-note-taker`) — The top-level entry point. Uses the `claude-code` runtime and the writer role.

## What `pam install` Generates

Running `pam install @example/agent-note-taker` produces:

```
.pam/agents/note-taker/
├── docker-compose.yml     # Container orchestration for the MCP server
├── .env                   # Environment variables
├── mcp-proxy/             # MCP proxy configuration with tool filtering
├── claude-code/           # Claude Code settings (MCP servers, permissions)
└── pam.lock.json          # Resolved dependency graph snapshot
```
