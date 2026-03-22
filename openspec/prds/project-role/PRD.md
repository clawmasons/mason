# Project Role — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** ClawForge, Inc.

---

## 1. Problem Statement

Today, running `mason claude` (or any agent type) without a `--role` flag produces an error requiring the user to define a role first. This forces users to create a `ROLE.md` before they can run any agent — even when the project already has a fully configured agent directory (`.claude/`, `.codex/`, etc.) with commands, skills, and MCP servers ready to use.

Specific friction points:

- **Mandatory role definition:** A user with a working `.claude/` setup (commands, skills, MCP servers in `settings.json`) cannot run `mason claude` without first authoring a `ROLE.md` that redeclares what already exists in the agent directory.
- **No zero-config path:** New users must understand the role system before they can run their first containerized agent. There is no "just works" mode that infers configuration from existing project files.
- **Source inflexibility:** The `--source` flag exists in ROLE.md's `sources` field, but there is no CLI-level override. A user cannot say "run this role but scan `.codex/` instead of `.claude/`" without editing the ROLE.md.
- **No implied agent aliases:** If a user types `mason claude`, the CLI checks aliases and known commands but does not fall through to checking if `claude` is a registered agent type. This misses an obvious shorthand.
- **No Docker pre-flight check:** The CLI attempts Docker operations deep in the run flow. If Docker is not installed, the error message is cryptic and appears late — after role resolution and materialization have already completed.

---

## 2. Goals

### User Goals
- **Zero-config agent sessions:** `mason claude` scans the project's `.claude/` directory and starts a containerized agent with all discovered tasks, skills, and MCP servers — no ROLE.md required.
- **Source override from CLI:** `mason claude --source codex` scans `.codex/` instead of `.claude/` to build the project role. Multiple `--source` flags merge sources.
- **Implied agent aliases:** Typing `mason claude` works even without a configured alias — the CLI recognizes `claude` as a registered agent type.
- **Early Docker validation:** If Docker or Docker Compose is not available, fail immediately with a clear error message before any work is done.

### Non-Goals
- **Persisting the project role to disk:** The auto-generated role exists only in memory. Users who want a persistent, editable role should create a ROLE.md manually.
- **Replacing explicit roles:** When `--role` is provided, the existing role resolution flow is used unchanged. The project role is only generated when no role is specified.
- **Auto-discovering roles from agent directories:** This feature does not scan for ROLE.md files inside agent directories. It scans for tasks, skills, and MCP servers to compose into a single project role.

---

## 3. Design Principles

- **Convention over configuration.** A project with a `.claude/` directory containing commands and skills should be runnable without any additional configuration.
- **CLI flags override file-based config.** `--source` on the command line always takes precedence over `sources` declared in a role definition.
- **First-wins deduplication.** When multiple sources contribute items with the same name, the first source's version is kept. This gives predictable, stable behavior.
- **Fail fast.** Docker availability is checked before any role resolution, scanning, or materialization work begins.

---

## 4. Auto-Generated Project Role

### 4.1 Trigger Condition

The project role is generated when ALL of the following are true:

1. The user runs `mason run <agent-type>` (or shorthand `mason <agent-type>`) **without** a `--role` flag.
2. No alias configuration provides a default role for the given agent type.

When triggered, the CLI constructs an in-memory `Role` (ROLE_TYPES) object — the "project role" — by scanning the source agent's directory.

### 4.2 Source Resolution

The "source" determines which agent directory is scanned to populate the project role.

**Resolution order:**

1. **CLI `--source` flag(s):** If one or more `--source` flags are provided, use those exclusively. Each value is an agent directory name (e.g., `claude`, `codex`, `aider`).
2. **Agent type as default:** If no `--source` flag is provided, the agent type being run is used as the source. Example: `mason claude` → source is `claude` → scans `.claude/`.

**Multiple sources:** The user can specify `--source` multiple times:

```bash
mason claude --source claude --source codex
```

This scans both `.claude/` and `.codex/` directories. Items are merged with **first-wins deduplication** — if both directories contain a command named `review`, the one from `.claude/` (the first `--source`) is used.

### 4.3 Scanning Process

For each source directory, the scanner discovers:

| Asset Type | Location | Example |
|-----------|----------|---------|
| Tasks (commands) | `.<source>/commands/**/*.md` | `.claude/commands/review.md` |
| Skills | `.<source>/skills/<name>/SKILL.md` | `.claude/skills/openspec/SKILL.md` |
| MCP Servers | `.<source>/settings.json` + `.<source>/settings.local.json` | `mcpServers` key in settings |

The existing `scanProject()` function in `packages/shared/src/mason/scanner.ts` already implements this scanning logic. The project role feature leverages this scanner, filtered to the resolved source dialect(s) rather than scanning all dialects.

scanner should use the agents tasks and skills config to figure out the directory for tasks and skills and wether sub-directories will be processed for paths.  If agent uses kebab case for scopes, then assume now tasks have a scope since it will be impossible to tell when the task name starts and scope ends.

### 4.4 Project Role Construction

The scanner results are mapped to a `Role` (ROLE_TYPES) object:

```
Role {
  metadata: {
    name: "project"
    description: "Auto-generated from project's <source> configuration"
  }
  type: "project"
  instructions: "" (empty — no system prompt)
  tasks: [mapped from discovered commands]
  skills: [mapped from discovered skills]
  apps: [mapped from discovered MCP servers]
  sources: [resolved source directories]
  container: {
    ignore: {
      paths: [
        ".<source>/",     // e.g., ".claude/"
        ".env"            // if .env exists at project root
      ]
    }
  }
  governance: { risk: "LOW", credentials: [] }
  source: { type: "local", agentDialect: <source-dialect> }
}
```

### 4.5 Container Ignore Rules

The project role automatically adds the following to `container.ignore.paths`:

1. **Source agent directory:** The source agent's directory (e.g., `.claude/`) is added because MCP servers declared in it will be repointed to use the proxy inside the container. The host-side agent config must not be visible to the containerized agent.
2. **`.env` file:** If a `.env` file exists at the project root, it is added to the ignore list. Credentials should flow through the credential service, not through a bind-mounted `.env` file.

When multiple sources are specified, all source directories are added to the ignore list.

### 4.6 MCP Server Repointing

Discovered MCP servers from agent settings are added to the project role's `apps` array. During materialization, these are repointed to use the proxy — the same process that occurs for explicitly declared roles. No special handling is needed here; the existing proxy materialization pipeline handles this.

---

## 5. CLI Changes

### 5.1 New `--source` Flag

Added to the `run` command:

```
mason run [agent] [prompt]
  --source <name>    Agent directory to scan (repeatable). Overrides role sources.
                     Values: claude, codex, aider, mcp, mason
```

The `--source` flag:
- Can be specified multiple times: `--source claude --source codex`
- Overrides any `sources` field declared in a role's ROLE.md (when used with `--role`)
- When used without `--role`, determines which directories to scan for the project role
- Values correspond to agent directory names registered in the dialect registry

### 5.2 Implied Agent Alias

When the CLI receives a first positional argument that does not match:
1. Any known command (`run`, `init`, `chapter`, etc.)
2. Any configured alias in `.mason/config.json`

It then checks if the argument matches a **registered agent type** (from the agent registry: `claude`, `codex`, `aider`, `mcp`, etc.). If it does, the CLI treats the invocation as:

```
mason run --agent <matched-agent-type> [remaining args]
```

This creates an implied alias where every registered agent type is directly invocable:

```bash
# These are equivalent:
mason run claude
mason claude

# With additional flags:
mason claude --source codex "fix the bug in auth.ts"
```

If the argument matches neither a command, alias, nor agent type, the CLI exits with an error listing available commands and agent types.

**Note:** The current shorthand detection already partially implements this (checking `isKnownAgentType()` in the pre-parse hook). This requirement ensures the check is comprehensive and includes config-declared agent types.

### 5.3 Docker Pre-flight Check

Before any role resolution, scanning, or materialization:

1. Run `docker compose version` to verify Docker Compose v2 is available.
2. If the command fails or is not found, exit immediately with:

```
Error: Docker Compose v2 is required but not found.
  Install Docker Desktop: https://docs.docker.com/get-docker/
  Or install Docker Compose: https://docs.docker.com/compose/install/
```

This check runs at the **start** of the `run` command, before any role resolution or scanning work begins. The existing `checkDockerCompose()` utility in `packages/cli/src/cli/commands/docker-utils.ts` already implements this — it must be called earlier in the flow.

---

## 6. Source Override Behavior

### 6.1 With Explicit Role (`--role`)

When `--source` is used alongside `--role`:

```bash
mason claude --role developer --source codex
```

The role is loaded from its ROLE.md as normal, but the `sources` field in the loaded role is **replaced** by the CLI-provided `--source` value(s). This affects:
- Which agent directories are scanned for task prompt content during materialization
- Which agent directories are scanned for skill file content

The role's own `tasks`, `apps`, and `skills` declarations are unchanged — only the source directories used to resolve their content are overridden.

### 6.2 Without Explicit Role (Project Role)

When `--source` is used without `--role`:

```bash
mason claude --source codex
```

The project role is generated by scanning the `--source` directories (`.codex/` in this case). The agent type (`claude`) determines the runtime materializer, but the **content** comes from the source directories.

### 6.3 Default Source (No `--source`, No `--role`)

```bash
mason claude
```

The agent type (`claude`) is used as the default source. Scans `.claude/` to build the project role, then runs it on the Claude Code runtime.

---

## 7. Use Cases

### UC-1: Zero-Config Agent Session

**Actor:** Developer with an existing `.claude/` directory containing commands, skills, and MCP server settings.
**Goal:** Run a containerized Claude Code agent without creating a ROLE.md.

**Flow:**
1. Developer runs `mason claude`.
2. CLI checks Docker Compose availability (hard fail if missing).
3. No `--role` provided and no alias defines a default role → trigger project role generation.
4. No `--source` provided → default source is `claude` (the agent type).
5. Scanner reads `.claude/commands/`, `.claude/skills/`, `.claude/settings.json`.
6. Project role constructed in memory with discovered tasks, skills, and apps.
7. `.claude/` and `.env` (if exists) added to container.ignore.paths.
8. Role materialized for Claude Code runtime, session created, agent started.

**Acceptance Criteria:**
- No ROLE.md file is created or required.
- All commands from `.claude/commands/` are available in the containerized agent.
- All skills from `.claude/skills/` are available in the containerized agent.
- MCP servers from `.claude/settings.json` are proxied through the MCP proxy.
- The host `.claude/` directory is not visible inside the container.

---

### UC-2: Cross-Source Agent Session

**Actor:** Developer who has skills defined in `.claude/` but wants to run them on the Codex runtime.
**Goal:** Run a Codex agent using Claude-authored configuration.

**Flow:**
1. Developer runs `mason codex --source claude`.
2. Docker check passes.
3. No `--role` → project role generation triggered.
4. `--source claude` → scanner reads `.claude/` directory.
5. Project role built from `.claude/` content.
6. Role materialized for Codex runtime (dialect translation applied).
7. Agent starts on Codex with Claude-authored tasks and skills.

**Acceptance Criteria:**
- The Codex materializer translates Claude-dialect field names to Codex equivalents.
- Tasks authored as Claude "commands" are materialized as Codex "instructions".
- The `.claude/` directory is added to container.ignore.paths (not `.codex/`).

---

### UC-3: Multi-Source Merge

**Actor:** Developer with configuration split across `.claude/` and `.codex/` directories.
**Goal:** Combine assets from both sources into a single agent session.

**Flow:**
1. Developer runs `mason claude --source claude --source codex`.
2. Scanner reads both `.claude/` and `.codex/` directories.
3. Discovered items merged: tasks, skills, and MCP servers from both sources.
4. Duplicates resolved by first-wins: `.claude/` items take precedence (first `--source`).
5. Both `.claude/` and `.codex/` added to container.ignore.paths.
6. Project role materialized and agent started.

**Acceptance Criteria:**
- Items from both sources appear in the project role.
- When both sources have an item with the same name, the first source's version is used.
- Both source directories are ignored in the container.

---

### UC-4: Implied Agent Alias

**Actor:** User who types `mason codex` without any configured alias.
**Goal:** Start a Codex agent session without configuring an alias first.

**Flow:**
1. User runs `mason codex`.
2. CLI pre-parse: `codex` is not a known command, not a configured alias.
3. CLI checks agent registry: `codex` is a registered agent type.
4. Invocation rewritten to `mason run --agent codex`.
5. No `--role` → project role generated from `.codex/`.
6. Agent starts.

**Acceptance Criteria:**
- `mason <agent-type>` works for all registered agent types without alias configuration.
- Error message lists available commands and agent types when input matches nothing.

---

### UC-5: Source Override with Explicit Role

**Actor:** Developer who has a `developer` role defined but wants to temporarily use skills from a different agent directory.
**Goal:** Override the role's declared sources from the command line.

**Flow:**
1. Developer runs `mason claude --role developer --source codex`.
2. Role loaded from `.mason/roles/developer/ROLE.md`.
3. Role's `sources: [".claude"]` is overridden by `--source codex`.
4. Task and skill content resolved from `.codex/` instead of `.claude/`.
5. Agent starts with the developer role's instructions but Codex-sourced content.

**Acceptance Criteria:**
- The role's `sources` field is replaced, not merged, by CLI `--source` flags.
- Role instructions (system prompt) are unchanged.
- Task and skill content comes from the overridden source.

---

### UC-6: Docker Not Available

**Actor:** User who has not installed Docker.
**Goal:** Get a clear error message immediately.

**Flow:**
1. User runs `mason claude`.
2. CLI runs `docker compose version` as first action.
3. Command fails → CLI exits with clear error message and installation links.

**Acceptance Criteria:**
- Error appears before any role resolution, scanning, or materialization.
- Error message includes installation links for Docker Desktop and Docker Compose.
- Exit code is non-zero.

---

## 8. Non-Functional Requirements

### 8.1 Performance

- **Project scanning** (tasks + skills + MCP servers from a single source directory) must complete in under 1 second.
- **Docker pre-flight check** must complete in under 2 seconds (network timeout for Docker daemon check).
- **No disk writes** for the project role — everything is in-memory.

### 8.2 Compatibility

- **Backward compatible:** Existing `--role` flows are unchanged. The project role is only generated when no role is specified.
- **Scanner reuse:** Uses the existing `scanProject()` infrastructure from `packages/shared/src/mason/scanner.ts`, filtered by source dialect.
- **Dialect registry:** All registered dialects in the dialect registry are valid `--source` values.

### 8.3 Error Handling

- **No source directory found:** If the resolved source directory (e.g., `.claude/`) does not exist, exit with: `Error: Source directory ".<source>/" not found in project. Run from a project with agent configuration or specify a different --source.`
- **Empty source directory:** If the source directory exists but contains no tasks, skills, or MCP servers, warn but proceed with an empty project role (the agent will start with no tools).
- **Invalid `--source` value:** If the value does not match any registered dialect, exit with: `Error: Unknown source "<value>". Available sources: claude, codex, aider, mcp, mason.`
