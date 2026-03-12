# Design: Mason Skill — Project Scanner and ROLE.md Proposer

## Architecture

### 1. Component Overview

The Mason skill consists of three layers:

```
skills/mason/SKILL.md          — AI skill definition (system prompt + instructions)
packages/shared/src/mason/     — Scanner + Proposer utilities
  scanner.ts                   — Project configuration discovery
  proposer.ts                  — ROLE.md generation from scan results
  index.ts                     — Public exports
```

### 2. Scanner (`packages/shared/src/mason/scanner.ts`)

The scanner discovers existing project configuration by examining well-known locations.

#### Data Types

```typescript
interface ScanResult {
  projectDir: string;
  skills: DiscoveredSkill[];
  commands: DiscoveredCommand[];
  mcpServers: DiscoveredMcpServer[];
  systemPrompt: string | undefined;
}

interface DiscoveredSkill {
  name: string;
  path: string;          // absolute path
  dialect: string;       // e.g., "claude-code"
}

interface DiscoveredCommand {
  name: string;
  path: string;          // absolute path
  dialect: string;
}

interface DiscoveredMcpServer {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  dialect: string;
}
```

#### Discovery Sources

| Source | Location | What's Discovered |
|--------|----------|-------------------|
| Skills | `.<agent>/skills/*/SKILL.md` | Skill names and paths |
| Commands | `.<agent>/commands/*.md` | Command names and paths |
| MCP Servers | `.<agent>/settings.json`, `.<agent>/settings.local.json` | Server configs (name, command, args, env) |
| System Prompt | `CLAUDE.md`, `AGENTS.md`, `.<agent>/AGENTS.md` | Existing instructions text |

The scanner iterates over all registered dialects from the dialect registry, checking each agent directory. This makes it automatically extensible when new dialects are registered.

#### Settings File Parsing

For Claude Code, the MCP server configuration lives in `.claude/settings.json` and `.claude/settings.local.json` under the `mcpServers` key:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "" }
    }
  }
}
```

The scanner reads both files and merges them (local overrides base), extracting server configurations.

### 3. Proposer (`packages/shared/src/mason/proposer.ts`)

The proposer takes a `ScanResult` and generates a ROLE.md string.

#### Function Signature

```typescript
function proposeRoleMd(
  scanResult: ScanResult,
  options?: {
    roleName?: string;
    description?: string;
    targetDialect?: string;  // defaults to "claude-code"
  }
): string;
```

#### Generation Rules

1. **Frontmatter Population:**
   - `name`: from `options.roleName` or derived from project directory name
   - `description`: from `options.description` or a placeholder
   - Skills: mapped from discovered skills (local paths as relative refs)
   - Commands: mapped to `commands` field (Claude dialect)
   - MCP Servers: mapped with tool permissions defaulting to empty allow lists (least-privilege)

2. **Permission Restriction (Least-Privilege):**
   - MCP servers get empty `tools.allow` lists by default — users must explicitly add tools
   - No `tools.deny` entries generated — allow-list approach is preferred
   - Credentials extracted from MCP server `env` keys that have empty string values

3. **System Prompt:**
   - If `CLAUDE.md` or `AGENTS.md` found, use its content as the markdown body
   - Otherwise, generate a minimal placeholder

4. **Container Requirements:**
   - No container packages inferred by default (conservative)
   - Standard ignore paths proposed: `.clawmasons/`, `.claude/`, `.env`

### 4. SKILL.md Definition

The `skills/mason/SKILL.md` is a standard Chapter skill file with a system prompt that instructs the AI agent to:

1. Use the scanner to inventory the project
2. Use the proposer to generate a draft ROLE.md
3. Present the draft to the user for review
4. Help the user customize permissions and settings

### 5. Validation

Proposed ROLE.md files are validated by:
1. Writing to a temp directory in the correct structure (`.<agent>/roles/<name>/ROLE.md`)
2. Parsing with `readMaterializedRole()` from Change 2
3. Confirming the result is a valid `RoleType`

### 6. File Structure

```
skills/mason/
├── SKILL.md                    — Skill definition and AI instructions
└── templates/
    └── role-template.md        — ROLE.md template for reference

packages/shared/src/mason/
├── scanner.ts                  — Project configuration scanner
├── proposer.ts                 — ROLE.md generator
└── index.ts                    — Public exports

packages/shared/tests/
├── mason-scanner.test.ts       — Scanner unit tests
└── mason-proposer.test.ts      — Proposer unit tests
```
