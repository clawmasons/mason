# ACP Session CWD & Host-Wide Runtime — Product Requirements Document

**Version:** 0.1.0 - Draft
**Date:** March 2026
**Author:** ClawForge, Inc.

---

## 1. Problem Statement

Chapter's current runtime model requires per-project setup: `run-init` creates a `.clawmasons/` directory in each project, `docker-init` generates Dockerfiles, and `run-agent`/`acp-proxy` launch containers tied to that specific project directory. This creates several friction points:

- **Per-project overhead:** Every project that wants to use chapter agents must run `run-init` to create a `.clawmasons/chapter.json` config pointing at the docker build directory. Operators manage N identical setups.
- **No host-wide proxy:** Each `acp-proxy` invocation spins up a fresh Docker session. There's no persistent, shared proxy that serves multiple agent sessions across projects — one proxy per role should suffice for all projects using that role.
- **ACP session lacks CWD awareness:** When an ACP client sends `session/new`, the proxy starts containers with whatever directory was current at command launch. It doesn't read the `cwd` from the session request, so the agent always works in the same directory regardless of what the editor is working on.
- **Multi-step setup ceremony:** Getting from `chapter init --template x` to a running agent requires: `init` -> `pack` -> `docker-init` -> `run-init` (in another directory) -> `run-agent`. This should be `init` -> `build` -> go.
- **CLI naming confusion:** `acp-proxy` doesn't describe what it does (run an ACP agent). `run-init` is vague about what it initializes.

---

## 2. Goals

### User Goals
- **Single setup, run anywhere:** `chapter init-role` sets up a host-wide runtime for a chapter role. Any project directory can then use that role's agents without per-project initialization.
- **CWD-aware ACP sessions:** When an ACP client sends `session/new` with a `cwd`, the agent container mounts and operates in that directory, enabling multi-project workflows from a single proxy.
- **Two-command onboarding:** `chapter init --template x` followed by `chapter build` gets everything ready to run.
- **Clearer CLI naming:** Commands describe their purpose — `init-role`, `run-acp-agent`, `build`.

### Business Goals
- Reduce time-to-first-agent from ~10 manual steps to 2 commands.
- Enable IDE integrations (Zed, JetBrains) to work across projects without per-project chapter setup.
- Simplify operator workflow for multi-project deployments.

---

## 3. Non-Goals

- **Registry-based image distribution:** v1 continues to use local Docker builds. Remote registries are future work.
- **Multi-role single proxy:** Each `init-role` sets up one role. Running multiple roles requires multiple invocations.
- **Hot-reloading role configuration:** Changing the chapter workspace requires re-running `chapter build` and `init-role`.
- **Windows support:** `CLAWMASONS_HOME` defaults to `~/.clawmasons` (POSIX path).

---

## 4. Core Concepts

### 4.1 CLAWMASONS_HOME

A host-wide directory for chapter runtime state. Read from `CLAWMASONS_HOME` environment variable; defaults to `~/.clawmasons`.

```
CLAWMASONS_HOME/
  chapters.json                              # Registry of initialized chapter/roles
  .gitignore                                 # Ignores logs/ subdirectories
  <lodge>/
    <chapter>/
      <role>/
        docker-compose.yaml                  # Services for all agents in this role
        docker-compose.yaml.bak              # Backup from previous init-role
        logs/
          mcp-proxy.log
          credential-service.log
```

### 4.2 chapters.json

Maintains a registry of all initialized chapter/role combinations on this host.

```json
{
  "chapters": [
    {
      "lodge": "acme",
      "chapter": "platform",
      "role": "writer",
      "dockerBuild": "/Users/dev/acme-platform/docker",
      "roleDir": "~/.clawmasons/acme/platform/writer",
      "agents": ["note-taker", "reviewer"],
      "createdAt": "2026-03-10T12:00:00Z",
      "updatedAt": "2026-03-10T12:00:00Z"
    },
    {
      "lodge": "acme",
      "chapter": "platform",
      "role": "editor",
      "dockerBuild": "/Users/dev/acme-platform/docker",
      "roleDir": "/Users/dev/custom-roles/acme-editor",
      "targetDir": "/Users/dev/custom-roles/acme-editor",
      "agents": ["code-reviewer"],
      "createdAt": "2026-03-10T12:00:00Z",
      "updatedAt": "2026-03-10T12:00:00Z"
    }
  ]
}
```

When `targetDir` is set (via `--target-dir`), `roleDir` points to the user-specified directory instead of the default `CLAWMASONS_HOME/<lodge>/<chapter>/<role>` path.

### 4.3 Per-Project .clawmasons

When `run-agent` or `run-acp-agent` operates in a project directory, a `.clawmasons/` directory is created in that project for session-specific state (session logs, workspace).

```
<project-dir>/
  .clawmasons/
    sessions/
      <sessionId>/
        logs/
    logs/
```

Every time `.clawmasons/` is created in a project directory, the system checks if the parent directory has a `.gitignore`. If it does and `.clawmasons` is not already ignored, a line is appended.

### 4.4 ACP Client Configuration Example

After running `chapter build` and `chapter init-role`, an ACP client (e.g., Zed, acpx) can be configured:

```json
{
  "mcpServers": {
    "chapter": {
      "command": "chapter",
      "args": ["run-acp-agent", "--role", "writer"],
      "env": {
        "CLAWMASONS_HOME": "~/.clawmasons"
      }
    }
  }
}
```

For an ACP agent configured as a remote endpoint:

```json
{
  "acpAgents": {
    "note-taker": {
      "url": "http://localhost:3001",
      "transport": "streamable-http"
    }
  }
}
```

---

## 5. User Stories

**US-1:** As a developer, I want to run `chapter build` after `chapter init` so that my chapter workspace is fully ready to run agents in two commands.

**US-2:** As an operator, I want `chapter init-role` to create a host-wide runtime configuration for a role, so that any project can use that role's agents without per-project setup.

**US-3:** As a developer, I want `init-role` to support `--target-dir` so I can check the role runtime configuration into version control for customization.

**US-4:** As an operator using an ACP client, I want the agent to receive the `cwd` from `session/new` and mount that directory, so the agent works in whatever project my editor is focused on.

**US-5:** As a developer, I want `run-agent` and `run-acp-agent` to automatically run `init-role` if the chapter/role hasn't been initialized yet, so I don't need to remember the setup step.

**US-6:** As a developer, I want `.clawmasons` to be automatically added to my project's `.gitignore` when session state is created there, so I don't accidentally commit runtime artifacts.

**US-7:** As an operator, I want re-running `init-role` to update the docker-compose.yaml with a backup of the previous version, so I can safely update configurations.

**US-8:** As a developer, I want `chapter build` to display clear instructions for both interactive agent usage and ACP client configuration after completing successfully.

---

## 6. Requirements

### P0 -- Must-Have

**REQ-001: `chapter init-role` Command (renamed from `run-init`)**

Replaces `run-init`. Initializes a host-wide runtime directory for a chapter role at `CLAWMASONS_HOME/<lodge>/<chapter>/<role>/`.

CLI signature:
```
chapter init-role --role <name> [--agent <name>] [--target-dir <path>]
```

Options:
- `--role <name>` (required): Role to initialize
- `--agent <name>` (optional): Agent package name (auto-detect if only one)
- `--target-dir <path>` (optional): Override the default role directory location

Behavior:
1. Read `CLAWMASONS_HOME` env var (default: `~/.clawmasons`)
2. Discover packages and resolve the agent/role from the current chapter workspace
3. Determine role directory:
   - Default: `CLAWMASONS_HOME/<lodge>/<chapter>/<role>/`
   - With `--target-dir`: use the specified directory
4. Create the role directory structure:
   - `docker-compose.yaml` — services for proxy, credential-service, and all agents for this role
   - `logs/` — log output directory
5. If re-running and `docker-compose.yaml` already exists, create a `.bak` backup before overwriting
6. Update `CLAWMASONS_HOME/chapters.json` with the role entry
7. If `CLAWMASONS_HOME/.gitignore` doesn't exist, create one ignoring `*/*/logs/`

The docker-compose.yaml should define services for all agents specified by the role, similar to the current `run-agent` and `acp-proxy` compose generation but configured as a persistent, reusable setup.

Acceptance criteria:
- Given a chapter workspace with agent `note-taker` and role `writer`, when `chapter init-role --role writer` is run, then `~/.clawmasons/acme/platform/writer/docker-compose.yaml` is created.
- Given `--target-dir /custom/path`, then the role directory is created at `/custom/path` and `chapters.json` records the override.
- Given the role was previously initialized, when `init-role` is run again, then the old `docker-compose.yaml` is backed up.
- Given `CLAWMASONS_HOME` is set to `/opt/clawmasons`, then all paths use that base instead of `~/.clawmasons`.

---

**REQ-002: `CLAWMASONS_HOME` Environment Variable**

All runtime commands (`init-role`, `run-agent`, `run-acp-agent`) read `CLAWMASONS_HOME` to locate the host-wide runtime directory.

Behavior:
- If `CLAWMASONS_HOME` is set, use its value as the base directory
- If not set, default to `~/.clawmasons` (resolved via `os.homedir()`)
- All path resolution uses this base consistently

Acceptance criteria:
- Given `CLAWMASONS_HOME=/opt/clawmasons`, when any runtime command runs, then it uses `/opt/clawmasons` as the base.
- Given `CLAWMASONS_HOME` is unset, then `~/.clawmasons` is used.

---

**REQ-003: `run-agent` Changes**

`run-agent` is updated to:
1. Support `CLAWMASONS_HOME` for locating the role directory
2. Create per-session state in the CWD's `.clawmasons/` directory (sessions, logs)
3. Auto-invoke `init-role` if the chapter/role is not initialized (instead of erroring)
4. Check `chapters.json` for role directory overrides (from `--target-dir`)

Behavior:
- On invocation, check `CLAWMASONS_HOME/chapters.json` for the matching chapter/role entry
- If not found, automatically run `init-role` logic
- If found but `roleDir` uses `--target-dir`, use that path
- Create `.clawmasons/` in the current project directory for session state
- Check parent `.gitignore` and append `.clawmasons` if not present
- Mount the CWD as `/workspace` in the agent container (unchanged behavior)

Acceptance criteria:
- Given role `writer` is initialized at `~/.clawmasons/acme/platform/writer/`, when `run-agent note-taker writer` is run from `/projects/myapp`, then session state is created at `/projects/myapp/.clawmasons/`.
- Given role `writer` is NOT initialized, when `run-agent note-taker writer` is run, then `init-role` runs automatically before proceeding.
- Given `chapters.json` has `targetDir` set for the role, then that directory is used for the docker-compose and Dockerfiles.
- Given `/projects/myapp/.gitignore` exists and doesn't contain `.clawmasons`, then `.clawmasons` is appended to it.

---

**REQ-004: Rename `acp-proxy` to `run-acp-agent`**

The `acp-proxy` CLI command is renamed to `run-acp-agent` to better describe its function.

CLI signature:
```
chapter run-acp-agent --role <name> [--agent <name>] [--port <number>] [--proxy-port <number>]
```

All options remain the same as the current `acp-proxy`. The command also gains `CLAWMASONS_HOME` support and auto-init behavior (same as REQ-003).

Acceptance criteria:
- Given `chapter run-acp-agent --role writer`, the behavior is identical to the current `chapter acp-proxy --role writer`.
- The old `acp-proxy` command registration is fully removed (not deprecated).

---

**REQ-005: ACP Session CWD Support**

When `run-acp-agent` receives a `session/new` request from an ACP client, it reads the `cwd` field from the request and:

1. Initializes `.clawmasons/` in that `cwd` directory for session logs
2. Checks the parent `.gitignore` and appends `.clawmasons` if needed
3. Launches the agent container with `cwd` mounted as `/workspace`

This enables a single `run-acp-agent` process to serve multiple projects — each `session/new` can specify a different working directory.

Current behavior: The ACP proxy mounts the chapter workspace directory (where the command was launched) as `/workspace` and starts the Docker session immediately at startup.

New behavior: The ACP bridge intercepts `session/new`, extracts `cwd`, and launches a new `docker run` of the agent container with `cwd` mounted as `/workspace`. The proxy and credential-service containers remain running (started at `run-acp-agent` launch time) — only the agent container is created per-session. Each `session/new` results in a new agent container with different mounts. The proxy always runs with the chapter/role defaults and does not need modification per session.

Acceptance criteria:
- Given `run-acp-agent` is running, when a `session/new` arrives with `cwd: "/projects/myapp"`, then the agent container mounts `/projects/myapp` as `/workspace`.
- Given `session/new` with `cwd: "/projects/myapp"`, then `.clawmasons/` is created at `/projects/myapp/.clawmasons/` with session logs.
- Given `/projects/myapp/.gitignore` exists without `.clawmasons`, then it is appended.
- Given `session/new` without a `cwd` field, then the current working directory of the `run-acp-agent` process is used as fallback.

---

**REQ-006: `chapter build` Command (Enhanced)**

The existing `build` command (which generates `chapter.lock.json`) is enhanced to also perform all Docker preparation steps. It becomes the single command needed after `chapter init`.

CLI signature:
```
chapter build [<agent>]
```

Behavior:
1. Run existing build logic: discover packages, resolve agent graph, validate, generate `chapter.lock.json`
2. Run `pack` logic: build and pack all workspace packages into `dist/*.tgz`
3. Run `docker-init` logic: copy framework packages, extract tgz, generate Dockerfiles, materialize workspaces
4. Display completion instructions:
   - How to run an agent interactively: `chapter run-agent <agent> <role>`
   - How to configure an ACP client with `run-acp-agent`
   - Example ACP client configuration JSON

If `<agent>` is not provided, auto-detect when only one agent exists. When multiple agents exist, build all of them.

Acceptance criteria:
- Given a chapter workspace after `chapter init --template note-taker`, when `chapter build` is run, then `chapter.lock.json`, `dist/*.tgz`, and `docker/` directory with Dockerfiles are all created.
- Given `chapter build` completes, then the output includes instructions for `run-agent` and ACP client configuration.
- Given multiple agents exist, when `chapter build` is run without an agent argument, then it builds all agents.

---

**REQ-007: Remove `docker-init` and `docker-utils` as CLI Entry Points**

`docker-init` and `docker-utils.ts` are removed as top-level CLI commands. Their functionality is preserved internally and invoked by `build`.

Behavior:
- `chapter docker-init` command registration is fully removed (not deprecated)
- `chapter run-init` command registration is fully removed (not deprecated)
- The `runDockerInit()` function remains available as an internal module
- `docker-utils.ts` utility functions (`checkDockerCompose`, `validateEnvFile`, `execDockerCompose`) remain available as internal utilities
- `chapter build` calls the docker-init logic as part of its pipeline

Acceptance criteria:
- Given `chapter docker-init` is invoked, then it is an unknown command error.
- Given `chapter run-init` is invoked, then it is an unknown command error.
- Given `chapter build` is invoked, then docker-init logic runs as part of the build pipeline.
- Given code imports from `docker-utils.ts`, it continues to work (internal API unchanged).

---

**REQ-008: E2E Test Updates**

E2E tests are updated to use `chapter build` instead of the separate `pack` -> `docker-init` -> `run-init` flow.

Acceptance criteria:
- Given the E2E test suite, when `chapter build` is used instead of separate commands, then all existing test assertions continue to pass.
- Given the `docker-init-full.test.ts` test, it is updated to use `chapter build` as the setup step.

---

### P1 -- Nice-to-Have

**REQ-009: `init-role` Docker Compose for Multi-Agent Roles**

The `docker-compose.yaml` generated by `init-role` should include service definitions for ALL agents that use the given role, not just a single agent.

```yaml
# Generated by chapter init-role
services:
  proxy-writer:
    build:
      context: "/path/to/docker"
      dockerfile: "proxy/writer/Dockerfile"
    volumes:
      - "${PROJECT_DIR}:/workspace"
      - "./logs:/logs"
    environment:
      - CHAPTER_PROXY_TOKEN=${CHAPTER_PROXY_TOKEN}
      - CREDENTIAL_PROXY_TOKEN=${CREDENTIAL_PROXY_TOKEN}
    restart: "no"

  credential-service:
    build:
      context: "/path/to/docker"
      dockerfile: "credential-service/Dockerfile"
    environment:
      - CREDENTIAL_PROXY_TOKEN=${CREDENTIAL_PROXY_TOKEN}
    depends_on:
      - proxy-writer
    restart: "no"

  agent-note-taker-writer:
    build:
      context: "/path/to/docker"
      dockerfile: "agent/note-taker/writer/Dockerfile"
    volumes:
      - "${PROJECT_DIR}:/workspace"
    depends_on:
      - credential-service
    environment:
      - MCP_PROXY_TOKEN=${CHAPTER_PROXY_TOKEN}
    init: true
    restart: "no"

  agent-reviewer-writer:
    build:
      context: "/path/to/docker"
      dockerfile: "agent/reviewer/writer/Dockerfile"
    volumes:
      - "${PROJECT_DIR}:/workspace"
    depends_on:
      - credential-service
    environment:
      - MCP_PROXY_TOKEN=${CHAPTER_PROXY_TOKEN}
    init: true
    restart: "no"
```

Acceptance criteria:
- Given a role `writer` used by agents `note-taker` and `reviewer`, then `docker-compose.yaml` contains service definitions for both agents plus shared proxy and credential-service.

---

**REQ-010: Help Instructions in `run-acp-agent`**

The `run-acp-agent` help text should clearly indicate:
- It will create `.clawmasons/` in the session's CWD
- It will append to `.gitignore` if present
- How to configure `CLAWMASONS_HOME`
- Example ACP client configuration

---

## 7. Sequence Diagrams

### 7.1 `chapter build` Flow

```
Developer                     chapter CLI
    │                              │
    │  chapter build               │
    │─────────────────────────────►│
    │                              │
    │                   ┌──────────┴──────────┐
    │                   │ 1. Discover packages │
    │                   │ 2. Resolve agent(s)  │
    │                   │ 3. Validate graph    │
    │                   │ 4. Write lock file   │
    │                   └──────────┬──────────┘
    │                              │
    │                   ┌──────────┴──────────┐
    │                   │ 5. Pack workspace    │
    │                   │    packages → .tgz   │
    │                   └──────────┬──────────┘
    │                              │
    │                   ┌──────────┴──────────┐
    │                   │ 6. Docker-init       │
    │                   │  - Copy framework    │
    │                   │    packages          │
    │                   │  - Extract tgz       │
    │                   │  - Generate          │
    │                   │    Dockerfiles       │
    │                   │  - Materialize       │
    │                   │    workspaces        │
    │                   └──────────┬──────────┘
    │                              │
    │  Build complete!             │
    │  Instructions:               │
    │  - chapter run-agent ...     │
    │  - ACP client config ...     │
    │◄─────────────────────────────│
```

### 7.2 `chapter init-role` Flow

```
Operator                   chapter CLI              CLAWMASONS_HOME
    │                           │                        │
    │  init-role --role writer  │                        │
    │──────────────────────────►│                        │
    │                           │                        │
    │              ┌────────────┴────────────┐           │
    │              │ 1. Read CLAWMASONS_HOME │           │
    │              │ 2. Discover packages    │           │
    │              │ 3. Resolve agent/role   │           │
    │              └────────────┬────────────┘           │
    │                           │                        │
    │                           │  Create role dir       │
    │                           │───────────────────────►│
    │                           │                        │
    │                           │  Read chapters.json    │
    │                           │◄───────────────────────│
    │                           │                        │
    │              ┌────────────┴────────────┐           │
    │              │ 4. If docker-compose    │           │
    │              │    exists → backup .bak │           │
    │              │ 5. Generate new         │           │
    │              │    docker-compose.yaml  │           │
    │              │    (all agents in role) │           │
    │              └────────────┬────────────┘           │
    │                           │                        │
    │                           │  Update chapters.json  │
    │                           │───────────────────────►│
    │                           │                        │
    │                           │  Ensure .gitignore     │
    │                           │───────────────────────►│
    │                           │                        │
    │  init-role complete!      │                        │
    │◄──────────────────────────│                        │
```

### 7.3 `run-agent` with Auto-Init Flow

```
Developer                  chapter CLI              CLAWMASONS_HOME       Project Dir
    │                           │                        │                     │
    │  run-agent note-taker     │                        │                     │
    │     writer                │                        │                     │
    │──────────────────────────►│                        │                     │
    │                           │                        │                     │
    │                           │  Read chapters.json    │                     │
    │                           │───────────────────────►│                     │
    │                           │                        │                     │
    │              ┌────────────┴──────────────┐         │                     │
    │              │ Role found?               │         │                     │
    │              │  NO → run init-role logic  │         │                     │
    │              │  YES → use roleDir        │         │                     │
    │              └────────────┬──────────────┘         │                     │
    │                           │                        │                     │
    │                           │  Setup .clawmasons/    │                     │
    │                           │────────────────────────┼────────────────────►│
    │                           │                        │                     │
    │                           │  Check .gitignore      │                     │
    │                           │────────────────────────┼────────────────────►│
    │                           │                        │                     │
    │              ┌────────────┴──────────────┐         │                     │
    │              │ Generate session compose  │         │                     │
    │              │ Start proxy (detached)    │         │                     │
    │              │ Start cred-service        │         │                     │
    │              │ Start agent (interactive) │         │                     │
    │              └────────────┬──────────────┘         │                     │
    │                           │                        │                     │
    │  Agent interactive        │                        │                     │
    │  session begins           │                        │                     │
    │◄──────────────────────────│                        │                     │
```

### 7.4 ACP Session with CWD — `run-acp-agent` Flow

```
ACP Client         run-acp-agent (host)      Proxy + CredSvc      Agent Container    Project Dir
(Zed/JetBrains)         │                    (long-lived)          (per-session)          │
    │                    │                         │                    │                   │
    │              ┌─────┴──────────────┐          │                    │                   │
    │              │ On startup:        │          │                    │                   │
    │              │ 1. Auto init-role  │          │                    │                   │
    │              │ 2. Start proxy +   │          │                    │                   │
    │              │    credential-svc  │          │                    │                   │
    │              │    (detached)      │          │                    │                   │
    │              └─────┬──────────────┘          │                    │                   │
    │                    │  docker compose up -d   │                    │                   │
    │                    │  proxy + cred-service   │                    │                   │
    │                    │───────────────────────►│                    │                   │
    │                    │                         │                    │                   │
    │  Ready on port     │                         │                    │                   │
    │                    │                         │                    │                   │
    │  session/new       │                         │                    │                   │
    │  { cwd: "/proj" }  │                         │                    │                   │
    │───────────────────►│                         │                    │                   │
    │                    │                         │                    │                   │
    │       ┌────────────┴──────────────┐          │                    │                   │
    │       │ 1. Extract cwd from       │          │                    │                   │
    │       │    session/new body       │          │                    │                   │
    │       └────────────┬──────────────┘          │                    │                   │
    │                    │                         │                    │                   │
    │                    │  Setup .clawmasons/     │                    │                   │
    │                    │─────────────────────────┼────────────────────┼──────────────────►│
    │                    │                         │                    │                   │
    │                    │  Check .gitignore       │                    │                   │
    │                    │─────────────────────────┼────────────────────┼──────────────────►│
    │                    │                         │                    │                   │
    │                    │  docker run agent       │                    │                   │
    │                    │  (mount cwd:/workspace) │                    │                   │
    │                    │─────────────────────────┼───────────────────►│                   │
    │                    │                         │                    │                   │
    │                    │  Connect bridge to agent│                    │                   │
    │                    │─────────────────────────┼───────────────────►│                   │
    │                    │                         │                    │                   │
    │  session/new       │                         │                    │                   │
    │  response          │                         │                    │                   │
    │◄───────────────────│                         │                    │                   │
    │                    │                         │                    │                   │
    │  Tool calls        │    agent → proxy        │                    │                   │
    │───────────────────►│─────────────────────────┼───────────────────►│                   │
    │                    │                         │◄───────────────────│                   │
    │◄───────────────────│◄────────────────────────┼────────────────────│                   │
    │                    │                         │                    │                   │
    │  Disconnect        │                         │                    │                   │
    │───────────────────►│                         │                    │                   │
    │                    │  docker stop agent      │                    │                   │
    │                    │─────────────────────────┼───────────────────►│ (removed)         │
    │                    │                         │                    │                   │
    │                    │  (proxy + cred-svc      │                    │                   │
    │                    │   remain running for    │                    │                   │
    │                    │   next session/new)     │                    │                   │
```

### 7.5 `chapter build` + `init-role` + ACP Client — Full Lifecycle

```
Developer               chapter CLI           CLAWMASONS_HOME       ACP Client
    │                        │                      │                    │
    │  chapter init          │                      │                    │
    │  --template note-taker │                      │                    │
    │───────────────────────►│                      │                    │
    │  Workspace created     │                      │                    │
    │◄───────────────────────│                      │                    │
    │                        │                      │                    │
    │  chapter build         │                      │                    │
    │───────────────────────►│                      │                    │
    │  Lock + pack +         │                      │                    │
    │  docker-init done      │                      │                    │
    │                        │                      │                    │
    │  Output:               │                      │                    │
    │  "Run interactively:"  │                      │                    │
    │  chapter run-agent     │                      │                    │
    │    note-taker writer   │                      │                    │
    │                        │                      │                    │
    │  "Configure ACP:"      │                      │                    │
    │  chapter run-acp-agent │                      │                    │
    │    --role writer       │                      │                    │
    │◄───────────────────────│                      │                    │
    │                        │                      │                    │
    │  chapter run-acp-agent │                      │                    │
    │  --role writer         │                      │                    │
    │───────────────────────►│                      │                    │
    │                        │                      │                    │
    │         ┌──────────────┴──────────┐           │                    │
    │         │ Auto init-role          │           │                    │
    │         │ (role not in            │           │                    │
    │         │  chapters.json yet)     │           │                    │
    │         └──────────────┬──────────┘           │                    │
    │                        │  Create role dir     │                    │
    │                        │─────────────────────►│                    │
    │                        │  Update chapters.json│                    │
    │                        │─────────────────────►│                    │
    │                        │                      │                    │
    │  Ready on port 3001    │                      │                    │
    │◄───────────────────────│                      │                    │
    │                        │                      │                    │
    │                        │  session/new         │                    │
    │                        │  { cwd: "/proj" }    │◄───────────────────│
    │                        │                      │                    │
    │                        │  Start containers    │                    │
    │                        │  (mount /proj)       │                    │
    │                        │                      │                    │
    │                        │  Bridge connected    │                    │
    │                        │─────────────────────►│───────────────────►│
    │                        │                      │                    │
    │                        │  Agent active        │                    │
    │                        │                      │     Tool calls     │
    │                        │◄─────────────────────┼────────────────────│
    │                        │─────────────────────►│───────────────────►│
```

---

## 8. Use Cases

### UC-1: New Chapter Setup — Two-Command Onboarding

**Actor:** Developer new to chapter

**Precondition:** Node.js and Docker installed

**Flow:**
1. Developer runs `chapter init --name acme.platform --template note-taker`
2. Workspace is scaffolded with template packages
3. Developer runs `chapter build`
4. Build discovers packages, validates, packs, generates Docker artifacts
5. Output shows instructions for running agents and configuring ACP
6. Developer configures their editor's ACP client using the displayed config
7. First `session/new` triggers auto-`init-role` and starts the agent

**Postcondition:** Agent is running in a Docker container, governed by chapter

### UC-2: Multi-Project ACP Usage

**Actor:** Developer working on multiple projects with the same chapter

**Precondition:** `chapter build` completed, `run-acp-agent` running

**Flow:**
1. Developer has `run-acp-agent --role writer` running (started from chapter workspace)
2. In Zed, developer opens `/projects/frontend` — Zed sends `session/new` with `cwd: "/projects/frontend"`
3. `run-acp-agent` creates `/projects/frontend/.clawmasons/` for session state
4. Agent container starts with `/projects/frontend` mounted as `/workspace`
5. Developer switches to `/projects/backend` in Zed — previous session tears down
6. New `session/new` with `cwd: "/projects/backend"` triggers new Docker session
7. Agent now works in `/projects/backend`

**Postcondition:** Each project has its own session logs in `.clawmasons/`, agent always works in the editor's current project

### UC-3: Custom Role Directory for Version Control

**Actor:** Team lead setting up a shared chapter configuration

**Precondition:** Chapter workspace exists

**Flow:**
1. Team lead runs `chapter build` in the chapter workspace
2. Team lead runs `chapter init-role --role writer --target-dir /repos/acme-infra/chapter-roles/writer`
3. Role runtime files are created at the custom path
4. `chapters.json` records the `targetDir` override
5. Team lead commits the role directory to the `acme-infra` repo
6. Other team members clone `acme-infra` and the role directory is already set up
7. When `run-agent` or `run-acp-agent` is invoked, `chapters.json` directs to the custom path

**Postcondition:** Role configuration is version-controlled and shared across team

### UC-4: Auto-Init on First Run

**Actor:** Developer who ran `chapter build` but forgot `init-role`

**Precondition:** `chapter build` completed, `init-role` not run

**Flow:**
1. Developer runs `chapter run-agent note-taker writer` from `/projects/myapp`
2. `run-agent` checks `chapters.json` — role `writer` not found
3. `run-agent` automatically invokes `init-role` logic:
   - Creates `~/.clawmasons/acme/platform/writer/`
   - Generates `docker-compose.yaml`
   - Updates `chapters.json`
4. `run-agent` then proceeds normally:
   - Creates `/projects/myapp/.clawmasons/` for session state
   - Appends `.clawmasons` to `/projects/myapp/.gitignore`
   - Starts Docker session

**Postcondition:** Agent is running, no manual `init-role` step needed

### UC-5: Re-Initialize Role After Chapter Changes

**Actor:** Developer who modified chapter packages

**Precondition:** Role was previously initialized

**Flow:**
1. Developer adds a new task to the `writer` role
2. Developer runs `chapter build` to rebuild Docker artifacts
3. Developer runs `chapter init-role --role writer`
4. `init-role` detects existing `docker-compose.yaml`, creates `.bak` backup
5. New `docker-compose.yaml` is generated with updated configuration
6. Next `run-agent` or `run-acp-agent` session uses the updated compose

**Postcondition:** Role is updated, previous config is preserved as backup

### UC-6: Interactive Agent in Project Directory

**Actor:** Developer running an agent interactively

**Precondition:** `chapter build` completed

**Flow:**
1. Developer `cd /projects/myapp`
2. Developer runs `chapter run-agent note-taker writer`
3. `run-agent` auto-inits if needed (UC-4)
4. Creates `/projects/myapp/.clawmasons/sessions/<id>/`
5. Checks `/projects/myapp/.gitignore` — appends `.clawmasons` if missing
6. Starts Docker session mounting `/projects/myapp` as `/workspace`
7. Agent runs interactively in terminal
8. On exit, containers torn down, session logs retained

**Postcondition:** Session logs available at `/projects/myapp/.clawmasons/sessions/<id>/`

---

## 9. Open Questions

| # | Question | Owner | Blocking? | Resolution |
|---|----------|-------|-----------|------------|
| Q1 | Should `chapter build` auto-detect the agent or require it as an argument? | Product | No | **Resolved:** Auto-detect when single agent, build all when multiple |
| Q2 | How should `run-acp-agent` parse `session/new` to extract `cwd`? | Engineering | No | **Resolved:** Bridge intercepts and parses `session/new` body. Each session/new triggers a new `docker run` of the agent container with the cwd mounted. Proxy and credential-service remain running — they don't change per session. |
| Q3 | Should the `docker-compose.yaml` generated by `init-role` use environment variable substitution (e.g., `${PROJECT_DIR}`) or be regenerated per session? | Engineering | No | Recommend env var substitution for proxy/cred-service; agent containers are launched per-session via `docker run` |
| Q4 | When `run-acp-agent` creates `.clawmasons/` in a new CWD, should it also verify the CWD is a valid project directory? | Product | No | Trust the ACP client |
| Q5 | Should `chapter build` also run `init-role` automatically, or just display instructions? | Product | No | Keep build focused on artifact generation, display instructions |
| Q6 | When removing CLI commands, should we show migration messages or fully remove? | Product | No | **Resolved:** Fully remove — no deprecation messages |

---

## 10. CLI Command Summary

### Commands Being Added/Changed

| Command | Status | Description |
|---------|--------|-------------|
| `chapter init-role` | **New** (replaces `run-init`) | Initialize host-wide runtime for a chapter role |
| `chapter run-acp-agent` | **Renamed** (from `acp-proxy`) | Start ACP-compliant agent endpoint |
| `chapter build` | **Enhanced** | Now includes pack + docker-init steps |

### Commands Being Removed (as CLI Entry Points)

| Command | Status | Replacement |
|---------|--------|-------------|
| `chapter run-init` | **Removed** | `chapter init-role` |
| `chapter acp-proxy` | **Removed** | `chapter run-acp-agent` |
| `chapter docker-init` | **Removed** | `chapter build` (internal) |

### Commands Unchanged

| Command | Description |
|---------|-------------|
| `chapter init` | Initialize a new chapter workspace |
| `chapter run-agent` | Run agent interactively (gains auto-init + CLAWMASONS_HOME) |
| `chapter list` | List discovered packages |
| `chapter validate` | Validate agent dependency graph |
| `chapter permissions` | Display permission matrix |
| `chapter pack` | Build workspace packages (also called by `build`) |
| `chapter add` | Add a chapter package dependency |
| `chapter remove` | Remove a chapter package dependency |
| `chapter proxy` | Start MCP proxy (dev mode) |
