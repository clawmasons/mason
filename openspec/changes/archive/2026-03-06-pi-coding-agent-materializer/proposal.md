## Why

The chapter framework can materialize workspaces for Claude Code but not for any other runtime. Pi-coding-agent is the first alternative runtime -- a provider-agnostic coding harness that supports OpenRouter, Anthropic, OpenAI, Google, Mistral, and more. Without a pi materializer, `chapter install` cannot produce a deployable workspace for members that declare `runtimes: ["pi-coding-agent"]`.

CHANGE 1 added the `llm` field to the schema. CHANGE 2 added validation rules. This change (CHANGE 3) implements the actual materializer that consumes those fields to generate a complete pi workspace.

## What Changes

- **Extract shared helpers** from `src/materializer/claude-code.ts` into `src/materializer/common.ts`:
  - `formatPermittedTools()` -- format a role's permitted tools as a readable list
  - `findRolesForTask()` -- find which roles contain a given task
  - `collectAllSkills()` -- collect all unique skills across roles
  - `collectAllTasks()` -- collect all unique tasks with their owning roles
  - `generateAgentsMd()` -- generate AGENTS.md content (identical format for both runtimes)
  - `generateSkillReadme()` -- generate skill README.md content

- **Update claude-code.ts** to import helpers from `common.ts` instead of local definitions

- **Create `src/materializer/pi-coding-agent.ts`** implementing `RuntimeMaterializer`:
  - `materializeWorkspace()` generates:
    - `AGENTS.md` -- agent identity and role docs (reuses shared helper)
    - `.pi/settings.json` -- pi project settings with model ID from `member.llm`
    - `.pi/extensions/chapter-mcp/package.json` -- extension package metadata
    - `.pi/extensions/chapter-mcp/index.ts` -- MCP proxy connection + task command registration
    - `skills/{name}/README.md` -- skill artifact manifests (reuses shared helper)
  - `generateDockerfile()` -- pi-coding-agent container (placeholder for CHANGE 4)
  - `generateComposeService()` -- Docker Compose service def (placeholder for CHANGE 4)

- **Create comprehensive tests** in `tests/materializer/pi-coding-agent.test.ts`

## Capabilities

### New Capabilities
- `pi-coding-agent-materializer`: Generates a complete pi-coding-agent workspace from a resolved member -- settings.json, extension with MCP proxy + task commands, AGENTS.md, and skills directory

### Modified Capabilities
- `claude-code-materializer`: Refactored to import shared helpers from `common.ts` (no behavioral change)

## Impact

- **New file:** `src/materializer/common.ts` -- extracted shared helpers
- **Modified:** `src/materializer/claude-code.ts` -- imports from common instead of local definitions
- **New file:** `src/materializer/pi-coding-agent.ts` -- full materializer implementation
- **New file:** `tests/materializer/pi-coding-agent.test.ts` -- comprehensive tests
- **Modified:** `tests/materializer/claude-code.test.ts` -- update imports if needed
- **No new dependencies**
