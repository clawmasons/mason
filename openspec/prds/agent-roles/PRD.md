# Agent Roles — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** ClawForge, Inc.

---

## 1. Problem Statement

Today, `chapter` workspaces are organized around **agents** as the top-level deployable unit. An agent declares roles, runtimes, and resources — but this forces users to think in terms of "which agent should I build?" before they can think about "what should this agent be able to do?" The result is unnecessary indirection: every role needs a wrapping agent package before it can run, and switching an existing role between agent runtimes requires restructuring the dependency graph.

Specific friction points:

- **Agent package overhead:** To run a single role, you must create an agent package that wraps it. For users who just want to define "this is what my coding assistant can do," the agent layer adds no value.
- **No local-first authoring:** There is no way to define a role as a simple markdown file in a project directory and immediately run it. You must create a full npm package workspace.
- **Tight agent-runtime coupling:** A role defined for Claude Code cannot be trivially run on Codex without creating a separate agent package that declares the different runtime.
- **No portable role definition:** Roles exist only as `package.json` metadata. There is no human-readable, self-contained definition format that can live alongside project files.
- **No role-level Docker generation:** Docker build contexts are generated per agent-runtime combination. There is no way to say "containerize this role for Claude Code" without the full agent→role→task dependency chain in packages.

---

## 2. Vision

**Roles become the primary unit of composition and deployment.** A role is a self-contained definition of what an AI agent can do — its tasks, skills, MCP servers, permissions, container requirements, and system prompt — expressed as a single `ROLE.md` file with bundled resources.

Users define roles locally in their project, run them on any supported agent runtime, package them to npm for sharing, and generate containerized environments — all without creating agent wrapper packages.

The transformation: `Agent wraps Role` → `Role materializes to Agent`.

---

## 3. Design Principles

- **ROLE.md is the source of truth.** A role is fully defined by its `ROLE.md` file and sibling resources. No external metadata required.
- **Agent-native authoring, generic internals.** `ROLE.md` uses the vocabulary of the agent it lives under (Claude: commands, mcp_servers; Codex: instructions). The internal type system normalizes to generic names.
- **Any role, any runtime.** A role defined in `.claude/roles/` can be materialized for Codex or any other supported runtime. The directory it lives in hints at authoring intent, not deployment constraint.
- **Local-first, package-later.** Roles work immediately from local directories. Packaging to npm is an optional distribution step, not a prerequisite for running.
- **Roles replace agents as the top-level unit.** The `agent` package type is removed. Roles are what you install, run, and share.

---

## 4. ROLE.md Specification

A role is defined by a `ROLE.md` file containing YAML frontmatter and a markdown body. The body is the role's system prompt — instructions the agent receives when operating in this role.

### 4.1 File Location

Roles can be defined in any supported agent's directory structure within a project:

```
<project>/.claude/roles/<role-name>/ROLE.md      # Claude Code
<project>/.codex/roles/<role-name>/ROLE.md       # Codex
<project>/.aider/roles/<role-name>/ROLE.md       # Aider
```

The parent agent directory (`.claude/`, `.codex/`, etc.) determines the authoring dialect — which field names are used in the frontmatter. The role name is derived from the directory name.

### 4.2 Frontmatter Schema

The frontmatter uses **agent-specific field names** that map to the generic ROLE_TYPES internally. Below is the Claude Code dialect:

```yaml
---
name: define-change
description: Defines a new PRD for the project
version: 1.0.0
scope: acme.engineering

# Agent-specific names (Claude Code dialect)
commands: ['define-change', 'review-change']
skills: ['@acme/skill-prd-writing']
mcp_servers:
  - name: github
    # Transport, env, and connection details are read from the agent's
    # MCP server configuration (e.g., .claude/settings.json) at
    # materialization time. Only name and tool permissions are declared here.
    tools:
      allow: ['create_issue', 'list_repos', 'create_pr']
      deny: ['delete_repo']

# Container requirements
container:
  packages:
    apt: ['jq', 'curl']
    npm: ['typescript']
    pip: ['pdfkit']
  ignore:
    paths:
      - '.mason/'
      - '.claude/'
      - '.codes/'
      - '.env'
  mounts:
    - source: './data'
      target: '/workspace/data'
      readonly: true

# Governance
risk: LOW
constraints:
  maxConcurrentTasks: 3
  requireApprovalFor: ['create_pr']

# Credentials the role needs at agent runtime
credentials: ['GITHUB_TOKEN', 'ANTHROPIC_API_KEY']
---

You are a PRD author. Create clear, well-structured product requirements documents.

When defining requirements:
- Use concrete use cases with acceptance criteria
- Separate functional from non-functional requirements
- Include edge cases and error scenarios
```

### 4.3 Bundled Resources

A role directory can contain additional files alongside `ROLE.md`. These are **bundled resources** — scripts, templates, reference docs, or any file the role needs at runtime:

```
.claude/roles/define-change/
├── ROLE.md
├── templates/
│   └── prd-template.md
├── scripts/
│   └── pdf-generator.py
└── examples/
    └── good-prd.md
```

Bundled resources are referenced by relative path from the role directory. They are copied into the materialized workspace and available to the agent at runtime. The system tracks their absolute filesystem paths but never loads large files into memory — only paths are stored in ROLE_TYPES.


### 4.4 Field Reference (Claude Code Dialect)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable role name. Must be unique within a project. |
| `description` | string | Yes | What this role does. |
| `version` | string | No | Semver version. Required for packaged roles. |
| `scope` | string | No | NPM scope for packaging (e.g., `acme.engineering`). |
| `commands` | string[] | No | Claude Code slash commands this role provides. |
| `skills` | string[] | No | Skill packages or local skill paths this role depends on. |
| `mcp_servers` | object[] | No | MCP server configurations with tool-level permissions. |
| `container` | object | No | Container requirements: packages, ignore paths, mounts. |
| `container.packages.apt` | string[] | No | APT packages to install in the container. |
| `container.packages.npm` | string[] | No | NPM packages to install in the container. |
| `container.packages.pip` | string[] | No | Python packages to install in the container. |
| `container.ignore.paths` | string[] | No | Paths to mask when project is mounted in container. |
| `container.mounts` | object[] | No | Additional volume mounts. |
| `risk` | enum | No | `HIGH`, `MEDIUM`, `LOW`. Default: `LOW`. |
| `credentials` | string[] | No | Environment variable names needed at runtime. |
| `constraints` | object | No | Governance constraints (concurrency, approval gates). |

### 4.5 Dialect Mapping

Each agent runtime has its own field names that map to the same generic concepts:

| Generic (ROLE_TYPES) | Claude Code | Codex | Aider |
|-----------------------|-------------|-------|-------|
| `tasks` | `commands` | `instructions` | `conventions` |
| `apps` | `mcp_servers` | `mcp_servers` | `mcp_servers` |
| `skills` | `skills` | `skills` | `skills` |
| `instructions` | *(markdown body)* | *(markdown body)* | *(markdown body)* |

The parser reads the ROLE.md, detects the dialect from the parent directory, and normalizes all fields to the generic ROLE_TYPES representation.

---

## 5. ROLE_TYPES — In-Memory Type System

All roles and their dependencies are represented in memory using a generic type system. ROLE_TYPES is the canonical intermediate representation that bridges local definitions, NPM packages, and agent materializations.

### 5.1 Design Goals

- **Agent-agnostic:** Uses generic names (tasks, apps, skills) not tied to any runtime.
- **File-aware:** Tracks absolute filesystem paths for all bundled resources. Files are never loaded into memory — only paths are stored.
- **Bidirectional:** Can be constructed from local ROLE.md files (read) or from NPM packages (read), and can be serialized back to either format (write).
- **Dependency-complete:** A resolved Role includes all transitive dependencies (tasks, apps, skills) fully resolved.

### 5.2 Core Types

```
Role
├── metadata: RoleMetadata (name, version, scope, description)
├── instructions: string (the markdown body)
├── tasks: TaskRef[] (commands/instructions provided by the role)
├── apps: AppConfig[] (MCP servers with permissions)
├── skills: SkillRef[] (skills/context artifacts)
├── container: ContainerRequirements
├── governance: GovernanceConfig (risk, constraints, credentials)
├── resources: ResourceFile[] (bundled files — paths only, not content)
└── source: RoleSource (local path or package reference)

ResourceFile
├── relativePath: string (path relative to role directory)
├── absolutePath: string (resolved filesystem path)
└── permissions: number (file mode to preserve on copy)

AppConfig (generic for "MCP server")
├── name: string
├── package: string (npm package or local path)
├── transport: 'stdio' | 'sse' | 'streamable-http'
├── command?: string
├── args?: string[]
├── url?: string
├── env: Record<string, string>
├── tools: ToolPermissions ({allow: string[], deny: string[]})
└── credentials: string[]

ContainerRequirements
├── packages: {apt: string[], npm: string[], pip: string[]}
├── ignore: {paths: string[]}
├── mounts: MountConfig[]
└── baseImage?: string

RoleSource
├── type: 'local' | 'package'
├── agentDialect?: string (inferred from directory for local roles)
├── path?: string (absolute path for local roles)
└── packageName?: string (npm package name for packaged roles)
```

### 5.3 Transformation Pipeline

```
ROLE.md (agent-specific)
    ↓ readMaterializedRole()
ROLE_TYPES (generic)
    ↓ materializeForAgent() or packageRole()
AGENT_ROLE_MATERIALIZATION  or  NPM_PACKAGE

NPM_PACKAGE
    ↓ readPackagedRole()
ROLE_TYPES (generic)
    ↓ materializeForAgent()
AGENT_ROLE_MATERIALIZATION
```

---

## 6. Role Sources

Roles can originate from two sources. Both are loaded into the same ROLE_TYPES representation.

### 6.1 Local Roles (ROLE.md)

Defined in a project's agent directory:

```
~/projects/cool-app/.claude/roles/create-prd/ROLE.md
```

**Loading (`readMaterializedRole`):**
1. Detect the agent dialect from the parent directory (`.claude/` → Claude Code dialect).
2. Parse YAML frontmatter and markdown body.
3. Resolve bundled resource paths relative to the role directory.
4. Normalize agent-specific field names to generic ROLE_TYPES.
5. Resolve dependency references (skills, apps) — local paths resolved relative to project, package names left as references.

### 6.2 Packaged Roles (NPM)

Installed via npm into a project's `node_modules/`:

```bash
npm install --save-dev @acme.engineering/role-create-prd
```

**Loading (`readPackagedRole`):**
1. Read the package's `package.json` `chapter` field (type: `role`).
2. Read the bundled `ROLE.md` from the package.
3. Expect all dependencies (skills, apps) to already be in `node_modules/`.
4. Resolve all paths relative to the package's location in `node_modules/`.
5. Construct ROLE_TYPES with `source.type = 'package'`.

### 6.3 Equivalence

A local role and a packaged role produce identical ROLE_TYPES (except for `source`). This means:
- You can develop a role locally, test it, then package it without changes.
- You can install a packaged role, then "eject" it to a local ROLE.md for customization.

---

## 7. Role Materialization

Materialization is the process of transforming a ROLE_TYPES into the files needed to run it on a specific agent runtime inside a Docker container.

### 7.1 Docker Build Directory

Each role gets a dedicated Docker build directory:

```
<project>/.mason/docker/<role-name>/
├── <agent-type>/
│   ├── Dockerfile
│   └── workspace/
│       └── project/
│           ├── .claude/          # (or .codex/, etc.)
│           │   ├── settings.json
│           │   ├── commands/     # materialized tasks
│           │   └── skills/       # materialized skills
│           └── <bundled-resources>/
├── mcp-proxy/
│   ├── Dockerfile
│   └── config.json
└── docker-compose.yaml
```

### 7.2 Agent Materializer

Given a ROLE_TYPES with all dependencies resolved, the agent materializer generates:

1. **Dockerfile** — Base image + all `container.packages` installed at build time.
2. **Workspace files** — Agent-native configuration:
   - MCP settings pointing to the proxy
   - Tasks/commands materialized from the role's task list
   - Skills copied from dependency packages or local paths
   - Bundled resources copied from the role directory
3. **AGENTS.md** (or equivalent) — Role identity, permissions, and constraints for the LLM.

A role defined in `.claude/` can be materialized for Codex. The materializer translates from generic ROLE_TYPES to the target agent's native format, regardless of the original authoring dialect.

### 7.3 Container Ignore (Volume Masking)

The `container.ignore.paths` field specifies project paths that should be hidden when the project is bind-mounted into the container. This is implemented using Docker volume stacking:

- **Directories** (trailing `/` or known directory): Masked with named empty volumes.
- **Files** (no trailing `/`): Masked with a read-only bind mount of a sentinel empty file.
- The project tree itself is mounted read-only.

Sentinel file: `.mason/empty-file` (created with `chmod 444`).

Example: Given `ignore.paths: ['.mason/', '.claude/', '.env']`:

```yaml
services:
  agent:
    volumes:
      - ./:/workspace/project:ro
      - ignore-mason:/workspace/project/.mason
      - ignore-claude:/workspace/project/.claude
      - ./.mason/empty-file:/workspace/project/.env:ro

volumes:
  ignore-mason:
  ignore-claude:
```

**Important: Materialized vs. mounted path precedence.** The agent container has two overlapping directory trees at `/home/mason/workspace/`:

1. **Materialized workspace** — files COPYed into the image at build time (e.g., `.claude/settings.json`, `.claude/commands/`, `AGENTS.md`, `skills/`). These live at the image layer.
2. **Project mount** — the host project directory bind-mounted at `/home/mason/workspace/project/` at runtime.

Volume masking applies **only to the project mount**, not to the materialized workspace. Because the materialized workspace and the project mount occupy different paths (`/home/mason/workspace/.claude/` vs. `/home/mason/workspace/project/.claude/`), there is no conflict — ignore volumes target project mount paths exclusively:

```yaml
services:
  agent:
    volumes:
      - ./:/home/mason/workspace/project:ro          # project mount
      - ignore-mason:/home/mason/workspace/project/.mason  # mask in project
      - ignore-claude:/home/mason/workspace/project/.claude           # mask in project
      - ./.mason/empty-file:/home/mason/workspace/project/.env:ro
```

The materialized `.claude/` at `/home/mason/workspace/.claude/` remains untouched. The agent sees the materialized configuration files while the host project's `.claude/` directory (which may contain different or sensitive settings) is hidden.

### 7.4 MCP Proxy Materialization

The proxy materializer generates:

The proxy uses the native `@clawmasons/proxy` package (not an external proxy). It is built from a generated Dockerfile at `docker/proxy/<role-name>/Dockerfile` using the `node:22-slim` base image, with all framework packages (`@clawmasons/mason`, `@clawmasons/proxy`, `@clawmasons/shared`, etc.) and their transitive dependencies pre-copied into `docker/node_modules/` by the `docker-init` command. The proxy runs as: `node node_modules/.bin/mason chapter proxy --agent <agentName> --transport streamable-http`.

The proxy materializer generates:

1. **`Dockerfile`** — `node:22-slim` base with build tools for native module compilation (e.g., `better-sqlite3`). Copies pre-populated `node_modules/` from the Docker build context. Runs as `USER mason` on port 9090.
2. **Runtime configuration** — The proxy discovers its MCP server configuration from the resolved agent definition at startup (not from a static `config.json`). Tool-level permissions are enforced by the `ToolRouter`, which applies `ToolFilter` rules computed from the role's `apps[].tools.allow` and `apps[].tools.deny` declarations. Environment variables (`CHAPTER_PROXY_TOKEN`, `CREDENTIAL_PROXY_TOKEN`, `CHAPTER_SESSION_TYPE`, `CHAPTER_DECLARED_CREDENTIALS`) are injected via docker-compose at session start.

### 7.5 Session Directory

Each run creates a session:

```
<project>/.mason/sessions/<session-id>/
├── docker-compose.yaml    # References docker-role-build-dir for Dockerfiles
└── logs/
```

The session's `docker-compose.yaml` references the role's Docker build directory for Dockerfile contexts and mounts the project directory.

**Operator access:** The session directory is a fully functional Docker Compose project. Users can run standard `docker compose` commands from this directory for debugging and operational tasks:

```bash
cd .mason/sessions/<session-id>/
docker compose logs -f          # Stream logs from all services
docker compose logs agent       # Logs from the agent container only
docker compose ps               # Check container status
docker compose exec agent sh    # Shell into the running agent container
docker compose down             # Stop all services for this session
```

The session's compose file must be self-contained — all build contexts, volume mounts, and environment variables must be resolvable from the session directory (using relative paths back to the Docker build directory and project root). This enables users to diagnose issues, inspect logs, and manage sessions without going through the CLI.

---

## 8. Running Roles

### 8.1 Local Role

Run a locally-defined role on a specific agent runtime:

```bash
# Run on Claude Code (inferred from role location)
clawmasons run claude --role create-prd

# Run on Codex (cross-agent materialization)
clawmasons run codex --role create-prd

# Start as ACP server
clawmasons run claude --role create-prd --acp
```

### 8.2 Packaged Role

Packaged roles must be explicitly installed via npm before they can be run. The CLI does **not** auto-install missing packages — if a role reference resolves to a package name that is not found in `node_modules/`, the CLI must exit with a clear error message instructing the user to install it:

```
Error: Role "@acme.engineering/role-create-prd" not found.
  It is not a local role and is not installed as a package.
  To install: npm install --save-dev @acme.engineering/role-create-prd
```

Install from npm, then run:

```bash
npm install --save-dev @acme.engineering/role-create-prd
clawmasons run claude --role @acme.engineering/role-create-prd
```

### 8.3 Startup Sequence

1. **Load ROLE_TYPES** — `readMaterializedRole` (local) or `readPackagedRole` (npm).
2. **Resolve dependencies** — Ensure all referenced skills, apps, and tasks are available.
3. **Materialize Docker build directory** — Generate Dockerfiles, workspace, proxy config.
4. **Create session directory** — Session ID, compose file, log directory.
5. **Docker Compose up** — Start MCP proxy (detached).
6. **Start credential service** — In-process on host.
7. **Docker Compose run agent** — Interactive or piped (ACP mode).

---

## 9. CLI Changes

### 9.1 Command Structure

The `agent` package type and the `agent` CLI command are removed. They are replaced by a `run` command that takes an agent type and a role name:

```
clawmasons run <agent-type> --role <role-name> [options]
clawmasons run claude --role create-prd
clawmasons run codex --role create-prd --acp
```

The `run` command replaces the previous `agent` command. The agent type (`claude`, `codex`, `aider`) is a required positional argument that selects the runtime. The `--role` flag selects which role to materialize and run on that runtime.

**Shorthand syntax:** As a convenience, `mason <agent-type> --role <name>` is also supported. If the CLI receives a top-level argument that does not match any known command (`run`, `init`, `chapter`, etc.), it checks the argument against the registered agent type registry. If it matches a known agent type, the CLI treats the invocation as equivalent to `mason run <agent-type> ...`. If it does not match any known command or agent type, the CLI exits with an error listing available commands and agent types.

```
# These are equivalent:
clawmasons run claude --role create-prd
clawmasons claude --role create-prd        # shorthand
```

### 9.2 Revised Command Reference

| Command | Description |
|---------|-------------|
| `mason run <agent-type> --role <name>` | Run a role on the specified agent runtime. |
| `mason <agent-type> --role <name>` | Shorthand for `run`. |
| `mason run <agent-type> --role <name> --acp` | Run a role as an ACP server. |
| `mason init` | Initialize a project (lodge). |
| `mason chapter init` | Initialize a chapter workspace. |
| `mason chapter build` | Build: resolve + materialize Docker dirs for all roles. |
| `mason chapter list` | List available roles (local + installed). |
| `mason chapter validate` | Validate role definitions and dependency graphs. |
| `mason chapter permissions <role>` | Display resolved permissions for a role. |
| `mason chapter pack` | Package roles to distributable tarballs. |
| `mason chapter add <pkg>` | Install a role/skill/app package. |
| `mason chapter remove <pkg>` | Remove a package. |
| `mason chapter proxy` | Start standalone proxy. |

### 9.3 Package Type Changes

| Before | After |
|--------|-------|
| agent, role, task, skill, app | **role**, task, skill, app |

The `agent` package type is removed. Its fields (`runtimes`, `proxy`, `resources`, `credentials`) move into the role definition (ROLE.md frontmatter or `chapter` field in `package.json` for packaged roles).

---

## 10. Mason Skill

A new built-in skill (`skills/mason/SKILL.md`) that helps users define roles for their project.

### 10.1 Purpose

Mason analyzes a project's existing configuration — skills, commands, MCP servers, local CLI tools — and proposes a `ROLE.md` that captures the current setup as a portable role definition.

### 10.2 Capabilities

- **Inventory:** Scans the project for existing skills, commands/slash-commands, MCP server configurations, and CLI tools used in prompts.
- **Propose:** Generates a draft `ROLE.md` with:
  - Appropriate frontmatter fields populated from discovered configuration.
  - Tool-level permissions derived from actual usage patterns.
  - Container requirements inferred from tool dependencies.
  - System prompt synthesized from existing AGENTS.md or similar.
- **Restrict:** Proposes minimal command-line argument allowlists based on observed usage.
- **Install:** Can be added to any project via `npx skill add mason`.

### 10.3 Use Cases

- **Migration:** Convert an existing agent workspace into a portable role definition.
- **Audit:** Review what tools and permissions an agent is actually using vs. what's declared.
- **Onboarding:** Help new users create their first role from an existing project setup.

---

## 11. Monorepo Generation

### 11.1 Purpose

Generate a publishable npm monorepo from a local role definition, enabling distribution through package registries.

### 11.2 Command

```bash
mason init-repo --role create-prd [--target-dir <path>]
```

Default target: `.mason/repositories/<role-name>/`

### 11.3 Generated Structure

```
create-prd/
├── package.json           # Root workspace config (private: true)
├── roles/
│   └── create-prd/
│       ├── package.json   # chapter.type = "role"
│       └── ROLE.md
├── skills/
│   └── prd-writing/
│       ├── package.json   # chapter.type = "skill"
│       └── SKILL.md
├── apps/
│   └── github/
│       └── package.json   # chapter.type = "app" (if custom)
└── tasks/
    └── define-change/
        ├── package.json   # chapter.type = "task"
        └── PROMPT.md
```

Each dependency is a separate workspace package, independently publishable.

### 11.4 Distribution Workflow

1. **Generate:** `mason init-repo --role create-prd`
2. **Publish:** `npm publish` from each package (or use npm workspaces `--workspaces`).
3. **Install in another project:** `npm install --save-dev @acme/role-create-prd`
4. **Run:** `mason run claude --role @acme/role-create-prd`

Alternative (local-only distribution):

1. **Generate + pack:** `mason init-repo --role create-prd && cd .mason/repositories/create-prd && npm pack --workspaces`
2. **Install from tarballs:** `npm install ./dist/*.tgz`

Projects do not work directly with a role repository — only through installed packages or local ROLE.md files.

---

## 12. Use Cases

### UC-1: Local Role Development

**Actor:** Developer working on a project.
**Goal:** Define a role as a markdown file and run it immediately.

**Flow:**
1. Developer creates `.claude/roles/create-prd/ROLE.md` with frontmatter and system prompt.
2. Optionally adds bundled resources (templates, scripts) in the role directory.
3. Runs `mason run claude --role create-prd`.
4. System reads ROLE.md, resolves dependencies, materializes Docker build directory, starts session.
5. Agent starts with the role's system prompt, permissions, and tools active.

**Acceptance Criteria:**
- No `package.json` or workspace required for a local role to run.
- Changes to ROLE.md take effect on next run (no build step for local roles).
- Bundled resources are available in the container workspace.

---

### UC-2: Cross-Agent Portability

**Actor:** Developer who defined a role for Claude Code but wants to run it on Codex.
**Goal:** Run the same role on a different agent runtime.

**Flow:**
1. Developer has `.claude/roles/create-prd/ROLE.md` (Claude dialect).
2. Runs `mason run codex --role create-prd`.
3. System reads ROLE.md, normalizes Claude-specific field names to ROLE_TYPES.
4. Codex materializer generates Codex-native workspace from ROLE_TYPES.
5. Agent starts on Codex with equivalent configuration.

**Acceptance Criteria:**
- A role authored in any agent dialect can be materialized for any supported runtime.
- The materialized workspace uses the target runtime's native configuration format.
- All permissions, tools, and constraints are preserved across materializations.

---

### UC-3: Package and Share a Role

**Actor:** Team lead who wants to share a role across projects.
**Goal:** Package a local role to npm and install it in another project.

**Flow:**
1. Developer has a working local role in `.claude/roles/create-prd/`.
2. Runs `mason init-repo --role create-prd` to generate a monorepo.
3. Publishes packages to npm registry.
4. In another project, runs `npm install --save-dev @acme/role-create-prd`.
5. Runs `mason run claude --role @acme/role-create-prd`.

**Acceptance Criteria:**
- Local roles and packaged roles produce identical ROLE_TYPES (except source metadata).
- A packaged role works without any local ROLE.md files.
- All dependencies (skills, apps, tasks) are resolved from node_modules.

---

### UC-4: Docker Containerization per Role

**Actor:** Developer running an agent in a containerized environment.
**Goal:** Each role generates its own Docker build context with appropriate isolation.

**Flow:**
1. Developer defines a role with `container.packages` and `container.ignore`.
2. Runs `mason run claude --role create-prd`.
3. System generates Docker build directory at `.mason/docker/create-prd/`.
4. Dockerfile installs all declared packages at build time.
5. Docker Compose masks ignored paths using volume stacking.
6. Agent runs in container with project mounted read-only.

**Acceptance Criteria:**
- Each role has an isolated Docker build directory.
- Container packages are installed at build time (not runtime).
- Ignored paths are invisible to the agent inside the container.
- Project is mounted read-only; writes go to designated writable mounts only.

---

### UC-5: Mason Skill — Role Proposal

**Actor:** Developer with an existing agent configuration who wants to capture it as a role.
**Goal:** Auto-generate a ROLE.md from existing project configuration.

**Flow:**
1. Developer installs mason skill: `npx skill add mason`.
2. Runs mason in their project.
3. Mason scans existing skills, commands, MCP servers, and CLI tools.
4. Mason proposes a draft ROLE.md with populated frontmatter and permissions.
5. Developer reviews, edits, and saves the ROLE.md.

**Acceptance Criteria:**
- Mason discovers all agent-relevant configuration in the project.
- Proposed permissions are minimal (least-privilege based on actual usage).
- Proposed command-line arguments are restricted to observed patterns.
- Output is a valid ROLE.md that can be immediately run.

---

### UC-6: Monorepo Generation and Distribution

**Actor:** Platform engineer distributing roles to multiple projects.
**Goal:** Generate a publishable monorepo from a local role and distribute via npm.

**Flow:**
1. Engineer runs `mason init-repo --role create-prd --target-dir ./role-repo`.
2. System reads the local role, generates monorepo with separate packages per dependency.
3. Engineer publishes to npm (or packs tarballs for private distribution).
4. Consumer projects install the role package and run it.

**Acceptance Criteria:**
- Generated monorepo uses npm workspaces with independent packages.
- Each package is independently publishable.
- `npm pack --workspaces` produces installable tarballs for offline distribution.
- Installed packages work identically to the original local role.

---

## 13. Non-Functional Requirements

### 13.1 Performance

- **Role loading** (ROLE.md parse + dependency resolution) must complete in under 2 seconds for roles with up to 20 dependencies.
- **Materialization** (generating Docker build directory) must complete in under 5 seconds.
- **Bundled resources** are never loaded into memory — only filesystem paths are tracked.

### 13.2 Compatibility

- **NPM compatibility:** All packaged roles are valid npm packages. No custom registry required.
- **Docker compatibility:** Generated Dockerfiles and Compose files must work with Docker Engine 24+ and Docker Compose v2.

### 13.3 Security

- **Credential isolation:** Credentials are never embedded in ROLE.md, Docker images, or workspace files. They are resolved at runtime via the credential service.
- **Container isolation:** Project mounted read-only. Ignored paths are masked. Agent cannot access masked paths.
- **Permission enforcement:** MCP proxy `toolFilter` enforces allow-lists computed from role permissions. This is a hard boundary independent of LLM behavior.

---

## Appendix A: ROLE.md Frontmatter Schema (Claude Code Dialect)

```yaml
---
# Required
name: string          # Role identifier
description: string   # What the role does

# Optional metadata
version: string       # Semver (required for packages)
scope: string         # NPM scope

# Agent-specific (Claude Code names)
commands: string[]    # Slash commands
skills: string[]      # Skill references (packages or local paths)
mcp_servers:          # MCP server configurations
  - name: string
    package: string
    transport: enum(stdio, sse, streamable-http)
    command?: string
    args?: string[]
    url?: string
    env?: Record<string, string>
    tools:
      allow: string[]
      deny?: string[]
    credentials?: string[]

# Container
container:
  packages:
    apt?: string[]
    npm?: string[]
    pip?: string[]
  ignore:
    paths?: string[]
  mounts?:
    - source: string
      target: string
      readonly?: boolean
  baseImage?: string

# Governance
risk?: enum(HIGH, MEDIUM, LOW)
credentials?: string[]
constraints?:
  maxConcurrentTasks?: number
  requireApprovalFor?: string[]
---

[System prompt in markdown]
```

## Appendix B: Agent Dialect Registry

| Runtime | Directory | Tasks Field | Apps Field | Skills Field |
|---------|-----------|-------------|------------|-----------------|
| Claude Code | `.claude/` | `commands` | `mcp_servers` | `skills` |
| Codex | `.codex/` | `instructions` | `mcp_servers` | `skills` |
| Aider | `.aider/` | `conventions` | `mcp_servers` | `skills` |

New runtimes are registered by adding entries to the dialect registry and implementing a materializer.
