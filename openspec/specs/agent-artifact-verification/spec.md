# Capability: Agent Artifact Verification

## Purpose

Verify that `mason run` materializes the correct agent-native artifacts (tasks, skills, MCP configs, launch configs) for each supported agent type, including cross-source translation scenarios. Provides shared test helpers and per-agent e2e tests.

---

## Requirements

### Requirement: Shared artifact verification helper
The `@clawmasons/agent-sdk/testing` module SHALL export a `testWorkspaceArtifacts` function that verifies materialized files exist and contain expected content in the docker build directory.

#### Scenario: Verify build workspace files exist
- **WHEN** `testWorkspaceArtifacts(workspaceDir, "writer", "claude-code-agent", { buildFiles: [{ path: ".claude/commands/take-notes.md", contains: "Take Notes" }] })` is called
- **THEN** the function SHALL assert that `.mason/docker/writer/claude-code-agent/build/workspace/project/.claude/commands/take-notes.md` exists and contains "Take Notes"

#### Scenario: Verify home directory files exist
- **WHEN** `testWorkspaceArtifacts(workspaceDir, "writer", "claude-code-agent", { homeFiles: [{ path: ".claude.json", contains: "mcpServers" }] })` is called
- **THEN** the function SHALL assert that `.mason/docker/writer/claude-code-agent/home/.claude.json` exists and contains "mcpServers"

#### Scenario: Verify workspace files exist
- **WHEN** `testWorkspaceArtifacts(workspaceDir, "writer", "claude-code-agent", { workspaceFiles: [{ path: "agent-launch.json" }] })` is called
- **THEN** the function SHALL assert that `.mason/docker/writer/claude-code-agent/workspace/agent-launch.json` exists

#### Scenario: Missing file throws descriptive error
- **WHEN** a checked file does not exist
- **THEN** the function SHALL throw an error including the full expected path and the artifact category (build/home/workspace)

#### Scenario: Content mismatch throws descriptive error
- **WHEN** a file exists but does not contain the expected string
- **THEN** the function SHALL throw an error including the expected string and a truncated preview of actual file contents

---

### Requirement: Claude-code-agent native source artifact verification
An e2e test at `agents/claude-code-agent/tests/e2e/artifacts.test.ts` SHALL verify that running `mason run --role writer --agent claude` with the `claude-test-project` fixture materializes claude-native artifacts.

#### Scenario: Task materialized as claude slash command
- **WHEN** `mason run --role writer --agent claude` completes
- **THEN** `.mason/docker/writer/claude-code-agent/build/workspace/project/.claude/commands/take-notes.md` SHALL exist and contain "Take Notes"

#### Scenario: Skill materialized at claude skills path
- **WHEN** `mason run --role writer --agent claude` completes
- **THEN** `.mason/docker/writer/claude-code-agent/build/workspace/project/.claude/skills/markdown-conventions/SKILL.md` SHALL exist and contain "Markdown Conventions"

#### Scenario: MCP config materialized in home directory
- **WHEN** `mason run --role writer --agent claude` completes
- **THEN** `.mason/docker/writer/claude-code-agent/home/.claude.json` SHALL exist and contain "mcpServers"

#### Scenario: Launch config present
- **WHEN** `mason run --role writer --agent claude` completes
- **THEN** `.mason/docker/writer/claude-code-agent/workspace/agent-launch.json` SHALL exist and contain "claude"

---

### Requirement: Codex-agent cross-source artifact verification
An e2e test at `agents/codex-agent/tests/e2e/artifacts.test.ts` SHALL verify that running `mason run --role writer --agent codex --source claude` translates claude-format tasks and skills into codex-native format.

#### Scenario: Claude task translated to codex prompt file
- **WHEN** `mason run --role writer --agent codex --source claude` completes
- **THEN** `.mason/docker/writer/codex-agent/home/.codex/prompts/take-notes.md` SHALL exist and contain "take-notes"

#### Scenario: Claude task referenced in AGENTS.md
- **WHEN** `mason run --role writer --agent codex --source claude` completes
- **THEN** `.mason/docker/writer/codex-agent/build/workspace/project/AGENTS.md` SHALL exist and contain "/prompts:take-notes"

#### Scenario: Claude skill translated to codex agents/skills path
- **WHEN** `mason run --role writer --agent codex --source claude` completes
- **THEN** `.mason/docker/writer/codex-agent/build/workspace/project/.agents/skills/markdown-conventions/SKILL.md` SHALL exist and contain "Markdown Conventions"

#### Scenario: Skill referenced in AGENTS.md
- **WHEN** `mason run --role writer --agent codex --source claude` completes
- **THEN** `.mason/docker/writer/codex-agent/build/workspace/project/AGENTS.md` SHALL contain ".agents/skills/markdown-conventions/"

#### Scenario: MCP proxy config in TOML format
- **WHEN** `mason run --role writer --agent codex --source claude` completes
- **THEN** `.mason/docker/writer/codex-agent/home/.codex/config.toml` SHALL exist and contain "mcp_servers" and "bearer_token_env_var"

#### Scenario: Launch config present
- **WHEN** `mason run --role writer --agent codex --source claude` completes
- **THEN** `.mason/docker/writer/codex-agent/workspace/agent-launch.json` SHALL exist and contain "codex"

---

### Requirement: Pi-coding-agent cross-source artifact verification
An e2e test at `agents/pi-coding-agent/tests/e2e/artifacts.test.ts` SHALL verify that running `mason run --role writer --agent pi --source claude` translates claude-format tasks and skills into pi-native format.

#### Scenario: Claude task translated to pi registerCommand
- **WHEN** `mason run --role writer --agent pi --source claude` completes
- **THEN** `.mason/docker/writer/pi-coding-agent/build/workspace/project/.pi/extensions/mason-mcp/index.ts` SHALL exist and contain `registerCommand("take-notes"`

#### Scenario: MCP tools registered dynamically
- **WHEN** `mason run --role writer --agent pi --source claude` completes
- **THEN** `.mason/docker/writer/pi-coding-agent/build/workspace/project/.pi/extensions/mason-mcp/index.ts` SHALL contain "registerTool("

#### Scenario: Extension package metadata present
- **WHEN** `mason run --role writer --agent pi --source claude` completes
- **THEN** `.mason/docker/writer/pi-coding-agent/build/workspace/project/.pi/extensions/mason-mcp/package.json` SHALL exist and contain "mason-mcp"

#### Scenario: Claude skill translated to pi skills path
- **WHEN** `mason run --role writer --agent pi --source claude` completes
- **THEN** `.mason/docker/writer/pi-coding-agent/build/workspace/project/skills/markdown-conventions/SKILL.md` SHALL exist and contain "Markdown Conventions"

#### Scenario: MCP proxy config in pi JSON format
- **WHEN** `mason run --role writer --agent pi --source claude` completes
- **THEN** `.mason/docker/writer/pi-coding-agent/build/workspace/project/.pi/mcp.json` SHALL exist and contain "mcpServers" and "mason"

#### Scenario: LLM settings materialized
- **WHEN** `mason run --role writer --agent pi --source claude` completes
- **THEN** `.mason/docker/writer/pi-coding-agent/build/workspace/project/.pi/settings.json` SHALL exist

#### Scenario: Role instructions materialized as system prompt
- **WHEN** `mason run --role writer --agent pi --source claude` completes and the role has `instructions:` set
- **THEN** `.mason/docker/writer/pi-coding-agent/build/workspace/project/.pi/APPEND_SYSTEM.md` SHALL exist and contain "note-taking assistant"

#### Scenario: Launch config present
- **WHEN** `mason run --role writer --agent pi --source claude` completes
- **THEN** `.mason/docker/writer/pi-coding-agent/workspace/agent-launch.json` SHALL exist and contain "pi"
