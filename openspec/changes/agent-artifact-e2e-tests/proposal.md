## Why

The existing e2e tests in `mason-extensions` verify agent behavior (prompt responses, MCP tool usage, file creation) but never check that **materialized workspace artifacts** — tasks, skills, and MCP config — land in the correct agent-specific locations. A materializer regression could silently break agent capabilities without any e2e test catching it.

## What Changes

- Add a new e2e test file per agent in `mason-extensions` that verifies the docker build workspace contains correctly materialized artifacts
- Add a shared `testWorkspaceArtifacts(workspaceDir, role, agentType, checks)` helper function to `@clawmasons/agent-sdk/testing` that inspects `.mason/docker/<role>/<agent>/build/workspace/project/` and `.mason/docker/<role>/<agent>/home/`
- Each test runs `mason run` with the existing `claude-test-project` fixture (role: `writer`, source: `claude`) and then asserts artifact presence and content in the build directory

## Detailed Test Plan

### Shared Helper: `testWorkspaceArtifacts`

Location: `packages/agent-sdk/src/testing/index.ts` (in mason repo)

```ts
testWorkspaceArtifacts(workspaceDir, role, agentType, checks: {
  buildFiles?: Array<{ path: string; contains?: string }>;
  homeFiles?: Array<{ path: string; contains?: string }>;
  workspaceFiles?: Array<{ path: string; contains?: string }>;
})
```

Resolves paths relative to `.mason/docker/<role>/<agentType>/` and asserts each file exists (and optionally contains expected content).

---

### claude-code-agent: `agents/claude-code-agent/tests/e2e/artifacts.test.ts`

**Setup**: `copyFixtureWorkspace("claude-code-agent", { fixture: "claude-test-project" })`, run with `--role writer --agent claude`

This is the **native source** case: claude tasks/skills stay in claude format.

**Files checked in `.mason/docker/writer/claude-code-agent/build/workspace/project/`:**

| Path | Contains | What it proves |
|------|----------|---------------|
| `.claude/commands/take-notes.md` | `"Take Notes"` | Task materialized as claude slash command |
| `.claude/skills/markdown-conventions/SKILL.md` | `"Markdown Conventions"` | Skill materialized at correct `.claude/skills/` path |
| `.claude/settings.json` | `"permissions"` | Claude permissions config generated |

**Files checked in `.mason/docker/writer/claude-code-agent/home/`:**

| Path | Contains | What it proves |
|------|----------|---------------|
| `.claude.json` | `"mcpServers"` | MCP server config with proxy endpoint |

**Files checked in `.mason/docker/writer/claude-code-agent/workspace/`:**

| Path | Contains | What it proves |
|------|----------|---------------|
| `agent-launch.json` | `"claude"` | Launch config with correct command |

---

### codex-agent: `agents/codex-agent/tests/e2e/artifacts.test.ts`

**Setup**: `copyFixtureWorkspace("codex-agent", { fixture: "claude-test-project" })`, run with `--role writer --agent codex --source claude`

This tests **cross-source materialization**: claude-format tasks and skills are translated into codex-native format.

**Files checked in `.mason/docker/writer/codex-agent/build/workspace/project/`:**

| Path | Contains | What it proves |
|------|----------|---------------|
| `AGENTS.md` | `"/prompts:take-notes"` | Task referenced in AGENTS.md codex format |
| `AGENTS.md` | `".agents/skills/markdown-conventions/"` | Skill referenced in AGENTS.md |
| `AGENTS.md` | `"role: writer"` | Role name present |
| `.agents/skills/markdown-conventions/SKILL.md` | `"Markdown Conventions"` | Claude skill translated to codex `.agents/skills/` path |

**Files checked in `.mason/docker/writer/codex-agent/home/`:**

| Path | Contains | What it proves |
|------|----------|---------------|
| `.codex/config.toml` | `"mcp_servers"` | MCP proxy config in TOML format |
| `.codex/config.toml` | `"bearer_token_env_var"` | Auth configured for proxy |
| `.codex/prompts/take-notes.md` | `"take-notes"` | Claude task translated to codex prompt file in home dir |

**Files checked in `.mason/docker/writer/codex-agent/workspace/`:**

| Path | Contains | What it proves |
|------|----------|---------------|
| `agent-launch.json` | `"codex"` | Launch config with correct command |

---

### pi-coding-agent: `agents/pi-coding-agent/tests/e2e/artifacts.test.ts`

**Setup**: `copyFixtureWorkspace("pi-coding-agent", { fixture: "claude-test-project" })`, run with `--role writer --agent pi --source claude`

This tests **cross-source materialization**: claude-format tasks and skills are translated into pi-native format.

**Files checked in `.mason/docker/writer/pi-coding-agent/build/workspace/project/`:**

| Path | Contains | What it proves |
|------|----------|---------------|
| `.pi/mcp.json` | `"mcpServers"` | MCP proxy config in pi JSON format |
| `.pi/mcp.json` | `"mason"` | Proxy server entry present |
| `.pi/settings.json` | model ID string | LLM provider/model config |
| `.pi/extensions/mason-mcp/index.ts` | `'registerCommand("take-notes"'` | Claude task translated to pi registerCommand |
| `.pi/extensions/mason-mcp/index.ts` | `"registerTool("` | MCP tools registered dynamically |
| `.pi/extensions/mason-mcp/package.json` | `"mason-mcp"` | Extension metadata present |
| `skills/markdown-conventions/SKILL.md` | `"Markdown Conventions"` | Claude skill translated to pi `skills/` path |

**Files checked in `.mason/docker/writer/pi-coding-agent/workspace/`:**

| Path | Contains | What it proves |
|------|----------|---------------|
| `agent-launch.json` | `"pi"` | Launch config with correct command |

**Note**: `.pi/APPEND_SYSTEM.md` is only generated when the role has `instructions:` set. The `writer` role in the fixture has instructions, so this file should also be checked:

| Path | Contains | What it proves |
|------|----------|---------------|
| `.pi/APPEND_SYSTEM.md` | `"note-taking assistant"` | Role instructions materialized as system prompt |

---

## Capabilities

### New Capabilities
- `agent-artifact-verification`: E2E tests that verify materialized workspace artifacts (tasks, skills, MCP config) end up in agent-specific locations after `mason run`

### Modified Capabilities
_(none — existing e2e tests and materializer unit tests are unchanged)_

## Impact

- **mason-extensions repo**: New test files at `agents/*/tests/e2e/artifacts.test.ts` (3 files)
- **mason repo**: New helper `testWorkspaceArtifacts` added to `packages/agent-sdk/src/testing/index.ts`
- **Fixture**: Reuses existing `claude-test-project` fixture from `packages/agent-sdk/fixtures/` — no changes needed
- **CI**: New tests run under existing `test:e2e` script; require Docker + agent API keys (same as existing e2e tests)
