# chapter

Clawmasons Chapter — npm-native packaging, governance, and runtime portability for AI agents.

## Installation

```bash
npm install -g @clawmasons/chapter
```

This installs the `chapter` CLI globally. The monorepo contains three packages:

- **`@clawmasons/chapter`** — CLI and library (the main install)
- **`@clawmasons/shared`** — schemas, types, and utilities (internal dependency)
- **`@clawmasons/proxy`** — MCP proxy server (internal dependency)

## CLI Usage

### Chapter Development

```bash
# Initialize a new chapter workspace
chapter init --name acme.platform

# Add a chapter package dependency
chapter add @clawmasons/app-github

# Remove a chapter package dependency
chapter remove @clawmasons/app-github

# List agents and their dependency trees
chapter list

# Validate an agent's dependency graph and permissions
chapter validate @acme.platform/agent-note-taker

# Resolve agent graph and generate chapter.lock.json
chapter build @acme.platform/agent-note-taker

# Display the resolved permission matrix for an agent
chapter permissions @acme.platform/agent-note-taker

# Start the MCP proxy server for an agent
chapter proxy --agent @acme.platform/agent-note-taker

# Scaffold Docker build system (Dockerfiles for proxy + agent containers)
chapter docker-init
```

### Running Agents

In a project directory where you want to run an agent:

```bash
# Initialize the project directory for running chapter agents
chapter run-init

# Run an agent interactively against this project
chapter run-agent note-taker writer
```

## Getting Started

### 1. Create a chapter workspace

```bash
chapter init --name acme.platform
cd acme.platform
```

This creates the workspace with directories for `apps/`, `tasks/`, `skills/`, `roles/`, and `agents/`.

### 2. Develop your agent

Add chapter packages, then list and validate:

```bash
chapter add @clawmasons/app-github
chapter list
chapter validate @acme.platform/agent-note-taker
```

### 3. Build and containerize

```bash
chapter build @acme.platform/agent-note-taker
chapter docker-init
```

`docker-init` generates Dockerfiles under `docker/` for both the MCP proxy and agent containers.

### 4. Run in a project

In the target project directory:

```bash
chapter run-init
chapter run-agent note-taker writer
```

This spins up the proxy and agent containers via Docker Compose, running the agent interactively against your project.

## Project Structure

```
chapter/
  packages/
    cli/       # @clawmasons/chapter — CLI commands and library
    shared/    # @clawmasons/shared — schemas, types, utilities
    proxy/     # @clawmasons/proxy — MCP proxy server
  e2e/         # end-to-end tests
```

A chapter workspace (created by `chapter init`) has this layout:

```
<workspace>/
  apps/            # MCP server packages (type: "app")
  tasks/           # Task packages (type: "task")
  skills/          # Skill packages (type: "skill")
  roles/           # Role packages (type: "role")
  agents/          # Agent packages (type: "agent")
  .clawmasons/     # Chapter metadata
    chapter.json   # Workspace config
  package.json     # npm workspaces root
```

## Programmatic API

Chapter exports its core modules for use as a library:

```ts
import {
  discoverPackages,
  resolveAgent,
  validateAgent,
  claudeCodeMaterializer,
} from "@clawmasons/chapter";

// Schemas and types are also available directly
import {
  parseChapterField,
  computeToolFilters,
  type ResolvedAgent,
  type ChapterField,
} from "@clawmasons/shared";
```

## Development

```bash
npm install          # install dependencies
npm run build        # compile TypeScript
npm run typecheck    # type-check without emitting
npm run lint         # run ESLint
npm test             # run tests
```

### Using a Local Build

```bash
# Build from source
npm install && npm run build

# Link globally, then use in a consuming project
cd packages/cli && npm link
cd /path/to/project && npm link @clawmasons/chapter
```

## License

MIT
