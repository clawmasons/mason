# Tasks: Mason Skill — Project Scanner and ROLE.md Proposer

## Implementation Tasks

- [x] 1. Create scanner data types and utility
  - Define `ScanResult`, `DiscoveredSkill`, `DiscoveredCommand`, `DiscoveredMcpServer` interfaces
  - Implement `scanProject(projectDir: string): Promise<ScanResult>`
  - Scan all registered dialect directories for skills, commands, MCP configs
  - Parse `.claude/settings.json` and `.claude/settings.local.json` for MCP servers
  - Read `CLAUDE.md`, `AGENTS.md` for system prompt content
  - Handle missing directories/files gracefully (return empty arrays)

- [x] 2. Create proposer utility
  - Implement `proposeRoleMd(scanResult: ScanResult, options?): string`
  - Generate valid YAML frontmatter from discovered configuration
  - Map skills to `skills` field with relative paths
  - Map commands to `commands` field
  - Map MCP servers to `mcp_servers` with empty `tools.allow` (least-privilege)
  - Extract credentials from MCP server env keys with empty values
  - Include system prompt as markdown body
  - Add default container ignore paths

- [x] 3. Create shared module exports
  - Create `packages/shared/src/mason/index.ts` with public exports
  - Add mason exports to `packages/shared/src/index.ts`

- [x] 4. Create SKILL.md and supporting files
  - Create `skills/mason/SKILL.md` with AI instructions for project analysis
  - Create `skills/mason/templates/role-template.md` as a reference template

- [x] 5. Write scanner unit tests
  - Test: scanner discovers skills in `.claude/skills/`
  - Test: scanner discovers commands in `.claude/commands/`
  - Test: scanner discovers MCP servers from settings.json
  - Test: scanner reads system prompt from CLAUDE.md
  - Test: scanner handles missing directories gracefully
  - Test: scanner handles multiple dialects (claude, codex)

- [x] 6. Write proposer unit tests
  - Test: proposer generates valid ROLE.md from scan result
  - Test: proposed ROLE.md parses correctly with readMaterializedRole
  - Test: proposed permissions are minimal (empty allow lists)
  - Test: credentials extracted from MCP server env
  - Test: default container ignore paths included
  - Test: custom role name and description in options

- [x] 7. Verify compilation and all tests pass
  - Run `npx tsc --noEmit`
  - Run `npx vitest run`
  - Run `npx eslint packages/shared/src/ packages/shared/tests/`
