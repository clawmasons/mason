# Clawmasons CLI — Product Requirements Document

**Version:** 0.1.0 - Draft
**Date:** March 2026
**Author:** ClawForge, Inc.

---

## 1. Problem Statement

Today, `chapter` is the CLI entry point — an internal-facing name that doesn't communicate what the product is. The onboarding flow requires manual setup of chapters, roles, and docker environments before an ACP client can connect. There is no self-bootstrapping mechanism: a user cannot install a single npm package, point their ACP client at it, and have a working agent environment materialize automatically.

Specific friction points:

- **CLI naming:** The binary is `chapter`, not `clawmasons`. Users install `@clawmasons/chapter-monorepo` but type `chapter` — brand identity is lost.
- **No bootstrap path:** There is no "initiate" chapter that can create other chapters. A user must manually `chapter init --template X`, `chapter build`, configure their ACP client — multiple steps requiring knowledge of the system.
- **No lodge concept in runtime:** The `<lodge>.<chapter>` naming exists in workspace metadata, but there is no first-class lodge directory with a charter, config, and multi-chapter management.
- **Environment variables from ACP clients:** The ACP client `env` block passes environment variables to the spawned process, but the credential-service only checks session overrides (from `CREDENTIAL_SESSION_OVERRIDES`) after initialization. Process-level env vars ARE checked (resolver priority: session overrides > env > keychain > dotenv), but there is no explicit documentation or guarantee that ACP-provided env vars flow correctly through the entire chain.
- **No agent mounts configuration:** All agent containers mount CWD at `/workspace`. There is no mechanism for a role to declare additional volume mounts (e.g., mounting `LODGE_HOME` for a chapter-creator role that needs to write to the lodge directory).
- **No per-role base image:** All containers use `node:22-slim`. Roles like `chapter-creator` need heavier images with development tools (python, rust, c compilers).
- **NPM namespace unprotected:** The `clawmasons` npm package name and related variants are not reserved, leaving the project vulnerable to typosquatting and namespace hijacking.

---

## 2. Goals

### User Goals
- **Single-command ACP setup:** `npx clawmasons acp --chapter initiate --role chapter-creator` bootstraps everything — lodge, initiate chapter, docker containers — and starts accepting ACP client connections.
- **Self-bootstrapping agents:** The `initiate` chapter's `chapter-creator` role can analyze a project and create a new chapter for it, complete with roles, tasks, skills, apps, and docker setup.
- **Brand-aligned CLI:** The binary is `clawmasons`, the npm package is `clawmasons`, the user types `clawmasons` everywhere.
- **Lodge-as-workspace:** A lodge is a persistent directory with a charter, chapters, and configuration — the unit of organization for multi-chapter deployments.

### Business Goals
- Secure the `clawmasons` npm namespace and all adjacent names against typosquatting.
- Enable a zero-to-working-agent flow that can be demonstrated in under 5 minutes.
- Establish the "initiate" chapter as the entry point for all new clawmasons users.

---

## 3. Non-Goals

- **Registry-based chapter distribution:** Chapters are built locally. Publishing to npm registry is future work.
- **Multi-lodge management UI:** The CLI manages one lodge at a time via env vars. A TUI/GUI for multi-lodge is future work.
- **Windows support:** Lodge paths use POSIX conventions (`~/.clawmasons`).
- **Custom chapter templates beyond initiate:** Only the `initiate` template is created in this PRD. The existing `note-taker` template remains unchanged.
- **LLM integration for chapter-creator:** The chapter-creator role provides skills and tasks — the LLM is provided by the ACP client, not by clawmasons.

---

## 4. Core Concepts

### 4.1 CLI Rename: `chapter` to `clawmasons`

The CLI binary changes from `chapter` to `clawmasons`. The npm package name changes from `@clawmasons/chapter-monorepo` (unpublished workspace root) to `clawmasons` (published to npm).

**Command restructuring:**

| Old Command | New Command | Notes |
|---|---|---|
| `chapter init --name X --template Y` | `clawmasons chapter init --name X --template Y` | Becomes subcommand of `chapter` |
| `chapter build` | `clawmasons chapter build` | Becomes subcommand of `chapter` |
| `chapter init-role --role X` | `clawmasons chapter init-role --role X` | Becomes subcommand of `chapter` |
| `chapter run-agent <agent> <role>` | `clawmasons agent <agent> <role>` | Top-level, renamed |
| `chapter run-acp-agent --role X` | `clawmasons acp --role X` | Top-level, renamed |
| `chapter list` | `clawmasons chapter list` | Becomes subcommand of `chapter` |
| `chapter validate <agent>` | `clawmasons chapter validate <agent>` | Becomes subcommand of `chapter` |
| `chapter permissions <agent>` | `clawmasons chapter permissions <agent>` | Becomes subcommand of `chapter` |
| `chapter pack` | `clawmasons chapter pack` | Becomes subcommand of `chapter` |
| `chapter add <pkg>` | `clawmasons chapter add <pkg>` | Becomes subcommand of `chapter` |
| `chapter remove <pkg>` | `clawmasons chapter remove <pkg>` | Becomes subcommand of `chapter` |
| `chapter proxy` | `clawmasons chapter proxy` | Becomes subcommand of `chapter` |
| _(new)_ | `clawmasons init` | Lodge initialization |

**New top-level commands:**

```
clawmasons init              # Initialize a new lodge
clawmasons agent              # Run agent interactively (was run-agent)
clawmasons acp                # Start ACP endpoint (was run-acp-agent)
clawmasons chapter <subcmd>   # All chapter workspace commands
```

### 4.2 Lodge

A lodge is a named organizational unit that contains chapters. It has a home directory, a charter, and a configuration entry in `CLAWMASONS_HOME`.

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `CLAWMASONS_HOME` | `~/.clawmasons` | Root directory for all clawmasons runtime state. Can support multiple lodges. |
| `LODGE` | `$USER` or `"anonymous"` | Lodge name. Used to namespace chapters and config. Falls back to `$USER` env var, then `"anonymous"`. |
| `LODGE_HOME` | `$CLAWMASONS_HOME/$LODGE` | Parent directory of the lodge. Where the lodge directory structure lives. Can be overridden to point at a project directory (e.g., `~/projects/acme`) for version control. |

**Lodge directory structure:**

```
LODGE_HOME/
  CHARTER.md                    # Constitution, rights, and laws for agents in this lodge
  chapters/
    initiate/                   # Bootstrap chapter (created by clawmasons init)
      package.json              # Workspace root
      agents/
      roles/
      tasks/
      skills/
      apps/
      .clawmasons/
        chapter.json
    <user-created-chapter>/     # Chapters created by chapter-creator
      ...
```

**CLAWMASONS_HOME directory structure:**

```
CLAWMASONS_HOME/
  config.json                   # Lodge registry: { "<lodge>": { "home": "<LODGE_HOME>" } }
  chapters.json                 # Existing: registry of initialized chapter/roles (unchanged)
  .gitignore
  <lodge>/
    <chapter>/
      <role>/
        docker-compose.yaml
        logs/
```

**config.json format:**

```json
{
  "acme": {
    "home": "/Users/dev/projects/acme"
  },
  "personal": {
    "home": "~/.clawmasons/personal"
  }
}
```

### 4.3 CHARTER.md

A governance document placed at `LODGE_HOME/CHARTER.md`. This is a base constitution defining rights, laws, and constraints that all agents in the lodge must abide by. It is loaded as context for every agent session in the lodge.

The CHARTER.md template lives in the CLI package at `packages/cli/templates/charter/CHARTER.md` and is copied during `clawmasons init`.

Content should include:
- Agent behavioral boundaries (what agents may and may not do)
- Data handling policies (what data can be read, written, sent externally)
- Approval requirements for destructive actions
- Lodge-specific conventions and standards

### 4.4 Initiate Chapter

The `initiate` chapter is a special chapter template that provides the `chapter-creator` role. It is the bootstrap mechanism: when a user first sets up clawmasons, this chapter is created automatically and provides the tools to create additional chapters.

**Template location:** `packages/cli/templates/initiate/`

**Template structure:**
```
initiate/
  package.json                  # {{projectScope}} workspace root
  agents/
    pi/                         # Default agent using pi-coding-agent runtime
      package.json              # chapter.runtimes: ["pi-coding-agent"]
  roles/
    chapter-creator/
      package.json              # Permissions, tasks, skills for creating chapters
  tasks/
    create-chapter/
      package.json              # taskType: "subagent"
      prompts/
        create-chapter.md       # Task prompt for chapter creation workflow
  skills/
    create-chapter/
      package.json
      SKILL.md                  # Skill definition for chapter creation
  apps/
    filesystem/
      package.json              # @modelcontextprotocol/server-filesystem
```

### 4.5 Agent Mounts

Roles can declare additional volume mounts for agent containers beyond the default `/home/mason/workspace/project` (CWD) mount.

**Role package.json extension:**

```json
{
  "name": "@acme/role-chapter-creator",
  "chapter": {
    "type": "role",
    "mounts": [
      {
        "source": "${LODGE_HOME}",
        "target": "/home/mason/${LODGE}",
        "readonly": false
      }
    ],
    "permissions": { ... }
  }
}
```

**Mount schema:**

| Field | Type | Description |
|---|---|---|
| `source` | string | Host path. Supports env var interpolation: `${LODGE_HOME}`, `${CLAWMASONS_HOME}`, `${LODGE}`. |
| `target` | string | Container path. Supports same env var interpolation. |
| `readonly` | boolean | If true, mount is read-only. Default: false. |

**Default mount (unchanged):**
- Source: CWD from ACP `session/new` or `process.cwd()`
- Target: `/home/mason/workspace/project` (agent Dockerfile WORKDIR)

**Mount resolution order:**
1. Default CWD mount (always present)
2. Role-declared mounts (from `chapter.mounts`)
3. Environment variables resolved at container startup time

### 4.6 Per-Role Docker Base Image

Roles can declare a custom Docker base image instead of the default `node:22-slim`.

**Role package.json extension:**

```json
{
  "name": "@acme/role-chapter-creator",
  "chapter": {
    "type": "role",
    "baseImage": "node:22-bookworm",
    "aptPackages": ["python3", "python3-pip", "rustc", "cargo", "gcc", "g++", "make"],
    "permissions": { ... }
  }
}
```

**Schema:**

| Field | Type | Description |
|---|---|---|
| `baseImage` | string | Docker base image. Default: `node:22-slim`. |
| `aptPackages` | string[] | Additional apt packages to install in the agent container. Installed via `apt-get install -y`. |

**Impact on Dockerfile generation:**
- `packages/cli/src/generator/agent-dockerfile.ts` reads the role's `baseImage` and `aptPackages`
- The `FROM` line uses the role's `baseImage` instead of hardcoded `node:22-slim`
- An additional `RUN apt-get update && apt-get install -y <packages> && rm -rf /var/lib/apt/lists/*` line is added when `aptPackages` is non-empty
- Proxy and credential-service containers are NOT affected (they keep `node:22-slim`)

### 4.7 ACP Client Configuration

The ACP client configuration block for clawmasons:

```json
{
  "agent_servers": {
    "Clawmasons": {
      "type": "custom",
      "command": "npx",
      "args": [
        "clawmasons",
        "acp",
        "--chapter", "initiate",
        "--role", "chapter-creator",
        "--init-agent", "pi"
      ],
      "env": {
        "CLAWMASONS_HOME": "~/.clawmasons",
        "LODGE": "acme",
        "LODGE_HOME": "~/.clawmasons/acme",
        "OPEN_ROUTER_KEY": "$OPENROUTER_API_KEY"
      }
    }
  }
}
```

Environment variables in the `env` block are set as process environment variables on the spawned `npx clawmasons acp` process. The credential-service resolver already checks `process.env` as priority 1 (after session overrides), so these values are available to agents requesting credentials.

---

## 5. User Stories

**US-1:** As a new user, I want to run `npx clawmasons acp --chapter initiate --role chapter-creator` and have it bootstrap a lodge, create the initiate chapter, build it, and start accepting ACP connections — so I can start using clawmasons with zero prior setup.

**US-2:** As a developer, I want the `chapter-creator` agent to analyze my project's existing MCP servers, slash commands, and tools, and generate a complete chapter for it — so I don't have to manually create package.json files for every app, task, skill, and role.

**US-3:** As a team lead, I want to set `LODGE_HOME` to a directory in my project repo — so the lodge configuration and chapters can be version-controlled and shared with my team.

**US-4:** As a developer using Zed, I want to configure clawmasons as an ACP agent server with environment variables — so credentials like `OPENROUTER_API_KEY` flow through to the agent without manual `.env` file setup.

**US-5:** As a chapter author, I want to declare additional volume mounts in my role's `package.json` — so the agent container can access directories beyond the project workspace (e.g., the lodge home for creating new chapters).

**US-6:** As a chapter author, I want to specify a custom base Docker image and additional apt packages for my role — so agents in that role have access to development tools like python, rust, and C compilers.

**US-7:** As a user, I want to type `clawmasons` instead of `chapter` — so the CLI matches the product name.

**US-8:** As a security-conscious publisher, I want placeholder packages published on npm for all clawmasons-adjacent names — so attackers cannot publish malicious packages under those names.

---

## 6. Requirements

### P0 — Must-Have

---

**REQ-001: Rename CLI Binary from `chapter` to `clawmasons`**

The CLI binary registered in `packages/cli/package.json` changes from `chapter` to `clawmasons`.

**Current state:**
- `packages/cli/package.json` line 7: `"bin": { "chapter": "dist/cli/bin.js" }`
- All 14 commands registered as top-level commands on the `chapter` program (via `packages/cli/src/cli/commands/index.ts`)
- `packages/cli/src/cli/index.ts` creates program with name `"chapter"`
- E2E tests reference `bin/chapter.js` in helpers (`e2e/tests/helpers.ts` line 10)
- Proxy Dockerfile entrypoint uses `node_modules/.bin/chapter` (`packages/cli/src/generator/proxy-dockerfile.ts` line 49)

**Changes required:**

1. `packages/cli/package.json`: Change bin from `"chapter"` to `"clawmasons"`
2. `packages/cli/src/cli/index.ts`: Change program name from `"chapter"` to `"clawmasons"`
3. `packages/cli/src/cli/commands/index.ts`: Restructure command registration:
   - Top-level: `init`, `agent`, `acp`
   - Subcommand group `chapter`: `init` (chapter workspace init), `build`, `init-role`, `list`, `validate`, `permissions`, `pack`, `add`, `remove`, `proxy`
4. `packages/cli/src/generator/proxy-dockerfile.ts` line 49: Change entrypoint from `chapter` to `clawmasons`
5. `bin/chapter.js`: Rename to `bin/clawmasons.js` (or update path)
6. All E2E tests and helpers: Update `CHAPTER_BIN` path
7. Help text, error messages, and log output: Replace "chapter" with "clawmasons" where it refers to the CLI binary name

**Backward compatibility:** The old `chapter` binary name is NOT preserved. This is a breaking rename — no deprecation shim.

**Acceptance criteria:**
- `npx clawmasons --help` shows the new command structure with `init`, `agent`, `acp`, `chapter` subgroups.
- `npx clawmasons chapter build` behaves identically to the old `chapter build`.
- `npx clawmasons agent note-taker writer` behaves identically to the old `chapter run-agent note-taker writer`.
- `npx clawmasons acp --role writer` behaves identically to the old `chapter run-acp-agent --role writer`.
- All E2E tests pass with the new binary name.

---

**REQ-002: Restructure CLI Commands**

Commands are reorganized into a hierarchy with three top-level commands and a `chapter` subcommand group.

**Top-level commands:**

```
clawmasons init                              # Lodge initialization (NEW)
clawmasons agent <agent> <role>              # Run agent interactively (was run-agent)
clawmasons acp --role <role> [options]       # Start ACP endpoint (was run-acp-agent)
clawmasons chapter <subcommand>              # Chapter workspace commands
```

**`clawmasons chapter` subcommands (all existing, reorganized):**

```
clawmasons chapter init --name <lodge.chapter> [--template <T>]
clawmasons chapter build [<agent>]
clawmasons chapter init-role --role <name> [--agent <name>] [--target-dir <path>]
clawmasons chapter list [--json]
clawmasons chapter validate <agent> [--json]
clawmasons chapter permissions <agent> [--json]
clawmasons chapter pack
clawmasons chapter add <pkg> [npmArgs...]
clawmasons chapter remove <pkg> [--force] [npmArgs...]
clawmasons chapter proxy [options]
```

**Implementation:**

In `packages/cli/src/cli/index.ts`:
```typescript
const program = new Command("clawmasons");

// Top-level commands
registerInitCommand(program);        // clawmasons init
registerAgentCommand(program);       // clawmasons agent (was run-agent)
registerAcpCommand(program);         // clawmasons acp (was run-acp-agent)

// Chapter subcommand group
const chapterCmd = program.command("chapter")
  .description("Chapter workspace management commands");
registerChapterSubcommands(chapterCmd);  // init, build, init-role, list, validate, etc.
```

**`clawmasons agent` command:**
- Signature: `clawmasons agent <agent> <role>`
- Identical behavior to current `run-agent` command
- Source: Rename `run-agent.ts` registration, keep implementation unchanged

**`clawmasons acp` command:**
- Signature: `clawmasons acp --role <role> [--agent <name>] [--port <n>] [--proxy-port <n>] [--chapter <name>] [--init-agent <name>]`
- New options:
  - `--chapter <name>`: Chapter name to use. If combined with `initiate` chapter, triggers lodge init flow.
  - `--init-agent <name>`: Agent to use for the initiate chapter (e.g., `pi`). Only valid with `--chapter initiate`.
- Existing behavior preserved for non-initiate chapters

**Removed commands (as top-level):**
- `run-init` — already deprecated, fully removed
- `docker-init` — already internal to `build`, fully removed as CLI entry

**Acceptance criteria:**
- `clawmasons --help` shows `init`, `agent`, `acp`, `chapter` commands.
- `clawmasons chapter --help` shows all subcommands.
- `clawmasons agent <agent> <role>` works identically to old `chapter run-agent`.
- `clawmasons acp --role <role>` works identically to old `chapter run-acp-agent`.
- Old command names (`run-agent`, `run-acp-agent`) are not recognized.

---

**REQ-003: `clawmasons init` — Lodge Initialization**

New top-level command that initializes a lodge directory structure.

**Signature:**
```
clawmasons init [--lodge <name>] [--lodge-home <path>] [--home <path>]
```

**Options:**
- `--lodge <name>`: Lodge name. Overrides `LODGE` env var.
- `--lodge-home <path>`: Lodge home directory. Overrides `LODGE_HOME` env var.
- `--home <path>`: Clawmasons home directory. Overrides `CLAWMASONS_HOME` env var.

**Environment variable resolution (in order of priority):**

| Variable | CLI Flag | Env Var | Default |
|---|---|---|---|
| Lodge name | `--lodge` | `LODGE` | `$USER` or `"anonymous"` |
| Lodge home | `--lodge-home` | `LODGE_HOME` | `$CLAWMASONS_HOME/$LODGE` |
| Clawmasons home | `--home` | `CLAWMASONS_HOME` | `~/.clawmasons` |

**Behavior:**

1. **Resolve variables** per the table above.

2. **Check CLAWMASONS_HOME:**
   - If `CLAWMASONS_HOME` directory does not exist, create it.
   - If `CLAWMASONS_HOME/config.json` does not exist, create it with `{}`.

3. **Check if lodge already exists:**
   - Read `CLAWMASONS_HOME/config.json`.
   - If an entry for `<lodge>` exists AND `LODGE_HOME/chapters` directory exists:
     - Print: "Lodge '<lodge>' already initialized at <LODGE_HOME>. Skipping init."
     - Return (idempotent — not an error).

4. **Create LODGE_HOME:**
   - Create `LODGE_HOME` directory if it does not exist.
   - Create `LODGE_HOME/chapters/` directory.

5. **Copy CHARTER.md:**
   - Copy `packages/cli/templates/charter/CHARTER.md` to `LODGE_HOME/CHARTER.md`.
   - Only if `LODGE_HOME/CHARTER.md` does not already exist (do not overwrite user edits).

6. **Update config.json:**
   - Read `CLAWMASONS_HOME/config.json`.
   - Add/update entry: `{ "<lodge>": { "home": "<LODGE_HOME>" } }`.
   - Write back to `CLAWMASONS_HOME/config.json`.

7. **Print summary:**
   ```
   Lodge '<lodge>' initialized at <LODGE_HOME>

   Next steps:
     clawmasons acp --chapter initiate --role chapter-creator
   ```

**Acceptance criteria:**
- Given `CLAWMASONS_HOME` does not exist, `clawmasons init` creates it with `config.json`.
- Given `LODGE=acme` and default `LODGE_HOME`, creates `~/.clawmasons/acme/` with `CHARTER.md` and `chapters/`.
- Given the lodge already exists with a `chapters/` directory, the command exits cleanly without error.
- Given `--lodge-home ~/projects/acme`, the `config.json` entry points to that custom path.
- `CHARTER.md` is not overwritten if it already exists.

---

**REQ-004: `clawmasons acp` — Initiate Chapter Bootstrap Flow**

When `clawmasons acp` is invoked with `--chapter initiate` and `--role chapter-creator`, it runs a bootstrap flow before the standard ACP startup.

**Signature:**
```
clawmasons acp --chapter initiate --role chapter-creator [--init-agent pi] [--port 3001] [--proxy-port 3000]
```

**New options (on the `acp` command):**

| Option | Description |
|---|---|
| `--chapter <name>` | Chapter name to use. When `initiate`, triggers bootstrap. |
| `--init-agent <name>` | Agent slug to use for the initiate chapter. Modifies the agent package to use this runtime. Default: `pi` (pi-coding-agent). |

**Bootstrap flow (runs before standard ACP startup):**

1. **Run `clawmasons init`** (REQ-003) to ensure lodge exists.
   - Uses env vars `CLAWMASONS_HOME`, `LODGE`, `LODGE_HOME` (same resolution).
   - Idempotent — skips if already initialized.

2. **Check if initiate chapter exists:**
   - Look for `LODGE_HOME/chapters/initiate/` directory.
   - If it exists AND has a valid `.clawmasons/chapter.json`, skip to step 5.

3. **Create initiate chapter:**
   - Create `LODGE_HOME/chapters/initiate/` directory.
   - Run `clawmasons chapter init --name <lodge>.initiate --template initiate` with CWD set to `LODGE_HOME/chapters/initiate/`.
   - This copies the `initiate` template and runs `npm install`.

4. **Configure agent for --init-agent:**
   - Read the agent package.json in the initiate chapter (e.g., `LODGE_HOME/chapters/initiate/agents/pi/package.json`).
   - The template provides a default agent matching `--init-agent` (default: `pi`).
   - If `--init-agent` specifies a different agent slug, update the agent's runtime configuration accordingly.

5. **Build the initiate chapter:**
   - Run `clawmasons chapter build` with CWD set to `LODGE_HOME/chapters/initiate/`.
   - This runs: resolve > pack > docker-init (generates Dockerfiles and docker/ directory).

6. **Continue standard ACP startup:**
   - The standard `run-acp-agent` flow (from current `packages/cli/src/cli/commands/run-acp-agent.ts`) continues:
     - Resolve role from `CLAWMASONS_HOME/chapters.json` (auto-init-role if needed)
     - Discover and resolve agent
     - Start infrastructure (proxy + credential-service)
     - Start ACP bridge
     - Wait for `session/new`
   - CWD for the chapter workspace is `LODGE_HOME/chapters/initiate/`.

**Acceptance criteria:**
- Given a fresh system with no `~/.clawmasons`, `clawmasons acp --chapter initiate --role chapter-creator` creates the lodge, initiate chapter, builds it, and starts the ACP endpoint.
- Given the initiate chapter already exists and is built, the command skips init/build and proceeds directly to ACP startup.
- Given `--init-agent pi`, the agent uses `pi-coding-agent` runtime.
- The ACP endpoint is reachable on port 3001 (default) after startup.
- `session/new` with a CWD triggers agent container launch with that CWD mounted.

---

**REQ-005: Environment Variable Flow from ACP Client**

Ensure environment variables from the ACP client configuration's `env` block flow correctly to the credential-service and are available to agents.

**Current behavior (mostly correct, needs verification):**
1. ACP client spawns `npx clawmasons acp ...` with `env` block set as process environment variables.
2. The `clawmasons acp` process inherits these env vars in `process.env`.
3. The credential-service container receives `CREDENTIAL_SESSION_OVERRIDES` (from the `extractCredentials()` rewriter).
4. The credential resolver checks: session overrides > `process.env` > keychain > `.env`.

**Problem:** The credential-service runs INSIDE a Docker container. `process.env` inside the container does NOT have the host process env vars — only the explicitly mapped env vars from docker-compose.

**Required changes:**

1. **Pass ACP-provided env vars to credential-service container:**
   - In `packages/cli/src/acp/session.ts` `generateInfraComposeYml()`:
     - Read env vars from `process.env` that match credential keys declared by the agent.
     - Add them to the credential-service docker-compose environment block.
   - Alternatively (preferred): Use `CREDENTIAL_SESSION_OVERRIDES` to pass ALL env vars from the ACP client's `env` block. This already works via `extractCredentials()` in `packages/cli/src/acp/rewriter.ts` — but it only extracts from matched MCP server configs, not from the process env.

2. **Enhance credential resolver to also forward process-level env vars as session overrides:**
   - In the `clawmasons acp` command, before starting infrastructure:
     - Collect all env vars from `process.env` that match any agent's `credentials` array.
     - Merge these into the `credentials` object passed to `AcpSession`.
     - This ensures they appear in `CREDENTIAL_SESSION_OVERRIDES` and have highest priority in the resolver.

3. **Verify credential-service startup reads `CREDENTIAL_SESSION_OVERRIDES`:**
   - Already implemented in `packages/credential-service/src/cli.ts` lines 34-48.
   - No changes needed here.

**Acceptance criteria:**
- Given ACP client config with `"env": { "OPEN_ROUTER_KEY": "$OPENROUTER_API_KEY" }`, when the agent requests credential `OPEN_ROUTER_KEY`, it receives the value from the host's `$OPENROUTER_API_KEY`.
- Given ACP client config with `"env": { "CUSTOM_TOKEN": "abc123" }`, the credential-service resolves `CUSTOM_TOKEN` to `"abc123"`.
- The credential-service does not need to be restarted when env vars change (they are set per infrastructure startup).

---

**REQ-006: Role-Declared Agent Mounts**

Roles can declare additional volume mounts for agent containers.

**Schema extension to role package.json:**

Add `mounts` field to the `RoleChapterField` schema in `packages/shared/src/schemas/role.ts`:

```typescript
const RoleChapterFieldSchema = z.object({
  type: z.literal("role"),
  description: z.string().optional(),
  risk: z.enum(["HIGH", "MEDIUM", "LOW"]).default("LOW"),
  tasks: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  permissions: z.record(/* ... */),
  constraints: z.object(/* ... */).optional(),
  // NEW
  mounts: z.array(z.object({
    source: z.string(),
    target: z.string(),
    readonly: z.boolean().default(false),
  })).optional(),
  baseImage: z.string().optional(),
  aptPackages: z.array(z.string()).optional(),
});
```

**Implementation changes:**

1. **Docker compose generation** (`packages/cli/src/cli/commands/run-agent.ts` `generateComposeYml()` and `packages/cli/src/acp/session.ts` `generateAgentComposeYml()`):
   - After adding the default CWD mount (`${projectDir}:/workspace`), iterate over `role.mounts`.
   - For each mount, resolve `${VAR}` references in `source` and `target` using `process.env`.
   - Add the resolved mount to the agent service's `volumes` array.
   - If `readonly` is true, append `:ro` to the volume spec.

2. **Init-role compose generation** (`packages/cli/src/cli/commands/init-role.ts` `generateInitRoleComposeYml()`):
   - Same mount resolution logic.
   - Mounts use `${VAR}` syntax in the compose file for runtime resolution.

3. **Supported interpolation variables:**
   - `${LODGE_HOME}` — resolved from env var
   - `${CLAWMASONS_HOME}` — resolved from env var
   - `${LODGE}` — resolved from env var
   - `${CWD}` — resolved at runtime to the session's CWD

**Default mount (unchanged):**
```yaml
volumes:
  - "${projectDir}:/home/mason/workspace/project"
```

**Example generated mount for chapter-creator:**
```yaml
volumes:
  - "${projectDir}:/home/mason/workspace/project"
  - "${LODGE_HOME}:/home/mason/acme"
```

**Acceptance criteria:**
- Given a role with `mounts: [{ source: "${LODGE_HOME}", target: "/home/mason/${LODGE}", readonly: false }]`, the agent container has `LODGE_HOME` mounted at `/home/mason/<lodge-name>`.
- Given `LODGE_HOME=/Users/dev/acme` and `LODGE=acme`, the mount resolves to `/Users/dev/acme:/home/mason/acme`.
- Given `readonly: true`, the mount is appended with `:ro`.
- Mounts with unresolvable env vars cause a clear error message at startup.

---

**REQ-007: Per-Role Docker Base Image**

Roles can declare a custom Docker base image and additional apt packages.

**Schema:** See REQ-006 schema extension (`baseImage` and `aptPackages` fields).

**Implementation changes:**

1. **Agent Dockerfile generation** (`packages/cli/src/generator/agent-dockerfile.ts`):
   - Current: `FROM node:22-slim` (line 48, hardcoded)
   - New: Read `resolvedRole.baseImage`. If set, use it as the `FROM` image. Otherwise, default to `node:22-slim`.
   - Current: No apt-get install in agent Dockerfile (only in proxy/credential-service Dockerfiles for native addons)
   - New: If `resolvedRole.aptPackages` is non-empty, add:
     ```dockerfile
     RUN apt-get update && apt-get install -y <packages> && rm -rf /var/lib/apt/lists/*
     ```
     This line goes BEFORE the `npm rebuild` line.

2. **Function signature change:**
   - `generateAgentDockerfile()` currently receives `(agentName, roleName, runtimes, acpMode)`.
   - Add `resolvedRole` parameter (or at minimum `baseImage` and `aptPackages`).

3. **Proxy and credential-service Dockerfiles are NOT affected.** They continue using `node:22-slim`.

**Example generated Dockerfile for chapter-creator:**
```dockerfile
FROM node:22-bookworm

RUN apt-get update && apt-get install -y \
    python3 python3-pip rustc cargo gcc g++ make \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/mason
# ... rest unchanged
```

**Acceptance criteria:**
- Given a role with `baseImage: "node:22-bookworm"`, the generated agent Dockerfile uses `FROM node:22-bookworm`.
- Given a role with `aptPackages: ["python3", "rustc"]`, the Dockerfile includes `apt-get install -y python3 rustc`.
- Given a role with no `baseImage` or `aptPackages`, the Dockerfile is identical to current behavior (`node:22-slim`, no extra apt packages).
- The proxy and credential-service Dockerfiles remain unchanged.

---

**REQ-008: Initiate Chapter Template**

Create the `initiate` chapter template at `packages/cli/templates/initiate/`.

**Template contents:**

1. **Root package.json:**
   ```json
   {
     "name": "@{{projectScope}}/chapter",
     "version": "0.1.0",
     "private": true,
     "workspaces": ["apps/*", "tasks/*", "skills/*", "roles/*", "agents/*"]
   }
   ```

2. **Agent: `agents/pi/package.json`:**
   ```json
   {
     "name": "@{{projectScope}}/agent-pi",
     "version": "1.0.0",
     "chapter": {
       "type": "agent",
       "name": "Chapter Creator",
       "slug": "pi",
       "description": "Bootstrap agent for creating new chapters",
       "runtimes": ["pi-coding-agent"],
       "roles": ["@{{projectScope}}/role-chapter-creator"],
       "credentials": ["OPENROUTER_API_KEY"],
       "llm": {
         "provider": "openrouter",
         "model": "anthropic/claude-sonnet-4"
       },
       "acp": {
         "port": 3002
       }
     },
     "dependencies": {}
   }
   ```

3. **Role: `roles/chapter-creator/package.json`:**
   ```json
   {
     "name": "@{{projectScope}}/role-chapter-creator",
     "version": "1.0.0",
     "chapter": {
       "type": "role",
       "description": "Creates new chapters by analyzing projects and scaffolding chapter artifacts",
       "risk": "MEDIUM",
       "tasks": ["@{{projectScope}}/task-create-chapter"],
       "skills": ["@{{projectScope}}/skill-create-chapter"],
       "permissions": {
         "@{{projectScope}}/app-filesystem": {
           "allow": ["read_file", "write_file", "list_directory", "create_directory"],
           "deny": []
         }
       },
       "mounts": [
         {
           "source": "${LODGE_HOME}",
           "target": "/home/mason/${LODGE}",
           "readonly": false
         }
       ],
       "baseImage": "node:22-bookworm",
       "aptPackages": ["python3", "python3-pip", "rustc", "cargo", "gcc", "g++", "make", "git", "curl"]
     }
   }
   ```

4. **Task: `tasks/create-chapter/package.json`:**
   ```json
   {
     "name": "@{{projectScope}}/task-create-chapter",
     "version": "1.0.0",
     "chapter": {
       "type": "task",
       "taskType": "subagent",
       "prompt": "./prompts/create-chapter.md",
       "requires": {
         "apps": ["@{{projectScope}}/app-filesystem"],
         "skills": ["@{{projectScope}}/skill-create-chapter"]
       },
       "approval": "confirm"
     }
   }
   ```

5. **Task prompt: `tasks/create-chapter/prompts/create-chapter.md`:**

   The prompt instructs the agent to:
   - Start in plan mode
   - Analyze the target project directory for: existing skills (SKILL.md files), OS dependencies, MCP server configurations, slash commands, tool definitions
   - Include in the plan: missing OS dependencies and their `apt-get install` commands for the Linux container
   - Create a plan for a new chapter with all artifacts: apps (for each MCP server), tasks (for each slash command or workflow), skills (for knowledge/context), roles (with appropriate permissions)
   - Create separate roles if the project contains HIGH risk MCP tools or commands (e.g., tools that can delete repositories, send emails, execute arbitrary code)
   - All MCP servers and commands become app definitions in the chapter
   - Once the plan is accepted by the user, execute it:
     - Create the chapter directory at `LODGE_HOME/chapters/<chapter-name>/`
     - Scaffold all chapter artifacts (package.json files for apps, tasks, skills, roles, agents)
     - Run `clawmasons chapter build` to generate Docker artifacts
   - After completion, tell the user they can start a new ACP session to test the chapter, explaining that all skills, commands, and MCP servers will come from the chapter definitions. If anything is missing, return to this bootstrap session and paste the error.

6. **Skill: `skills/create-chapter/package.json`:**
   ```json
   {
     "name": "@{{projectScope}}/skill-create-chapter",
     "version": "1.0.0",
     "chapter": {
       "type": "skill",
       "artifacts": ["./SKILL.md"],
       "description": "Knowledge for analyzing projects and creating chapter artifacts"
     }
   }
   ```

7. **Skill artifact: `skills/create-chapter/SKILL.md`:**

   The skill document provides the agent with:
   - Chapter package taxonomy reference (app, task, skill, role, agent types)
   - Package.json format examples for each type
   - Permission model explanation (allow/deny lists, risk levels)
   - Guidelines for identifying HIGH risk tools (destructive operations, external communications, code execution)
   - Chapter directory structure conventions
   - Best practices for role separation (principle of least privilege)
   - Security analysis guidelines for detecting malicious prompts/scripts
   - Reference to the lodge CHARTER.md for behavioral constraints

8. **App: `apps/filesystem/package.json`:**
   ```json
   {
     "name": "@{{projectScope}}/app-filesystem",
     "version": "1.0.0",
     "chapter": {
       "type": "app",
       "transport": "stdio",
       "command": "npx",
       "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/mason"],
       "tools": ["read_file", "write_file", "list_directory", "create_directory"],
       "capabilities": ["tools"]
     }
   }
   ```
   Note: The filesystem root is `/home/mason` (the agent's home directory) to allow access to both the workspace and the lodge mount.

**Acceptance criteria:**
- `clawmasons chapter init --name acme.initiate --template initiate` scaffolds a complete chapter workspace.
- All `{{projectScope}}` placeholders are correctly substituted.
- `clawmasons chapter build` succeeds on the scaffolded workspace.
- The generated Dockerfile for the chapter-creator role uses `node:22-bookworm` and installs the specified apt packages.
- The `create-chapter` task prompt is comprehensive enough for an LLM to follow the workflow.

---

**REQ-009: CHARTER.md Template**

Create a CHARTER.md template at `packages/cli/templates/charter/CHARTER.md`.

**Content:**

The CHARTER.md establishes governance rules for all agents in the lodge:

- **Principle of Least Privilege:** Agents may only use tools explicitly permitted by their role.
- **No Exfiltration:** Agents must not send data to external services unless explicitly permitted by a task and approved by the user.
- **Destructive Action Approval:** Any action that deletes files, drops databases, or modifies production systems requires explicit user approval.
- **Transparency:** Agents must explain their reasoning before taking significant actions.
- **Containment:** Agents operate within their Docker container. They must not attempt to escape the container or access host resources beyond their declared mounts.
- **Credential Handling:** Agents must not log, print, or persist credential values. Credentials are injected via the credential-service and must only be used for their declared purpose.
- **Audit Trail:** All tool invocations are logged by the proxy. Agents must not attempt to circumvent logging.

**Acceptance criteria:**
- `clawmasons init` copies CHARTER.md to `LODGE_HOME/CHARTER.md`.
- The document is readable and provides clear governance guidelines.
- The document is not overwritten if it already exists.

---

**REQ-010: NPM Placeholder Packages**

Publish minimal placeholder packages to npm to prevent namespace hijacking.

**Packages to publish:**

| Package Name | Type |
|---|---|
| `clawmasons` | COMING SOON — main CLI package (will later contain the actual CLI) |
| `@clawmasons/acp` | Placeholder |
| `@clawmasons/mcp-proxy` | Placeholder |
| `clawmasons-ai` | Placeholder |
| `clawmasons-com` | Placeholder |
| `clawmasons.ai` | Placeholder (if npm allows dots) |
| `clawmasons.com` | Placeholder (if npm allows dots) |
| `clawmason` | Placeholder |
| `clawmason.ai` | Placeholder (if npm allows dots) |
| `clawmason.com` | Placeholder (if npm allows dots) |
| `@grand-lodge.public/role-chapter-creator` | Placeholder |

**Placeholder package structure (for each):**

```
<package-name>/
  package.json
  README.md
```

**package.json:**
```json
{
  "name": "<package-name>",
  "version": "0.0.1",
  "description": "This is a placeholder package. See https://github.com/clawmasons for the official project.",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/clawmasons/chapter"
  },
  "keywords": ["clawmasons", "placeholder"]
}
```

**README.md:**
```markdown
# <package-name>

This is a placeholder package for the Clawmasons project.

For the official CLI, install: `npm install clawmasons`

Learn more: https://github.com/clawmasons
```

**COMING SOON package (clawmasons):**

Same structure but with a more informative README:
```markdown
# clawmasons

AI agent packaging, governance, and runtime orchestration.

Coming soon. Follow https://github.com/clawmasons for updates.
```

**Location in repo:** `packages/placeholders/<package-name>/` — NOT part of the monorepo workspaces. Published manually or via a dedicated script.

**Acceptance criteria:**
- Each placeholder package can be published via `npm publish` from its directory.
- Each placeholder's README directs users to the official `clawmasons` package.
- The `clawmasons` package README says "Coming Soon" with a link to the GitHub repo.
- Placeholder packages are NOT included in the monorepo's `workspaces` array.
- A publish script (`scripts/publish-placeholders.sh`) iterates over all placeholder directories and publishes them.

---

### P1 — Nice-to-Have

---

**REQ-011: `--chapter` and `--role` Auto-Resolution for `clawmasons acp`**

When `clawmasons acp` is called without `--chapter` or `--role`, attempt to auto-detect from the current directory:

1. If CWD contains `.clawmasons/chapter.json`, read the chapter name.
2. If the chapter has exactly one role, use it.
3. If the chapter has multiple roles, prompt the user to select.

This preserves backward compatibility with the current `run-acp-agent` behavior where the command is run from within a chapter workspace.

---

**REQ-012: `clawmasons acp` Help Text with ACP Client Config Example**

The `--help` output for `clawmasons acp` should include a complete ACP client configuration example showing:
- The `agent_servers` JSON block
- All supported environment variables
- The bootstrap flow explanation

This extends the existing help epilog from `run-acp-agent` (currently at `packages/cli/src/cli/commands/run-acp-agent.ts` lines 60-89).

---

**REQ-013: `create-chapter` Skill — Security Analysis**

The `create-chapter` skill's SKILL.md should include a section on security analysis:

- How to identify malicious MCP tool configurations (e.g., tools that execute arbitrary shell commands, tools with overly broad file access)
- How to detect prompt injection in skill/task prompts
- Guidelines for quarantining suspicious configurations into HIGH risk roles
- Red flags: `eval()`, `exec()`, unrestricted filesystem access, network access to unknown hosts

This is referenced by the `create-chapter` task prompt and used by the agent when analyzing a project's existing tools.

---

## 7. Sequence Diagrams

### 7.1 `clawmasons acp --chapter initiate` — Full Bootstrap Flow

```
User                     clawmasons CLI              CLAWMASONS_HOME              LODGE_HOME
  │                           │                           │                           │
  │  clawmasons acp           │                           │                           │
  │  --chapter initiate       │                           │                           │
  │  --role chapter-creator   │                           │                           │
  │──────────────────────────►│                           │                           │
  │                           │                           │                           │
  │              ┌────────────┴────────────┐              │                           │
  │              │ 1. Resolve env vars:    │              │                           │
  │              │    CLAWMASONS_HOME      │              │                           │
  │              │    LODGE                │              │                           │
  │              │    LODGE_HOME           │              │                           │
  │              └────────────┬────────────┘              │                           │
  │                           │                           │                           │
  │                           │  Run `clawmasons init`    │                           │
  │                           │──────────────────────────►│                           │
  │                           │                           │                           │
  │                           │  Check config.json        │                           │
  │                           │  Lodge exists?             │                           │
  │                           │◄──────────────────────────│                           │
  │                           │                           │                           │
  │              ┌────────────┴────────────┐              │                           │
  │              │ [IF new lodge]          │              │                           │
  │              │ Create LODGE_HOME       │              │                           │
  │              │ Copy CHARTER.md         │              │                           │
  │              │ Create chapters/        │              │                           │
  │              │ Update config.json      │              │                           │
  │              └────────────┬────────────┘              │                           │
  │                           │                           │                           │
  │                           │  Check chapters/initiate  │                           │
  │                           │──────────────────────────►│──────────────────────────►│
  │                           │                           │                           │
  │              ┌────────────┴────────────┐              │                           │
  │              │ [IF no initiate chapter]│              │                           │
  │              │ chapter init --template │              │                           │
  │              │   initiate (in          │              │                           │
  │              │   LODGE_HOME/chapters/  │              │                           │
  │              │   initiate/)            │              │                           │
  │              │ npm install             │              │                           │
  │              │ chapter build           │              │                           │
  │              └────────────┬────────────┘              │                           │
  │                           │                           │                           │
  │              ┌────────────┴────────────┐              │                           │
  │              │ Standard ACP startup:   │              │                           │
  │              │ 1. Resolve role         │              │                           │
  │              │    (auto init-role)     │              │                           │
  │              │ 2. Start infra          │              │                           │
  │              │    (proxy + cred-svc)   │              │                           │
  │              │ 3. Start ACP bridge     │              │                           │
  │              └────────────┬────────────┘              │                           │
  │                           │                           │                           │
  │  Ready on port 3001      │                           │                           │
  │◄──────────────────────────│                           │                           │
  │                           │                           │                           │
  │  ACP client connects      │                           │                           │
  │  session/new { cwd: X }   │                           │                           │
  │──────────────────────────►│                           │                           │
  │                           │                           │                           │
  │              ┌────────────┴────────────┐              │                           │
  │              │ Start agent container   │              │                           │
  │              │ Mount X:/workspace      │              │                           │
  │              │ Mount LODGE_HOME:/home/ │              │                           │
  │              │   mason/<lodge>         │              │                           │
  │              └────────────┬────────────┘              │                           │
  │                           │                           │                           │
  │  Agent ready              │                           │                           │
  │◄──────────────────────────│                           │                           │
```

### 7.2 `clawmasons init` Flow

```
User                     clawmasons CLI              Filesystem
  │                           │                        │
  │  clawmasons init          │                        │
  │  --lodge acme             │                        │
  │──────────────────────────►│                        │
  │                           │                        │
  │              ┌────────────┴──────────┐             │
  │              │ Resolve:              │             │
  │              │ CLAWMASONS_HOME       │             │
  │              │ LODGE = "acme"        │             │
  │              │ LODGE_HOME            │             │
  │              └────────────┬──────────┘             │
  │                           │                        │
  │                           │ mkdir CLAWMASONS_HOME  │
  │                           │ (if needed)            │
  │                           │───────────────────────►│
  │                           │                        │
  │                           │ Read config.json       │
  │                           │◄───────────────────────│
  │                           │                        │
  │              ┌────────────┴──────────┐             │
  │              │ Lodge "acme" exists   │             │
  │              │ AND chapters/ exists? │             │
  │              │ YES → skip            │             │
  │              │ NO → continue         │             │
  │              └────────────┬──────────┘             │
  │                           │                        │
  │                           │ mkdir LODGE_HOME       │
  │                           │ mkdir chapters/        │
  │                           │ copy CHARTER.md        │
  │                           │ update config.json     │
  │                           │───────────────────────►│
  │                           │                        │
  │  Lodge "acme" initialized │                        │
  │◄──────────────────────────│                        │
```

### 7.3 Agent Container with Role Mounts

```
Docker Compose                 Agent Container
     │                              │
     │  docker run                  │
     │  -v /projects/myapp:         │
     │    /home/mason/workspace/    │
     │    project                   │
     │  -v /Users/dev/acme:         │
     │    /home/mason/acme          │
     │ ─────────────────────────── ►│
     │                              │
     │                   ┌──────────┴──────────┐
     │                   │ /home/mason/         │
     │                   │   workspace/         │
     │                   │     project/  ← CWD  │
     │                   │   acme/       ← lodge │
     │                   │     CHARTER.md       │
     │                   │     chapters/        │
     │                   │       initiate/      │
     │                   │       new-chapter/   │
     │                   └──────────┬──────────┘
     │                              │
     │                   Agent can read/write   │
     │                   to both mounted dirs   │
```

---

## 8. Use Cases

### UC-1: First-Time User — Zero to Working Agent

**Actor:** Developer new to clawmasons

**Precondition:** Node.js and Docker installed. No `~/.clawmasons` directory exists.

**Flow:**
1. Developer configures ACP client (e.g., Zed) with the clawmasons agent server config block (REQ-004 example), setting `LODGE=myproject` and `OPEN_ROUTER_KEY=$OPENROUTER_API_KEY`.
2. ACP client spawns `npx clawmasons acp --chapter initiate --role chapter-creator --init-agent pi`.
3. CLI resolves env vars: `CLAWMASONS_HOME=~/.clawmasons`, `LODGE=myproject`, `LODGE_HOME=~/.clawmasons/myproject`.
4. `clawmasons init` creates `~/.clawmasons/`, `config.json`, `~/.clawmasons/myproject/`, `CHARTER.md`, `chapters/`.
5. `chapter init --template initiate` scaffolds `~/.clawmasons/myproject/chapters/initiate/`.
6. `chapter build` generates Docker artifacts.
7. ACP startup: init-role, start infrastructure, start bridge on port 3001.
8. ACP client connects. Developer opens a project directory. `session/new` arrives with CWD.
9. Agent container starts with project CWD mounted at `/home/mason/workspace/project` and lodge at `/home/mason/myproject`.
10. Developer interacts with the chapter-creator agent, which analyzes the project and creates a new chapter.

**Postcondition:** New chapter exists at `~/.clawmasons/myproject/chapters/<new-chapter>/`, built and ready for use.

### UC-2: Chapter Creator — Analyze Project and Create Chapter

**Actor:** Developer using the chapter-creator agent

**Precondition:** Initiate chapter is running. Developer has a project with MCP servers configured (e.g., in `.claude/settings.json` or `mcp.json`).

**Flow:**
1. Agent starts in the session. The `/create-chapter` task is available as a skill/command.
2. Developer asks the agent to create a chapter for their project.
3. Agent enters plan mode and:
   a. Scans the project directory for MCP server configurations, skill files, slash commands
   b. Identifies all tools exposed by each MCP server
   c. Assesses risk level of each tool (HIGH for destructive operations)
   d. Identifies missing OS dependencies needed for tools
4. Agent presents a plan:
   - Chapter name and structure
   - Apps to create (one per MCP server)
   - Tasks to create (one per slash command/workflow)
   - Skills to create (for knowledge/context artifacts)
   - Roles to create (with permission matrices)
   - Separate HIGH risk role if dangerous tools detected
   - OS dependencies to install via `apt-get`
5. Developer reviews and approves the plan.
6. Agent executes:
   a. Creates `LODGE_HOME/chapters/<name>/` with all package.json files
   b. Runs `clawmasons chapter build` to generate Docker artifacts
7. Agent tells developer to start a new ACP session to test the chapter.

**Postcondition:** New chapter with roles, apps, tasks, and skills exists and is built.

### UC-3: Existing User — Direct ACP Startup (No Bootstrap)

**Actor:** Developer with an existing chapter workspace

**Precondition:** Chapter workspace exists at `/projects/my-agents/` with agents and roles already defined. Lodge already initialized.

**Flow:**
1. Developer runs `clawmasons acp --role writer` from `/projects/my-agents/`.
2. No `--chapter initiate` flag — standard startup path.
3. CLI auto-detects the chapter from `.clawmasons/chapter.json` in CWD.
4. Standard ACP startup: init-role, infrastructure, bridge.
5. ACP client sends `session/new` with project CWD.

**Postcondition:** Agent running with the existing chapter's configuration.

### UC-4: Team Shared Lodge via Version Control

**Actor:** Team lead setting up a shared lodge

**Precondition:** Team uses a shared repo at `~/projects/acme/`.

**Flow:**
1. Team lead sets `LODGE_HOME=~/projects/acme/clawmasons-lodge` in their ACP client config.
2. Runs `clawmasons init --lodge acme --lodge-home ~/projects/acme/clawmasons-lodge`.
3. Lodge directory created with CHARTER.md.
4. Team lead creates chapters using the chapter-creator or manually.
5. Team lead commits `~/projects/acme/clawmasons-lodge/` to the repo.
6. Other team members clone, set the same `LODGE_HOME`, and use the pre-built chapters.

**Postcondition:** Lodge configuration is version-controlled and shared.

---

## 9. Open Questions

| # | Question | Owner | Blocking? | Resolution |
|---|----------|-------|-----------|------------|
| Q1 | Should `clawmasons` be the actual npm package with the CLI, or should the CLI remain in `@clawmasons/cli` with `clawmasons` as a thin wrapper? | Engineering | No | Recommend: `clawmasons` is the published package with the CLI binary. `@clawmasons/cli` becomes an internal workspace package. |
| Q2 | npm package names with dots (e.g., `clawmasons.ai`) — does npm allow them? | Engineering | No | npm allows dots in package names. Verify during publish. |
| Q3 | Should the chapter-creator agent use `pi-coding-agent` as the only supported runtime, or should it be configurable? | Product | No | Configurable via `--init-agent`. Template provides `pi` as default. |
| Q4 | How should CHARTER.md be loaded into agent context? Via the skill system, or as a special mount? | Engineering | No | Via the skill system — create a `skill-charter` in the initiate template that references CHARTER.md. |
| Q5 | Should `clawmasons init` also run `chapter build` for the initiate chapter, or leave that to `clawmasons acp`? | Product | No | `clawmasons init` only creates the lodge. `clawmasons acp --chapter initiate` handles chapter creation and building. This keeps `init` fast and focused. |
| Q6 | When `clawmasons acp` is called with `--chapter initiate` but the chapter already exists and is built, should it check for template updates? | Engineering | No | No — idempotent. If the chapter exists and is built, skip. User can manually rebuild if needed. |

---

## 10. CLI Command Summary

### New Commands

| Command | Description |
|---|---|
| `clawmasons init` | Initialize a lodge (create LODGE_HOME, CHARTER.md, config.json) |
| `clawmasons agent <agent> <role>` | Run agent interactively (renamed from `chapter run-agent`) |
| `clawmasons acp --role <role>` | Start ACP endpoint (renamed from `chapter run-acp-agent`) |
| `clawmasons chapter <subcommand>` | Chapter workspace commands (groups existing commands) |

### Removed Commands

| Command | Replacement |
|---|---|
| `chapter` (binary) | `clawmasons` |
| `chapter run-agent` | `clawmasons agent` |
| `chapter run-acp-agent` | `clawmasons acp` |
| `chapter run-init` | Removed (was deprecated) |
| `chapter docker-init` | Removed (internal to `build`) |

### New `clawmasons acp` Options

| Option | Description |
|---|---|
| `--chapter <name>` | Chapter to use. `initiate` triggers bootstrap flow. |
| `--init-agent <name>` | Agent for initiate chapter (default: `pi`). |

---

## 11. File Impact Summary

### New Files

| File | Description |
|---|---|
| `packages/cli/templates/charter/CHARTER.md` | Lodge charter template |
| `packages/cli/templates/initiate/` | Initiate chapter template (full directory) |
| `packages/cli/src/cli/commands/lodge-init.ts` | `clawmasons init` command implementation |
| `packages/placeholders/*/` | NPM placeholder packages (outside workspaces) |
| `scripts/publish-placeholders.sh` | Script to publish all placeholder packages |

### Modified Files

| File | Change |
|---|---|
| `packages/cli/package.json` | Rename bin from `chapter` to `clawmasons` |
| `packages/cli/src/cli/index.ts` | Program name, command restructuring |
| `packages/cli/src/cli/commands/index.ts` | New registration structure with subcommands |
| `packages/cli/src/cli/commands/run-acp-agent.ts` | Add `--chapter`, `--init-agent` options; bootstrap flow |
| `packages/cli/src/cli/commands/run-agent.ts` | Rename registration (no logic change) |
| `packages/cli/src/generator/agent-dockerfile.ts` | Support `baseImage`, `aptPackages` from role |
| `packages/cli/src/generator/proxy-dockerfile.ts` | Update entrypoint from `chapter` to `clawmasons` |
| `packages/cli/src/acp/session.ts` | Support role mounts in compose generation |
| `packages/cli/src/cli/commands/init-role.ts` | Support role mounts in compose generation |
| `packages/shared/src/schemas/role.ts` | Add `mounts`, `baseImage`, `aptPackages` fields |
| `packages/shared/src/types.ts` | Add mount/baseImage/aptPackages to ResolvedRole |
| `packages/cli/src/runtime/home.ts` | Add `config.json` lodge registry support |
| `e2e/tests/helpers.ts` | Update `CHAPTER_BIN` path |
| `e2e/tests/*.test.ts` | Update CLI references |
| `bin/chapter.js` | Rename to `bin/clawmasons.js` |

### Unchanged (but important context)

| File | Why |
|---|---|
| `packages/credential-service/src/resolver.ts` | Lookup order already correct (session > env > keychain > dotenv) |
| `packages/credential-service/src/cli.ts` | Already reads `CREDENTIAL_SESSION_OVERRIDES` |
| `packages/proxy/` | No changes needed |
| `packages/agent-entry/` | No changes needed |
| `packages/mcp-agent/` | No changes needed |
