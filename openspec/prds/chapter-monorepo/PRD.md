# Clawmasons Chapter Monorepo — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** Clawmasons, Inc.
**Supersedes:** chapter-members PRD (partially — replaces member model, retains rebrand)

---

## 1. Executive Summary

Clawmasons Chapter is currently a single npm package (`@clawmasons/mason`) that bundles CLI, proxy, schemas, resolver, materializer, compose, and registry code. This PRD defines the restructuring into an npm workspaces monorepo, the replacement of Docker Compose generation with explicit `docker-init` / `run-init` / `run-agent` commands, and the removal of the "member" concept in favor of agent-only packages.

This PRD covers three interrelated changes:

- **Monorepo restructuring:** Split the single package into `packages/cli`, `packages/proxy`, and `packages/shared` under an npm workspaces root.
- **Agent package type:** Remove the "member" package type (introduced in the chapter-members PRD) and replace it with a simpler "agent" type that contains no PII (no email, authProviders, or human member concept).
- **Docker workflow overhaul:** Remove `install`, `run`, and `stop` commands. Replace with `docker-init` (build system setup), `run-init` (project directory setup), and `run-agent` (interactive agent execution).

---

## 2. Design Principles

- **No PII in packages:** Agent packages contain no personally identifiable information. No email addresses, no auth providers, no human member records.
- **npm-native (preserved):** Every chapter component remains a standard npm package with a `chapter` metadata field.
- **Explicit docker workflow:** Users explicitly initialize build systems and project directories rather than having the CLI magically generate Docker infrastructure during install.
- **Separation of concerns:** CLI, proxy, and shared types are independently versioned and deployable packages.
- **Local-first:** Docker images are built and run locally. Private registry support is deferred to a future PRD.

---

## 3. Monorepo Structure

### 3.1 Root Layout

```
chapter/
├── package.json              # workspaces config, shared dev deps
├── packages/
│   ├── cli/                  # @clawmasons/mason
│   │   ├── package.json
│   │   ├── src/
│   │   └── tests/
│   ├── proxy/                # @clawmasons/proxy
│   │   ├── package.json
│   │   ├── src/
│   │   └── tests/
│   └── shared/               # @clawmasons/shared
│       ├── package.json
│       └── src/
├── openspec/
├── tasks/
└── tsconfig.json
```

### 3.2 Package Summary

| Package | npm Name | Purpose |
|---------|----------|---------|
| `packages/cli` | `@clawmasons/mason` | CLI binary — init, add, remove, validate, docker-init, run-init, run-agent, proxy, publish |
| `packages/proxy` | `@clawmasons/proxy` | Standalone installable proxy server (runs inside Docker containers) |
| `packages/shared` | `@clawmasons/shared` | Shared TypeScript types, Zod schemas, and utilities used by both cli and proxy |

---

## 4. Package Taxonomy (Updated)

The five package types are retained, with "member" replaced by "agent":

| Type | Purpose | Depends On |
|------|---------|------------|
| **app** | MCP server exposing tools to agents | npm runtime deps only |
| **skill** | Knowledge/context artifacts (prompts, examples, reference docs) | Other skills |
| **task** | A unit of work: command, subagent invocation, or composite | Apps, skills, other tasks |
| **role** | Permission-bounded bundle of tasks, apps, and skills | Tasks, apps, skills |
| **agent** | Top-level deployable unit with roles, runtimes, and proxy config | Roles |

### 4.1 Package Type: agent

An agent is the top-level deployable unit. It replaces the "member" type from the chapter-members PRD. Agents contain no PII — no email, no authProviders, no human member concept.

```json
{
  "name": "@lodge.chapter/agent-note-taker",
  "version": "1.0.0",
  "chapter": {
    "type": "agent",
    "name": "Note Taker",
    "slug": "note-taker",
    "description": "Note-taking agent that manages markdown files.",
    "runtimes": ["claude-code"],
    "roles": [
      "@lodge.chapter/role-writer"
    ],
    "resources": [
      {
        "type": "github-repo",
        "ref": "clawmasons/openclaw",
        "access": "read-write"
      }
    ],
    "proxy": {
      "port": 9090,
      "type": "sse"
    },
    "llm": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-6"
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"agent"` | Yes | Package type identifier. |
| `name` | string | Yes | Display name of the agent. |
| `slug` | string | Yes | URL-safe identifier, used for directory names and references. |
| `description` | string | No | Human-readable summary. |
| `runtimes` | string[] | Yes | Runtime environments (e.g., `"claude-code"`, `"codex"`). |
| `roles` | string[] | Yes | Role packages this agent operates with. Defines the permission envelope. |
| `resources` | object[] | No | External resource declarations. |
| `proxy` | object | No | Proxy configuration. |
| `llm` | object | No | LLM provider and model configuration. |

### 4.2 Dependency Graph

```
agent
  └─ role (declares permissions = tool allow-lists per app)
       ├─ task (declares which apps + skills it requires)
       │    ├─ app    (npm dep → MCP server code)
       │    ├─ skill  (npm dep → prompt/knowledge artifacts)
       │    └─ task   (sub-tasks for composite workflows)
       ├─ app   (direct role-level dependencies)
       └─ skill (direct role-level dependencies)
```

---

## 5. CLI Specification (Updated)

### 5.1 Command Reference

| Command | Description |
|---------|-------------|
| `chapter init` | Initializes a chapter workspace. Creates `.mason/` directory, scaffolds config. |
| `chapter add <pkg>` | Wraps `npm install`. Validates the package has a `chapter` field. |
| `chapter remove <pkg>` | Wraps `npm uninstall`. Checks for dependent packages before removing. |
| `chapter list` | Lists installed packages and their resolved role/task/app tree. |
| `chapter validate` | Validates the chapter graph: checks all task requirements covered by role permissions. |
| `chapter docker-init` | Sets up Docker build system — generates Dockerfiles for proxy and agent images. |
| `chapter run-init` | Initializes a project directory for running chapter agents. |
| `chapter run-agent <agent> <role> [<task>]` | Runs a chapter agent interactively against a project directory. |
| `chapter proxy` | Starts the MCP proxy server (for local development). |
| `chapter publish` | Wraps `npm publish`. Adds pre-publish validation. |

### 5.2 Removed Commands

The following commands from the previous CLI are removed:

| Removed Command | Reason |
|-----------------|--------|
| `chapter install` | Replaced by `docker-init` + `run-init` workflow |
| `chapter run` | Replaced by `run-agent` |
| `chapter stop` | No longer needed — agent sessions are interactive |
| `chapter enable` | No member registry |
| `chapter disable` | No member registry |

### 5.3 Removed Infrastructure

- Member registry (`.chapter/members.json`, enable/disable tracking)
- Docker Compose generation during install (`src/compose/docker-compose.ts`, `src/compose/env.ts`, `src/compose/lock.ts`)
- Lock file generation during install
- Proxy Dockerfile generation tied to old install flow (`src/generator/proxy-dockerfile.ts`)

### 5.4 Retained and Refactored Infrastructure

- **Materializer** (`src/materializer/`): The `RuntimeMaterializer` interface and per-runtime implementations (claude-code, pi-coding-agent) are retained as the core mechanism for materializing agent workspaces. Docker-specific methods (`generateDockerfile`, `generateComposeService`, `generateConfigJson`) are removed from the interface, leaving only `materializeWorkspace()`. Docker generation is re-introduced in `docker-init` (Section 6) as a separate concern.
- **Docker utilities**: General-purpose docker utilities (`checkDockerCompose`, `validateEnvFile`, `execDockerCompose`) are retained for reuse by `docker-init` and `run-agent`. The install-specific `resolveMemberDir` is removed.
- **`PROVIDER_ENV_VARS`**: Provider-to-environment-variable mapping is relocated to `materializer/common.ts` for reuse by materializers and future docker environment generation.

---

## 6. `chapter docker-init` (Detailed)

### 6.1 Use Case

A user wants to set up a build system to build Docker images for their chapter.

### 6.2 Preconditions

- Chapter directory has been initialized (`chapter init` has been run)
- `npm install` has been run (all chapter packages are in `node_modules/`)
- All packages have been packed to `/dist` (tgz files via `npm pack`)

### 6.3 Steps

1. Read `.mason/chapter.json` to get `<chapter-full-name>` (format: `<lodge-slug>.<chapter-slug>`)
2. Create `docker/` directory in the chapter root (initialize for TypeScript build system)
3. If current directory has `package.json`, assume local build environment
4. Add `install-local` npm script to root `package.json`: `cd docker && npm install ../dist/*.tgz`
5. Run `install-local` — `docker/package.json` now has all chapter packages as dependencies
6. At this point `docker/node_modules/` has all chapter packages resolved

### 6.4 Proxy Dockerfiles (Per Role)

For each role found at `docker/node_modules/@<chapter-full-name>/role-*`:

1. Create `docker/proxy/<role-name>/Dockerfile`
2. Create supporting directories for running the `@clawmasons/proxy` package in the image
3. Docker image boots with the proxy configured for that role's apps only
4. User in all proxy images: `mason`

### 6.5 Agent Dockerfiles (Per Agent × Role)

For each agent × role combination:

1. Follow role dependencies to determine all apps from the role and its tasks
2. Create `docker/agent/<agent-name>/<role-name>/Dockerfile`
3. Agent images need to mount the project agent directory
4. Mount structure: `/home/mason/workspace/project/.claude`
5. Expectation: `run-agent` command will mount a workspace, then mount a project directory inside it
6. User in all agent images: `mason`

### 6.6 Generated Directory Structure

```
docker/
├── package.json
├── node_modules/              # chapter packages installed from dist/*.tgz
├── proxy/
│   ├── writer/                # one per role
│   │   └── Dockerfile
│   └── reviewer/
│       └── Dockerfile
└── agent/
    ├── note-taker/            # one per agent
    │   ├── writer/            # one per role the agent has
    │   │   └── Dockerfile
    │   └── reviewer/
    │       └── Dockerfile
    └── researcher/
        └── writer/
            └── Dockerfile
```

---

## 7. `chapter run-init` (Detailed)

### 7.1 Use Case

A user wants to initialize a project directory for running chapter agents.

### 7.2 Steps

1. User `cd`s to their project directory (the codebase they want agents to work on)
2. Runs `chapter run-init`
3. CLI prompts for the path to the chapter project's `docker/` directory (the build directory from `docker-init`)
4. Creates `<project-dir>/.mason/` with the following structure:

### 7.3 Generated Structure

```
<project-dir>/
└── .mason/
    ├── chapter.json
    ├── logs/
    └── workspace/
```

### 7.4 `chapter.json` Format

```json
{
  "chapter": "<lodge-slug>.<chapter-slug>",
  "docker-registries": ["local"],
  "docker-build": "/absolute/path/to/chapter/project/docker"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `chapter` | string | Chapter identifier in `<lodge>.<chapter>` format |
| `docker-registries` | string[] | Supported registries. `"local"` only for this PRD. |
| `docker-build` | string | Absolute path to the docker build directory (from `docker-init`) |

---

## 8. `chapter run-agent` (Detailed)

### 8.1 Use Case

A user wants to run a chapter agent interactively against a project directory.

### 8.2 Syntax

```
chapter run-agent <agent> <role> [<task>]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `<agent>` | Yes | Agent slug or package name |
| `<role>` | Yes | Role slug or package name |
| `[<task>]` | No | Specific task to run (otherwise agent gets full role access) |

### 8.3 Steps

1. Read `.mason/chapter.json` from the current project directory
2. Generate a session ID (short, since chapter context is already known)
3. Create `.mason/sessions/<sessionid>/docker/docker-compose.yml`
4. Point Docker Compose at correct Dockerfiles from the `docker-build` directory
5. Start the proxy container detached (background)
6. Start the agent container with stdio attached (interactive)

### 8.4 Session Directory Structure

```
<project-dir>/
└── .mason/
    ├── chapter.json
    ├── logs/
    ├── workspace/
    └── sessions/
        └── <sessionid>/
            └── docker/
                └── docker-compose.yml
```

### 8.5 Docker Compose Behavior

- Proxy runs detached — logs to `.mason/logs/`
- Agent runs interactively — stdio is connected to the user's terminal
- When the agent exits, the proxy is torn down
- Session directory is retained for debugging (logs, compose file)

---

## 9. Docker Image Architecture

### 9.1 Image Types

| Image Type | Scope | User | Purpose |
|------------|-------|------|---------|
| Proxy | Per role | `mason` | Runs `@clawmasons/proxy` configured for the role's apps |
| Agent | Per agent × role | `mason` | Runs the agent runtime (e.g., claude-code) with role access |

### 9.2 Mount Structure

Agent containers mount the project directory:

```
/home/mason/
└── workspace/
    └── project/
        ├── .claude/          # mounted from host
        ├── src/              # project source code
        └── ...
```

- The `workspace/` directory provides a consistent working directory
- The `project/` subdirectory is the actual project mount
- `.claude/` is mounted separately for agent configuration

### 9.3 Registry Support

- This PRD supports **local-only** Docker registry (`docker-registries: ["local"]`)
- Images are built locally via the `docker-build` path
- Private/remote registry support is deferred to a future PRD

---

## 10. Requirements

### P0 — Must-Have

**REQ-001: npm Workspaces Monorepo**

Convert the root project to an npm workspaces monorepo with a `packages/` directory containing `cli`, `proxy`, and `shared` packages.

Acceptance criteria:
- Given the root `package.json`, when inspected, then it contains `"workspaces": ["packages/*"]`.
- Given `npm install` is run at root, then all three packages are linked.
- Given `npm run build` at root, then all packages build in dependency order.

**REQ-002: `packages/cli` — `@clawmasons/mason`**

The CLI package contains the current CLI code minus proxy server code, plus the new `docker-init`, `run-init`, and `run-agent` commands. The CLI binary name remains `chapter`.

Acceptance criteria:
- Given the CLI package is installed globally, when `chapter --help` is run, then it lists the updated command set.
- Given the CLI package, when inspected, then it does not contain proxy server implementation code.

**REQ-003: `packages/proxy` — `@clawmasons/proxy`**

The proxy package is a standalone, independently installable MCP proxy server. It is installed inside Docker containers to provide tool access to agents.

Acceptance criteria:
- Given `npm install @clawmasons/proxy`, when the proxy is started, then it functions as a standalone MCP proxy server.
- Given a Docker image built by `docker-init`, then the proxy package is installed and runnable inside the container.

**REQ-004: `packages/shared` — `@clawmasons/shared`**

Shared types, Zod schemas, and utilities used by both the CLI and proxy packages.

Acceptance criteria:
- Given `packages/cli` and `packages/proxy`, when their imports are inspected, then shared types come from `@clawmasons/shared`.
- Given `packages/shared`, when inspected, then it contains no CLI-specific or proxy-specific code.

**REQ-005: Remove "member" Package Type**

The "member" package type introduced in the chapter-members PRD is removed entirely. No PII (email, authProviders) in packages. No human member concept.

Acceptance criteria:
- Given the codebase, when grepped for `memberType`, then no references exist in source code.
- Given the codebase, when grepped for `"type": "member"`, then no references exist in source code or schemas.
- Given a package with `"chapter": { "type": "member", ... }`, when validated, then it fails.

**REQ-006: "agent" Package Type (Replacing "member")**

Replace the "member" type with a simpler "agent" type. Agent packages contain: name, slug, description, runtimes, roles, resources, proxy config, and llm config. No email, no authProviders, no memberType discrimination.

Acceptance criteria:
- Given a package with `"chapter": { "type": "agent", "name": "...", "slug": "...", "runtimes": [...], "roles": [...] }`, when validated, then it passes.
- Given a package with `"type": "agent"` and an `email` field, when validated, then it fails (email is not part of the agent schema).
- Given a package with `"type": "agent"` and no `runtimes`, when validated, then it fails.

**REQ-007: Remove Human Member Concept**

All code, schemas, and tests related to human members are removed. The system only supports agent packages.

Acceptance criteria:
- Given the codebase, when grepped for `"human"` in schema or type contexts, then no references exist.
- Given the codebase, when grepped for `authProviders`, then no references exist in source code.

**REQ-008: Remove `install`, `run`, `stop` Commands**

Remove the `install`, `run`, and `stop` CLI commands and all associated code and tests.

Acceptance criteria:
- Given `chapter install`, when run, then the command is not found.
- Given `chapter run @agent`, when run, then the command is not found (note: `run-agent` is the new command).
- Given `chapter stop`, when run, then the command is not found.
- Files removed: `src/cli/commands/install.ts`, `src/cli/commands/run.ts`, `src/cli/commands/stop.ts`, `src/cli/commands/enable.ts`, `src/cli/commands/disable.ts`, and corresponding test files.
- Associated code removed: compose generation (`src/compose/`), lock file generation, proxy Dockerfile generation (`src/generator/proxy-dockerfile.ts`).
- Member registry removed: `src/registry/members.ts`, `src/registry/types.ts`, `members.json` handling.
- Materializer refactored: Docker-specific methods removed from `RuntimeMaterializer` interface; workspace materialization retained as core agent infrastructure.
- Docker utilities refactored: `resolveMemberDir` removed; `checkDockerCompose`, `validateEnvFile`, `execDockerCompose` retained for reuse by new commands.

**REQ-009: `chapter docker-init` — Read Chapter Config**

The `docker-init` command reads `.mason/chapter.json` to determine the chapter's full name (format: `<lodge-slug>.<chapter-slug>`).

Acceptance criteria:
- Given a chapter directory with `.mason/chapter.json` containing a valid chapter name, when `docker-init` is run, then it correctly identifies the chapter scope.
- Given no `.mason/chapter.json`, when `docker-init` is run, then it errors with a clear message.

**REQ-010: `chapter docker-init` — Create Docker Directory**

The command creates a `docker/` directory in the chapter root and initializes it for a TypeScript build system.

Acceptance criteria:
- Given `docker-init` is run, then `docker/` directory is created.
- Given `docker/` directory exists, then `docker/package.json` is created.

**REQ-011: `chapter docker-init` — Install Local Packages**

The command adds an `install-local` npm script that installs packed tgz files from `/dist` into the docker directory.

Acceptance criteria:
- Given `docker-init` is run, then root `package.json` has script `"install-local": "cd docker && npm install ../dist/*.tgz"`.
- Given `install-local` is run, then `docker/node_modules/` contains all chapter packages.

**REQ-012: `chapter docker-init` — Proxy Dockerfiles**

For each role found in the docker node_modules, generate a proxy Dockerfile.

Acceptance criteria:
- Given a chapter with roles `writer` and `reviewer`, when `docker-init` completes, then `docker/proxy/writer/Dockerfile` and `docker/proxy/reviewer/Dockerfile` exist.
- Given a proxy Dockerfile, when built, then the resulting image runs the `@clawmasons/proxy` package configured for that role's apps.
- Given any proxy image, then the user inside the container is `mason`.

**REQ-013: `chapter docker-init` — Agent Dockerfiles**

For each agent × role combination, generate an agent Dockerfile.

Acceptance criteria:
- Given agent `note-taker` with role `writer`, when `docker-init` completes, then `docker/agent/note-taker/writer/Dockerfile` exists.
- Given an agent Dockerfile, when built, then the resulting image expects a mount at `/home/mason/workspace/project/.claude`.
- Given any agent image, then the user inside the container is `mason`.

**REQ-014: `chapter docker-init` — Role Dependency Resolution**

Agent Dockerfiles follow role dependencies to include all apps from the role and its tasks.

Acceptance criteria:
- Given a role `writer` that depends on task `take-notes` which requires app `filesystem`, when the agent Dockerfile is generated, then all three packages are available in the image.

**REQ-015: `chapter docker-init` — Local Build Only**

Docker-init only supports local builds for this PRD.

Acceptance criteria:
- Given `docker-init`, then all generated Dockerfiles reference local paths only (no registry pulls).

**REQ-016: `chapter run-init` — Create Project Config**

The `run-init` command creates a `.mason/` directory in the current project with `chapter.json`, `logs/`, and `workspace/`.

Acceptance criteria:
- Given a project directory, when `chapter run-init` is run, then `.mason/chapter.json`, `.mason/logs/`, and `.mason/workspace/` are created.
- Given `run-init` is run, then the user is prompted for the path to the chapter docker build directory.

**REQ-017: `chapter run-init` — chapter.json Format**

The generated `chapter.json` contains the chapter identifier, docker registries, and docker build path.

Acceptance criteria:
- Given `run-init` completes, then `.mason/chapter.json` contains `"chapter"`, `"docker-registries": ["local"]`, and `"docker-build"` fields.
- Given the `docker-build` path, then it is an absolute path to the chapter project's docker directory.

**REQ-018: `chapter run-init` — Idempotent**

Running `run-init` again does not destroy existing configuration.

Acceptance criteria:
- Given `run-init` has been run before, when run again, then existing `chapter.json` is not overwritten (or user is prompted to confirm).
- Given existing sessions in `.mason/sessions/`, when `run-init` is run, then sessions are preserved.

**REQ-019: `chapter run-agent` — Session ID Generation**

The command generates a short, unique session ID.

Acceptance criteria:
- Given `run-agent note-taker writer`, then a session directory is created at `.mason/sessions/<sessionid>/`.
- Given multiple invocations, then each generates a unique session ID.

**REQ-020: `chapter run-agent` — Docker Compose Generation**

The command generates a `docker-compose.yml` for the session, pointing at the correct Dockerfiles.

Acceptance criteria:
- Given `run-agent note-taker writer`, then `.mason/sessions/<sessionid>/docker/docker-compose.yml` is created.
- Given the compose file, then it references Dockerfiles from the `docker-build` path specified in `chapter.json`.

**REQ-021: `chapter run-agent` — Proxy Detached**

The proxy container starts in detached mode.

Acceptance criteria:
- Given `run-agent` is run, then the proxy container starts in the background.
- Given the proxy is running, then its logs are written to `.mason/logs/`.

**REQ-022: `chapter run-agent` — Agent Interactive**

The agent container runs with stdio connected for interactive use.

Acceptance criteria:
- Given `run-agent` is run, then the agent container's stdin/stdout/stderr are connected to the user's terminal.
- Given the agent exits, then the proxy container is torn down.

**REQ-023: `chapter run-agent` — Session Retained**

Session directories are retained after the agent exits for debugging purposes.

Acceptance criteria:
- Given an agent session has completed, then `.mason/sessions/<sessionid>/` still exists.
- Given the session directory, then it contains the docker-compose.yml and any generated logs.

**REQ-024: Docker Images — `mason` User**

All Docker images (proxy and agent) use the `mason` user.

Acceptance criteria:
- Given any generated Dockerfile, when inspected, then it sets `USER mason`.

**REQ-025: Docker Images — Proxy Per Role**

Every role gets its own proxy Docker image.

Acceptance criteria:
- Given N roles in the chapter, then N proxy Dockerfiles are generated.
- Given a proxy image for role `writer`, then it only exposes apps that the `writer` role has access to.

**REQ-026: Docker Images — Agent Per Agent × Role**

Every agent × role combination gets its own agent Docker image.

Acceptance criteria:
- Given M agents and N roles (where each agent has a subset of roles), then the correct number of agent Dockerfiles are generated (one per agent-role pair that exists in the config).

**REQ-027: Docker Images — Local Registry Only**

This PRD only supports local Docker registry.

Acceptance criteria:
- Given `chapter.json` with `"docker-registries": ["local"]`, then images are built and referenced locally.
- Private/remote registry support is explicitly out of scope.

---

## 11. Architecture

### 11.1 Package Dependency Graph (Monorepo)

```
@clawmasons/mason (CLI)
  └─ depends on: @clawmasons/shared

@clawmasons/proxy (Proxy Server)
  └─ depends on: @clawmasons/shared

@clawmasons/shared (Types & Schemas)
  └─ no internal dependencies
```

### 11.2 Agent Schema

```typescript
const agentChapterFieldSchema = z.object({
  type: z.literal("agent"),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  runtimes: z.array(z.string()).min(1),
  roles: z.array(z.string()).min(1),
  resources: z.array(resourceSchema).optional().default([]),
  proxy: proxySchema.optional(),
  llm: z.object({
    provider: z.string(),
    model: z.string(),
  }).optional(),
});
```

### 11.3 `docker-init` Flow

```
chapter docker-init
  │
  ├─1─ Read .mason/chapter.json → get chapter full name
  ├─2─ Create docker/ directory with package.json
  ├─3─ Add install-local script to root package.json
  ├─4─ Run install-local → docker/node_modules/ populated
  ├─5─ Scan docker/node_modules/@<chapter>/role-* → list roles
  ├─6─ For each role:
  │      └── Generate docker/proxy/<role>/Dockerfile
  ├─7─ Scan docker/node_modules/@<chapter>/agent-* → list agents
  ├─8─ For each agent × role:
  │      ├── Resolve role dependency tree (apps, tasks, skills)
  │      └── Generate docker/agent/<agent>/<role>/Dockerfile
  └─9─ Done — user can now build images with docker build
```

### 11.4 `run-agent` Flow

```
chapter run-agent <agent> <role> [<task>]
  │
  ├─1─ Read .mason/chapter.json → get docker-build path
  ├─2─ Generate session ID
  ├─3─ Create .mason/sessions/<sessionid>/docker/
  ├─4─ Generate docker-compose.yml
  │      ├── proxy service: references docker/proxy/<role>/Dockerfile
  │      └── agent service: references docker/agent/<agent>/<role>/Dockerfile
  ├─5─ docker compose up proxy -d (detached)
  ├─6─ docker compose run agent (interactive, stdio attached)
  ├─7─ On agent exit: docker compose down
  └─8─ Session directory retained for debugging
```

---

## 12. Files Affected (Implementation Reference)

### 12.1 New Files

| File | Description |
|------|-------------|
| `packages/cli/package.json` | CLI package config |
| `packages/proxy/package.json` | Proxy package config |
| `packages/shared/package.json` | Shared types package config |
| `packages/cli/src/commands/docker-init.ts` | `docker-init` command |
| `packages/cli/src/commands/run-init.ts` | `run-init` command |
| `packages/cli/src/commands/run-agent.ts` | `run-agent` command |

### 12.2 Moved Files

| From | To |
|------|-----|
| `src/proxy/server.ts` | `packages/proxy/src/server.ts` |
| `src/proxy/router.ts` | `packages/proxy/src/router.ts` |
| `src/proxy/upstream.ts` | `packages/proxy/src/upstream.ts` |
| `src/resolver/types.ts` | `packages/shared/src/types.ts` |
| `src/schemas/*` | `packages/shared/src/schemas/` |

### 12.3 Removed Files

| File | Reason |
|------|--------|
| `src/cli/commands/install.ts` | Replaced by docker-init workflow |
| `src/cli/commands/run.ts` | Replaced by run-agent |
| `src/cli/commands/stop.ts` | No longer needed |
| `src/cli/commands/enable.ts` | No member registry |
| `src/cli/commands/disable.ts` | No member registry |
| `src/schemas/member.ts` | Replaced by agent schema |
| `src/registry/members.ts` | No member registry |
| `src/registry/types.ts` | No member registry |
| `src/compose/docker-compose.ts` | Old install-time compose generation |
| `src/compose/env.ts` | Old install-time env generation |
| `src/compose/lock.ts` | Lock file concept removed |
| `src/compose/types.ts` | Lock file types removed |
| `src/compose/index.ts` | Barrel export for removed compose module |
| `src/generator/proxy-dockerfile.ts` | Reimplemented in docker-init (CHANGE 6) |
| `tests/cli/install.test.ts` | Command removed |
| `tests/cli/run.test.ts` | Command removed |
| `tests/cli/stop.test.ts` | Command removed |
| `tests/cli/enable.test.ts` | Command removed |
| `tests/cli/disable.test.ts` | Command removed |
| `tests/registry/members.test.ts` | Registry removed |
| `tests/compose/*.test.ts` | Compose module removed |
| `tests/generator/proxy-dockerfile.test.ts` | Generator removed |
| `tests/integration/install-flow.test.ts` | Command removed |

### 12.4 Refactored Files (Retained)

| File | Change |
|------|--------|
| `src/materializer/types.ts` | Remove docker methods from `RuntimeMaterializer`; remove `ComposeServiceDef` |
| `src/materializer/common.ts` | Add `PROVIDER_ENV_VARS` (moved from pi-coding-agent.ts); rename member→agent |
| `src/materializer/claude-code.ts` | Remove `generateDockerfile`, `generateComposeService`, `generateConfigJson`; rename member→agent |
| `src/materializer/pi-coding-agent.ts` | Remove `generateDockerfile`, `generateComposeService`; move `PROVIDER_ENV_VARS` out; rename member→agent |
| `src/materializer/index.ts` | Update exports |
| `src/cli/commands/docker-utils.ts` | Remove `resolveMemberDir`; keep general docker utilities |
| `tests/materializer/*.test.ts` | Remove docker method tests; keep workspace tests; rename member→agent |
| `tests/cli/docker-utils.test.ts` | Remove `resolveMemberDir` tests; keep general utility tests |

### 12.5 Modified Files

| File | Change |
|------|--------|
| `package.json` (root) | Add `workspaces`, shared dev deps, build orchestration |
| `src/cli/commands/index.ts` | Remove old commands, add new commands |
| `src/index.ts` | Remove compose exports, update materializer exports |

---

## 13. Open Questions

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| Q1 | Should `docker-init` generate a `.dockerignore` file? | Engineering | No |
| Q2 | What base Docker image should proxy and agent images use? (e.g., `node:22-slim`) | Engineering | No |
| Q3 | Should `run-agent` support a `--no-proxy` flag for development/debugging? | Engineering | No |
| Q4 | Should session cleanup be manual or should there be a `chapter sessions clean` command? | Product | No |
| Q5 | Should the `install-local` script handle version conflicts in tgz files? | Engineering | No |
| Q6 | How should `run-agent` handle the case where Docker images haven't been built yet? | Engineering | Yes |

---

## 14. Out of Scope

- Private/remote Docker registry support
- Multi-machine deployment
- Human member packages or PII in packages
- Agent-to-agent communication
- Role-based task delegation between agents
- Activity logging and audit trails
- Authentication and authorization providers
- `chapter migrate` command for upgrading from member-based chapters

---

## Appendix A: chapter Field JSON Schema Reference (Updated)

| Property | app | skill | task | role | agent |
|----------|-----|-------|------|------|-------|
| `type` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `name` | — | — | — | — | ✓ |
| `slug` | — | — | — | — | ✓ |
| `description` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `transport` | ✓ | — | — | — | — |
| `command` | ✓ | — | — | — | — |
| `args` | ✓ | — | — | — | — |
| `url` | ✓ | — | — | — | — |
| `env` | ✓ | — | — | — | — |
| `tools` | ✓ | — | — | — | — |
| `capabilities` | ✓ | — | — | — | — |
| `artifacts` | — | ✓ | — | — | — |
| `taskType` | — | — | ✓ | — | — |
| `prompt` | — | — | ✓ | — | — |
| `requires` | — | — | ✓ | — | — |
| `timeout` | — | — | ✓ | — | — |
| `approval` | — | — | ✓ | — | — |
| `tasks` | — | — | — | ✓ | — |
| `permissions` | — | — | — | ✓ | — |
| `constraints` | — | — | — | ✓ | — |
| `runtimes` | — | — | — | — | ✓ |
| `roles` | — | — | — | — | ✓ |
| `resources` | — | — | — | — | ✓ |
| `proxy` | — | — | — | — | ✓ |
| `llm` | — | — | — | — | ✓ |
