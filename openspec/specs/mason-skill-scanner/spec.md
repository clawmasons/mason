## Purpose

Create a built-in Mason skill that scans a project's existing configuration and proposes a ROLE.md capturing the current setup as a portable role definition. Implements scanner utilities for discovering skills, commands, MCP server configs, and system prompts, plus a proposer that generates valid, parseable ROLE.md files with least-privilege permissions.

## Requirements

### Requirement: Project Scanner

The system SHALL scan a project directory for existing agent configuration across all registered dialects and return a structured result.

#### Scenario: Discover skills in Claude directory
- **GIVEN** a project with `.claude/skills/my-skill/SKILL.md`
- **WHEN** `scanProject(projectDir)` is called
- **THEN** the result contains a skill entry with `name: "my-skill"`, the absolute path, and `dialect: "claude-code-agent"`

#### Scenario: Discover commands in Claude directory
- **GIVEN** a project with `.claude/commands/deploy.md`
- **WHEN** `scanProject(projectDir)` is called
- **THEN** the result contains a command entry with `name: "deploy"` and `dialect: "claude-code-agent"`

#### Scenario: Discover MCP servers from settings.json
- **GIVEN** a project with `.claude/settings.json` containing `mcpServers: { "github": { "command": "npx", "args": ["-y", "@mcp/github"] } }`
- **WHEN** `scanProject(projectDir)` is called
- **THEN** the result contains an MCP server entry with `name: "github"`, `command: "npx"`, and `args: ["-y", "@mcp/github"]`

#### Scenario: Merge settings.json and settings.local.json
- **GIVEN** a project with `.claude/settings.json` containing one MCP server and `.claude/settings.local.json` containing a different MCP server
- **WHEN** `scanProject(projectDir)` is called
- **THEN** both servers appear in the result, with local settings taking precedence for conflicts

#### Scenario: Read system prompt from CLAUDE.md
- **GIVEN** a project with a `CLAUDE.md` file containing instructions
- **WHEN** `scanProject(projectDir)` is called
- **THEN** the result's `systemPrompt` field contains the file content

#### Scenario: Handle missing directories gracefully
- **GIVEN** a project with no agent directories (no `.claude/`, `.codex/`, etc.)
- **WHEN** `scanProject(projectDir)` is called
- **THEN** the result contains empty arrays for skills, commands, and mcpServers, and `systemPrompt` is undefined

#### Scenario: Discover across multiple dialects
- **GIVEN** a project with skills in both `.claude/skills/` and `.codex/skills/`
- **WHEN** `scanProject(projectDir)` is called
- **THEN** skills from both directories are included with their respective dialect identifiers

#### Scenario: Discover commands in subdirectories
- **GIVEN** a project with `.claude/commands/opsx/deploy.md`
- **WHEN** `scanProject(projectDir)` is called
- **THEN** the result contains a command entry with `name: "opsx/deploy"`

### Requirement: ROLE.md Proposer

The system SHALL generate a valid ROLE.md string from scanner results.

#### Scenario: Generate valid ROLE.md from scan result
- **GIVEN** a `ScanResult` with skills, commands, and MCP servers
- **WHEN** `proposeRoleMd(scanResult)` is called
- **THEN** the output is a valid ROLE.md string with YAML frontmatter and markdown body

#### Scenario: Proposed ROLE.md parses correctly
- **GIVEN** a generated ROLE.md from the proposer
- **WHEN** the ROLE.md is placed at `.<agent>/roles/<name>/ROLE.md` and parsed with `readMaterializedRole()`
- **THEN** the parse succeeds and returns a valid `Role`

#### Scenario: Minimal permissions (least-privilege)
- **GIVEN** a `ScanResult` with MCP servers
- **WHEN** `proposeRoleMd(scanResult)` is called
- **THEN** each `mcp` entry has an empty `tools.allow` array (no tools granted by default)

#### Scenario: Extract credentials from MCP server env
- **GIVEN** a `ScanResult` with an MCP server that has `env: { "GITHUB_TOKEN": "" }`
- **WHEN** `proposeRoleMd(scanResult)` is called
- **THEN** the `credentials` field in the ROLE.md includes `"GITHUB_TOKEN"`

#### Scenario: Default container ignore paths
- **GIVEN** any `ScanResult`
- **WHEN** `proposeRoleMd(scanResult)` is called
- **THEN** the `container.ignore.paths` includes `.mason/`, `.claude/`, and `.env`

#### Scenario: Custom role name and description
- **GIVEN** a `ScanResult`
- **WHEN** `proposeRoleMd(scanResult, { roleName: "my-role", description: "My custom role" })` is called
- **THEN** the frontmatter contains `name: my-role` and `description: My custom role`

#### Scenario: System prompt in markdown body
- **GIVEN** a `ScanResult` with `systemPrompt: "You are a helpful assistant."`
- **WHEN** `proposeRoleMd(scanResult)` is called
- **THEN** the markdown body after the frontmatter contains "You are a helpful assistant."

### Requirement: Mason SKILL.md

The system SHALL provide a `skills/mason/SKILL.md` that defines the AI-powered skill for project analysis and ROLE.md generation.

#### Scenario: Skill file exists and is well-formed
- **GIVEN** the skills/mason/ directory
- **THEN** `SKILL.md` exists and contains instructions for the AI to scan projects and propose roles

#### Scenario: Template file exists
- **GIVEN** the skills/mason/ directory
- **THEN** `templates/role-template.md` exists with a reference ROLE.md template

### Requirement: Module Exports

The mason module SHALL be exported from `@clawmasons/shared`.

#### Scenario: Scanner is importable
- **WHEN** `import { scanProject } from "@clawmasons/shared"` is used
- **THEN** the import resolves successfully

#### Scenario: Proposer is importable
- **WHEN** `import { proposeRoleMd } from "@clawmasons/shared"` is used
- **THEN** the import resolves successfully
