# Codex Agent — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** Clawmasons, Inc.

---

## 1. Executive Summary

This PRD introduces a new agent package for OpenAI's [Codex CLI](https://developers.openai.com/codex/cli) (`@openai/codex`) — a Rust-based terminal coding agent that uses OpenAI models. The package enables mason to run agents on Codex, giving chapters access to OpenAI's model lineup (o4-mini, GPT-4o, etc.) through a native, well-maintained CLI.

### What This Delivers

1. **Codex Agent Package** (`@clawmasons/codex-agent`): A new `AgentPackage` implementation at `packages/agents/codex-agent/` that materializes mason roles into Codex's native configuration format — TOML config, custom prompts, and skills.
2. **Task Conversion**: Mason tasks (from `--source claude`) are converted to Codex's `~/.codex/prompts/*.md` custom prompt files.
3. **Skill Conversion**: Mason skills are converted to Codex's `.agents/skills/<name>/SKILL.md` project-scoped skills.
4. **MCP Proxy Integration**: The mason MCP proxy is configured via `.codex/config.toml`'s `[mcp_servers.*]` section.
5. **Print Mode / JSON Streaming**: Full support for `codex exec --json` NDJSON output for `--print` mode.
6. **E2E Tests**: A working `agent.test.ts` using the shared `claude-test-project` fixture with `--source claude`, gated on `OPENAI_API_KEY`.
7. **Infrastructure Change**: A `buildPromptArgs` callback on `AgentPackage.printMode` to replace the hard-coded `-p` flag, enabling agents with different prompt argument conventions.

### Why Codex?

Codex CLI is OpenAI's official terminal agent. By adding it as a mason runtime:

1. **Access OpenAI models** — o4-mini, GPT-4o, and future OpenAI models directly.
2. **Native MCP support** — Codex has built-in MCP client support via config.toml, no extension hacks needed.
3. **AGENTS.md compatibility** — Codex reads AGENTS.md natively (same as Claude Code), simplifying instruction delivery.
4. **Active development** — Codex is under active development by OpenAI with frequent releases.

### Package Location

`packages/agents/codex-agent/` — a new `packages/agents/` directory. Existing agents (`claude-code-agent`, `pi-coding-agent`) will migrate here in a future PR.

---

## 2. Design Principles

- **Conversion-focused:** The materializer's primary job is converting mason role artifacts (tasks, skills, MCP servers) into Codex-native formats. Each conversion should use the most natural Codex mechanism.
- **Tasks → Prompts:** Mason tasks become `~/.codex/prompts/*.md` files — Codex's native reusable prompt system. Though deprecated in favor of skills, prompts are simpler, functional, and map 1:1 to mason tasks.
- **Skills → Skills:** Mason skills become `.agents/skills/<name>/SKILL.md` — Codex's newer project-scoped skill system. This is a natural fit since both mason and Codex have a skill concept.
- **TOML-native:** Codex uses TOML for configuration. The materializer generates proper TOML via `smol-toml`, not hand-crafted strings.
- **Testable end-to-end:** The agent must be provably correct via E2E tests against the shared fixture, not just unit tests of generated files.

---

## 3. Codex CLI Reference

### 3.1 Installation

```bash
npm install -g @openai/codex
```

### 3.2 Non-Interactive Execution

```bash
codex exec "what is 2+2?"
codex exec --full-auto --json "what is 2+2?"
```

Key differences from Claude Code and Pi:
- The prompt is a **positional argument** to `codex exec` (not a `-p` flag)
- `--full-auto` enables workspace-write sandbox + on-request approvals (needed for non-interactive container use)
- `--json` enables NDJSON streaming output

### 3.3 Configuration

Codex uses TOML configuration at two scopes:
- `~/.codex/config.toml` — User-level (global)
- `.codex/config.toml` — Project-scoped

Key config options:
```toml
model = "o4-mini"
sandbox = "workspace-write"

[mcp_servers.mason]
url = "http://mcp-proxy:9090/mcp"
bearer_token_env_var = "MCP_PROXY_TOKEN"
```

### 3.4 Custom Prompts

Location: `~/.codex/prompts/*.md` (global only, no project scope)

Format:
```markdown
---
description: "Take notes using markdown conventions"
---

[prompt body with task instructions]
```

Invoked as `/prompts:<filename>` in the Codex TUI. In `exec` mode, the prompt content is available as context.

### 3.5 Skills

Location: `.agents/skills/<name>/SKILL.md` (project-scoped)

Codex's newer skill system supports:
- Multi-file skill directories
- Project, user, and system scopes
- Implicit invocation based on task description

### 3.6 MCP Servers

Configured in `config.toml`:
```toml
[mcp_servers.my_server]
url = "https://example.com/mcp"
bearer_token_env_var = "MY_TOKEN"
```

Supports both STDIO (`command`, `args`, `env`) and HTTP (`url`, `bearer_token_env_var`) transports.

### 3.7 Instructions

Codex reads `AGENTS.md` files from:
- `~/.codex/AGENTS.md` — Global
- `./AGENTS.md` — Project-level
- `./<directory>/AGENTS.md` — Directory-specific

These are merged top-down hierarchically.

### 3.8 Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | API key for OpenAI (required) |

---

## 4. AgentPackage Configuration

### 4.1 Full Definition

```typescript
const codexAgent: AgentPackage = {
  name: "codex-agent",
  aliases: ["codex"],
  dialect: "codex",
  dialectFields: undefined,  // Codex has no ROLE.md-native task/skill field names

  materializer: codexMaterializer,

  dockerfile: {
    installSteps: `RUN npm install -g @openai/codex`,
  },

  acp: undefined,  // No ACP support initially

  runtime: {
    command: "codex",
    args: ["exec", "--full-auto"],
    credentials: [{ key: "OPENAI_API_KEY", type: "env" }],
    supportsAppendSystemPrompt: false,
  },

  // Codex has no native task file format for role sources.
  // When codex is the *target*, tasks come from --source and are
  // converted to ~/.codex/prompts/*.md by the materializer.
  tasks: undefined,

  // Codex has no native skill reading mechanism for role sources.
  skills: undefined,

  mcpNameTemplate: "${server}_${tool}",

  printMode: {
    jsonStreamArgs: ["--json"],
    buildPromptArgs(prompt: string): string[] {
      return [prompt];  // Positional argument, no flag
    },
    parseJsonStreamFinalResult(line: string): string | null {
      // OPEN: Exact NDJSON schema needs verification.
      // See §10.1 for details.
      const event = JSON.parse(line);
      if (event.type === "message" && event.role === "assistant") {
        return event.content ?? "";
      }
      return null;
    },
  },

  configSchema: undefined,
  credentialsFn: undefined,

  validate: (agent) => {
    const warnings = [];
    if (agent.llm) {
      warnings.push({
        category: "llm-config",
        message: "codex-agent ignores the llm field — Codex uses OpenAI only.",
      });
    }
    return { errors: [], warnings };
  },
};
```

### 4.2 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `dialect: "codex"` | Registry identification. Codex has no native ROLE.md convention. |
| `tasks: undefined` | Codex has no native task directory readable as a source. Tasks are written by the materializer, not read. |
| `skills: undefined` | Same — skills are written to `.agents/skills/` by the materializer. |
| `args: ["exec", "--full-auto"]` | `exec` is the non-interactive subcommand. `--full-auto` disables interactive approval prompts for container execution. |
| `mcpNameTemplate: "${server}_${tool}"` | Codex MCP tools use `server_tool` naming (no double-underscore prefix). |

---

## 5. Materializer Design

### 5.1 Generated Workspace Structure

```
/home/mason/
├── .codex/
│   ├── auth.json             # Copied from host ~/.codex/auth.json (if available)
│   ├── config.toml           # MCP servers, sandbox config
│   └── prompts/
│       └── take-notes.md     # Task → Codex prompt conversion
├── workspace/
│   ├── AGENTS.md             # Role instructions
│   ├── .agents/
│   │   └── skills/
│   │       └── markdown-conventions/
│   │           └── SKILL.md  # Skill → Codex skill conversion
│   ├── notes/                # Working directory for MCP filesystem
│   └── agent-launch.json     # Agent-entry bootstrap config
```

### 5.2 `.codex/config.toml` — MCP & Runtime Config

```toml
# Generated by mason codex-agent materializer

[mcp_servers.mason]
url = "http://mcp-proxy:9090/mcp"
bearer_token_env_var = "MCP_PROXY_TOKEN"
```

The materializer generates this using `smol-toml`. The MCP server entry:
1. Points to the mason proxy endpoint
2. Uses the correct URL path (`/mcp` for streamable-http, `/sse` for SSE) based on proxy type
3. References the proxy token via `bearer_token_env_var` (Codex reads the env var at runtime)

### 5.3 `~/.codex/prompts/*.md` — Task Conversion

Mason tasks from `--source claude` (e.g., `.claude/commands/take-notes.md`) are converted to Codex custom prompt files.

**Input** (Claude format):
```markdown
Use the MCP filesystem tools to take notes.
Create files in the notes/ directory.
```

**Output** (`~/.codex/prompts/take-notes.md`):
```markdown
---
description: "Take notes using MCP filesystem tools"
---

## Role Context
You are operating as role: writer

## Available MCP Tools
The following tools are available via the mason MCP server:
- mason_filesystem_read_file
- mason_filesystem_write_file
- mason_filesystem_list_directory

## Required Skills
See .agents/skills/markdown-conventions/ for formatting rules.

## Task
Use the MCP filesystem tools to take notes.
Create files in the notes/ directory.
```

The materializer:
1. Reads tasks via `collectAllTasks(agent.roles)`
2. Rewrites MCP tool references using `mcpNameTemplate`
3. Adds role context (role name, permitted tools)
4. Adds skill references
5. Writes each task as `~/.codex/prompts/{taskName}.md` with YAML frontmatter

### 5.4 `.agents/skills/<name>/SKILL.md` — Skill Conversion

Mason skills are converted to Codex's project-scoped skill format.

**Input** (Mason format at `.claude/skills/markdown-conventions/SKILL.md`):
```markdown
---
name: markdown-conventions
description: Markdown formatting conventions
---

Use kebab-case file names with date prefixes...
```

**Output** (`.agents/skills/markdown-conventions/SKILL.md`):
```markdown
---
name: markdown-conventions
description: Markdown formatting conventions
---

Use kebab-case file names with date prefixes...
```

The skill format is already markdown with YAML frontmatter, so conversion is minimal — primarily a file copy with potential field mapping adjustments.

The materializer:
1. Reads skills via `collectAllSkills(agent.roles)`
2. Copies each skill's artifacts to `.agents/skills/{skillName}/`
3. Adjusts frontmatter fields if Codex expects different keys

### 5.5 `AGENTS.md` — Role Instructions

The materializer generates a workspace-level `AGENTS.md` with role instructions:

```markdown
# Agent Instructions

You are operating as a mason agent with the role: writer.

## Available Tasks
The following tasks are available as custom prompts:
- /prompts:take-notes — Take notes using MCP filesystem tools

## Available Skills
- markdown-conventions: See .agents/skills/markdown-conventions/

## MCP Tools
Tools are provided via the mason MCP server. Available tools:
- mason_filesystem_read_file
- mason_filesystem_write_file
- mason_filesystem_list_directory

Only use tools from this list.
```

### 5.6 `agent-launch.json`

Generated by `generateAgentLaunchJson()` (shared helper):

```json
{
  "command": "codex",
  "args": ["exec", "--full-auto", "--json", "what is 2+2?"],
  "credentials": [
    { "key": "OPENAI_API_KEY", "type": "env" }
  ]
}
```

Note: The prompt is appended as a positional argument (no `-p` flag). This is enabled by the `buildPromptArgs` callback (see §6).

### 5.7 Materializer Methods

```typescript
interface CodexMaterializer extends RuntimeMaterializer {
  // Generate workspace files (AGENTS.md, .agents/skills/, agent-launch.json)
  materializeWorkspace(options: MaterializeOptions): MaterializationResult;

  // Generate home directory files (.codex/config.toml, .codex/prompts/)
  materializeHome(options: MaterializeOptions): MaterializationResult;

  // No supervisor materialization needed
  materializeSupervisor?: undefined;
}
```

Unlike Claude Code (which copies existing home settings) and Pi (which has no home materialization), the Codex materializer **generates** home directory content:
- `.codex/config.toml` — MCP server configuration
- `.codex/prompts/*.md` — Task prompt files
- `.codex/auth.json` — Copied from the host's `~/.codex/auth.json` if it exists. This file contains Codex's cached authentication credentials (API key references, OAuth tokens). Copying it avoids requiring the user to re-authenticate inside the container. If the file is not present on the host, it is simply skipped — the agent falls back to the `OPENAI_API_KEY` environment variable.

---

## 6. Infrastructure Changes

### 6.1 `buildPromptArgs` Callback

**Problem:** The shared helper in `packages/agent-sdk/src/helpers.ts` hard-codes `-p` before the initial prompt:

```typescript
// Current code
args = [...(args ?? []), ...agentPkg.printMode.jsonStreamArgs, "-p", initialPrompt];
```

Codex `exec` takes the prompt as a positional argument — there is no `-p` flag.

**Solution:** Add a `buildPromptArgs` callback to `AgentPackage.printMode`:

```typescript
// In packages/agent-sdk/src/types.ts
printMode?: {
  jsonStreamArgs: string[];
  /** Build the prompt arguments for the command. Default: ["-p", prompt] */
  buildPromptArgs?: (prompt: string) => string[];
  parseJsonStreamFinalResult(line: string): string | null;
};
```

Update `generateAgentLaunchJson` in `packages/agent-sdk/src/helpers.ts`:

```typescript
if (printMode && agentPkg.printMode) {
  const promptArgs = agentPkg.printMode.buildPromptArgs
    ? agentPkg.printMode.buildPromptArgs(initialPrompt)
    : ["-p", initialPrompt];
  args = [...(args ?? []), ...agentPkg.printMode.jsonStreamArgs, ...promptArgs];
}
```

**Backward compatibility:** Existing agents (Claude, Pi) that do not define `buildPromptArgs` continue to use the default `["-p", prompt]` behavior. Optionally, Claude and Pi can be updated to define `buildPromptArgs` explicitly for clarity.

### 6.2 Files Modified

| File | Change |
|------|--------|
| `packages/agent-sdk/src/types.ts` | Add `buildPromptArgs` to `printMode` interface |
| `packages/agent-sdk/src/helpers.ts` | Update `generateAgentLaunchJson` to use callback |

---

## 7. Dockerfile Design

```dockerfile
FROM node:22-slim

# Install codex-agent runtime
RUN npm install -g @openai/codex

USER node
WORKDIR /home/node/workspace
COPY --chown=node:node workspace/ /home/node/workspace/
COPY --chown=node:node home/ /home/node/

CMD ["codex", "exec", "--full-auto"]
```

Key points:
- Installs `@openai/codex` globally via npm
- Copies workspace (AGENTS.md, .agents/skills/) and home (.codex/config.toml, .codex/prompts/) separately
- Copies `~/.codex/auth.json` from the host into `/home/mason/.codex/auth.json` if it exists. The materializer checks for the file at build time and conditionally includes it in the home directory. This provides cached authentication credentials so the container doesn't require a separate `OPENAI_API_KEY` env var if the user has already authenticated via `codex auth`
- Uses `codex exec --full-auto` as the default command
- No `DISABLE_AUTOUPDATER` needed (Codex doesn't auto-update in containers)

---

## 8. E2E Test Design

### 8.1 Test File

`packages/agents/codex-agent/tests/e2e/agent.test.ts`

### 8.2 Prerequisites

- Docker available
- `OPENAI_API_KEY` environment variable set
- Tests skip gracefully when either is missing

### 8.3 Fixture

Uses the shared `claude-test-project` fixture from `packages/agent-sdk/fixtures/`:

```typescript
const workspace = await copyFixtureWorkspace("codex-agent", {
  fixture: "claude-test-project",
});
```

The fixture contains:
- `ROLE.md` with role "writer", sources: ["claude"], tasks: ["take-notes"]
- `.claude/commands/take-notes.md` — task definition
- `.claude/skills/markdown-conventions/SKILL.md` — skill definition

### 8.4 Test Cases

**Test 1: Basic prompt execution**
```bash
mason run --agent codex --source claude --build -p "what is 2+2?"
```
- Verifies stdout contains "4"
- Verifies session log exists and contains expected NDJSON events
- Verifies process and Docker stopped cleanly

**Test 2: MCP tool usage via task**
```bash
mason run --role writer --agent codex --source claude --build \
  -p "use the take-notes task to write a file called test-file.md with content 'test-passed'"
```
- Verifies `notes/test-file.md` was created via MCP filesystem server
- Validates the full pipeline: task conversion → AGENTS.md → MCP proxy → tool execution

### 8.5 Skip Behavior

```typescript
const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

describe.skipIf(!hasOpenAIKey || !isDockerAvailable())(
  "codex-agent e2e",
  () => { /* tests */ }
);
```

---

## 9. Requirements

### P0 — Must-Have

**REQ-001: Codex Agent Package**

Implement a new `AgentPackage` for Codex CLI at `packages/agents/codex-agent/`.

Acceptance criteria:
- Given the package, when imported, then it exports a valid `AgentPackage` object with name `"codex-agent"` and alias `"codex"`.
- Given the registry, when looked up by `"codex-agent"` or `"codex"`, then the codex agent is returned.
- Given a member with `runtimes: ["codex-agent"]`, when `mason run` is invoked, then the codex materializer is used.

**REQ-002: Codex Materializer — MCP Configuration**

Generate `.codex/config.toml` with the mason MCP proxy configured.

Acceptance criteria:
- Given a role with MCP servers, when materialized, then `.codex/config.toml` contains a `[mcp_servers.mason]` section with the correct proxy URL and token env var.
- Given the config, when Codex reads it, then the MCP proxy is available as a tool provider.

**REQ-003: Codex Materializer — Task Conversion**

Convert mason tasks (from `--source claude`) to `~/.codex/prompts/*.md` files.

Acceptance criteria:
- Given a role with task "take-notes" sourced from `.claude/commands/take-notes.md`, when materialized, then `~/.codex/prompts/take-notes.md` exists with correct YAML frontmatter and prompt body.
- Given the prompt file, then MCP tool references are rewritten using the `mcpNameTemplate`.
- Given the prompt file, then role context (role name, permitted tools) is included.
- Given the prompt file, then skill references point to `.agents/skills/` paths.

**REQ-004: Codex Materializer — Skill Conversion**

Convert mason skills to `.agents/skills/<name>/SKILL.md`.

Acceptance criteria:
- Given a role with skill "markdown-conventions", when materialized, then `.agents/skills/markdown-conventions/SKILL.md` exists with the skill content.
- Given multiple skill artifacts (README.md, companion files), then all are copied to the skill directory.

**REQ-005: Codex Materializer — AGENTS.md Generation**

Generate a workspace-level `AGENTS.md` with role instructions.

Acceptance criteria:
- Given a role "writer" with tasks and skills, when materialized, then `AGENTS.md` contains role instructions, available task references, skill references, and MCP tool list.

**REQ-006: Print Mode / JSON Streaming**

Support `codex exec --json` for `--print` mode output.

Acceptance criteria:
- Given `mason run --agent codex -p "prompt"`, when executed, then codex runs with `codex exec --full-auto --json "prompt"`.
- Given NDJSON output from codex, when parsed, then the final result text is extracted and written to stdout.
- Given the `buildPromptArgs` callback, then the prompt is appended as a positional argument (no `-p` flag).

**REQ-007: `buildPromptArgs` Infrastructure Change**

Add a `buildPromptArgs` callback to `AgentPackage.printMode` in the shared agent-sdk.

Acceptance criteria:
- Given an agent with `buildPromptArgs` defined, when `generateAgentLaunchJson` runs in print mode, then the callback is used to build prompt arguments.
- Given an agent without `buildPromptArgs`, when `generateAgentLaunchJson` runs, then the default `["-p", prompt]` behavior is preserved.
- Given existing claude-code-agent and pi-coding-agent tests, then they continue to pass without modification.

**REQ-008: E2E Tests**

Write working E2E tests using the shared `claude-test-project` fixture.

Acceptance criteria:
- Given `OPENAI_API_KEY` is set and Docker is available, when `npx vitest run --config packages/agents/codex-agent/vitest.e2e.config.ts` runs, then all tests pass.
- Given `OPENAI_API_KEY` is not set, when tests run, then they skip gracefully.
- Given the basic prompt test, when executed, then stdout contains the expected answer.
- Given the MCP tool test, when executed, then a file is created via the MCP filesystem server.

**REQ-009: Monorepo Integration**

Register the new package in the monorepo.

Acceptance criteria:
- Given the root `package.json`, then `packages/agents/*` is included in the workspaces glob.
- Given the CLI `package.json`, then `@clawmasons/codex-agent` is a dependency.
- Given `role-materializer.ts`, then `codexAgent` is included in `BUILTIN_AGENTS`.
- Given `npx tsc --noEmit`, then the build passes.
- Given `npx eslint src/ tests/`, then the linter passes.

### P1 — Nice-to-Have

**REQ-010: Codex as Source Dialect**

Support reading tasks and skills from a Codex project (when another agent uses `--source codex`).

Acceptance criteria:
- Given a project with `~/.codex/prompts/*.md` files, when scanned as source, then tasks are discovered.
- Given a project with `.agents/skills/*/SKILL.md`, when scanned as source, then skills are discovered.

**REQ-011: Model Override**

Allow specifying a non-default OpenAI model via configuration.

Acceptance criteria:
- Given a config with `model: "gpt-4o"`, when materialized, then `.codex/config.toml` includes `model = "gpt-4o"`.

### P2 — Future Consideration

**REQ-012: ACP Mode**

Add ACP (Agent Communication Protocol) support for Codex, enabling multi-agent collaboration.

**REQ-013: Codex Cloud Execution**

Support `codex cloud exec` for running agents in OpenAI's cloud sandbox.

**REQ-014: Agent Migration**

Move existing agents (`claude-code-agent`, `pi-coding-agent`) to `packages/agents/` to match the new directory structure.

---

## 10. Open Questions

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| Q1 | What is the exact NDJSON event schema from `codex exec --json`? Need to run locally and capture output to implement `parseJsonStreamFinalResult` correctly. | Engineering | Yes — blocks REQ-006 |
| Q2 | Does Codex respect `AGENTS.md` in `exec` mode (non-interactive), or only in TUI mode? If not, `developer_instructions` in config.toml may be needed instead. | Engineering | Yes — blocks REQ-005 |
| Q3 | Does `bearer_token_env_var` work for HTTP MCP servers in config.toml? Need to verify the exact field name and behavior. | Engineering | Yes — blocks REQ-002 |
| Q4 | Should `~/.codex/prompts/` tasks be available in `exec` mode, or are they TUI-only? If TUI-only, task content should be inlined into AGENTS.md instead. | Engineering | Yes — blocks REQ-003 |
| Q5 | Does `--full-auto` properly disable all interactive prompts in `exec` mode, or is `--sandbox danger-full-access` needed for container execution? | Engineering | No — can test during implementation |
| Q6 | Should the `smol-toml` dependency be added to `codex-agent` directly, or to `agent-sdk` as a shared utility? | Engineering | No |
| Q7 | Should existing agents (Claude, Pi) be updated to explicitly define `buildPromptArgs` for consistency, even though the default behavior is preserved? | Engineering | No |

---

## 11. Architecture

### 11.1 Package Structure

```
packages/agents/codex-agent/
  package.json
  tsconfig.json
  tsconfig.build.json
  vitest.e2e.config.ts
  src/
    index.ts              # AgentPackage export
    materializer.ts       # CodexMaterializer implementation
  tests/
    materializer.test.ts  # Unit tests for materializer output
    e2e/
      agent.test.ts       # E2E tests (OPENAI_API_KEY gated)
```

### 11.2 Registration Flow

```
packages/agents/codex-agent/src/index.ts
  └─ exports codexAgent: AgentPackage

packages/cli/src/materializer/role-materializer.ts
  └─ import codexAgent from "@clawmasons/codex-agent"
  └─ BUILTIN_AGENTS = [claudeCodeAgent, piCodingAgent, mcpAgent, codexAgent]

mason run --agent codex --source claude -p "prompt"
  ├─ getAgentFromRegistry("codex") → codexAgent
  ├─ codexMaterializer.materializeWorkspace() → AGENTS.md, .agents/skills/
  ├─ codexMaterializer.materializeHome() → .codex/config.toml, .codex/prompts/
  ├─ generateAgentLaunchJson() → agent-launch.json
  │    └─ buildPromptArgs("prompt") → ["prompt"] (positional)
  ├─ Docker build + run
  ├─ codex exec --full-auto --json "prompt"
  ├─ Parse NDJSON stream → extract final result
  └─ Write result to stdout
```

### 11.3 Comparison with Existing Agents

| Aspect | Claude Code | Pi Coding | Codex |
|--------|------------|-----------|-------|
| **Install** | `@anthropic-ai/claude-code` | `@mariozechner/pi-coding-agent` | `@openai/codex` |
| **Config Format** | JSON (`.claude.json`, `.claude/settings.json`) | JSON (`.pi/settings.json`, `.pi/mcp.json`) | TOML (`.codex/config.toml`) |
| **Task Location** | `.claude/commands/*.md` | `.pi/prompts/*.md` | `~/.codex/prompts/*.md` |
| **Task Format** | Markdown body | Markdown body | Markdown + YAML frontmatter |
| **Skill Location** | `.claude/skills/` | `skills/` | `.agents/skills/` |
| **MCP Config** | `.claude.json` mcpServers | `.pi/mcp.json` + extension | `.codex/config.toml` [mcp_servers] |
| **Instructions** | CLAUDE.md / AGENTS.md | AGENTS.md / system prompt | AGENTS.md |
| **Print Mode** | `--output-format stream-json --verbose -p` | `--mode json -p` | `exec --json` (positional prompt) |
| **Result Event** | `{ type: "result", result: "..." }` | `{ type: "agent_end", messages: [...] }` | TBD (see Q1) |
| **Credential** | `CLAUDE_CODE_OAUTH_TOKEN` | Provider-specific (`OPENROUTER_API_KEY`, etc.) | `OPENAI_API_KEY` |
| **Dialect Fields** | `tasks: "commands"` | `tasks: "prompts"` | None |
| **Home Materialization** | Yes (copies ~/.claude/) | No | Yes (generates .codex/) |

---

## Appendix A: Codex CLI Quick Reference

| Feature | Details |
|---------|---------|
| Package | `@openai/codex` |
| Binary | `codex` |
| Runtime | Rust (native binary) |
| Non-interactive | `codex exec "prompt"` |
| JSON output | `codex exec --json "prompt"` |
| Full auto | `--full-auto` (workspace-write + on-request) |
| MCP servers | `config.toml` `[mcp_servers.*]` |
| Custom prompts | `~/.codex/prompts/*.md` |
| Skills | `.agents/skills/<name>/SKILL.md` |
| Instructions | `AGENTS.md` files (hierarchical) |
| Config | TOML at `~/.codex/config.toml` and `.codex/config.toml` |
| Provider | OpenAI only |
| Default model | `o4-mini` |
| API key | `OPENAI_API_KEY` |

## Appendix B: Codex Custom Prompt Format

```markdown
---
description: "Short description shown in slash command menu"
argument-hint: "[FILE=<path>] [TITLE=<text>]"
---

Prompt body here.

Supports $1-$9 for positional args, $FILE for named args,
$ARGUMENTS for all args, $$ for literal $.
```

## Appendix C: Codex MCP Server Config Format

```toml
# STDIO transport
[mcp_servers.my_stdio_server]
command = "npx"
args = ["-y", "@my/mcp-server"]
env = { MY_VAR = "value" }

# HTTP transport
[mcp_servers.my_http_server]
url = "https://example.com/mcp"
bearer_token_env_var = "MY_TOKEN"
```

Fields: `command`, `args`, `env`, `cwd` (STDIO); `url`, `bearer_token_env_var`, `http_headers` (HTTP); `enabled`, `required`, `startup_timeout_sec`, `tool_timeout_sec`, `enabled_tools`, `disabled_tools` (universal).
