## Purpose

Parse ROLE.md files (YAML frontmatter + markdown body) and normalize agent-specific field names to generic ROLE_TYPES using a dialect registry. Implements `readMaterializedRole(rolePath: string): Promise<Role>` — the function that reads a local ROLE.md and produces a validated ROLE_TYPES object. Also provides an extensible dialect registry mapping agent directories to field name translations.

## Requirements

### Requirement: Dialect Registry
The system SHALL maintain a registry of agent dialects, mapping directory names to field name translations. Built-in dialects: Claude Code (`.claude/`, `commands`→`tasks`, `mcp_servers`→`apps`), Codex (`.codex/`, `instructions`→`tasks`, `mcp_servers`→`apps`), Aider (`.aider/`, `conventions`→`tasks`, `mcp_servers`→`apps`).

#### Scenario: Look up Claude Code dialect by directory
- **WHEN** `getDialectByDirectory("claude")` is called
- **THEN** returns a dialect entry with `name: "claude-code-agent"` and `fieldMapping.tasks: "commands"`

#### Scenario: Look up dialect by name
- **WHEN** `getDialect("codex")` is called
- **THEN** returns a dialect entry with `directory: "codex"` and `fieldMapping.tasks: "instructions"`

#### Scenario: Register a new dialect
- **WHEN** `registerDialect()` is called with a new dialect entry
- **THEN** the dialect is available via both `getDialect()` and `getDialectByDirectory()`

#### Scenario: Unknown dialect returns undefined
- **WHEN** `getDialect("unknown")` or `getDialectByDirectory("unknown")` is called
- **THEN** returns `undefined`

### Requirement: YAML Frontmatter Parsing
The system SHALL parse ROLE.md files with `---` delimited YAML frontmatter and a markdown body.

#### Scenario: Valid frontmatter and body
- **WHEN** a ROLE.md with `---\nname: test\n---\nBody text` is parsed
- **THEN** frontmatter contains `{name: "test"}` and body is `"Body text"`

#### Scenario: Missing opening delimiter
- **WHEN** a ROLE.md without leading `---` is parsed
- **THEN** a `RoleParseError` is thrown with the file path

#### Scenario: Unclosed frontmatter
- **WHEN** a ROLE.md with opening `---` but no closing `---` is parsed
- **THEN** a `RoleParseError` is thrown

#### Scenario: Invalid YAML
- **WHEN** a ROLE.md with malformed YAML in the frontmatter is parsed
- **THEN** a `RoleParseError` is thrown with the YAML error details

### Requirement: Dialect Detection
The system SHALL detect the agent dialect from the ROLE.md file's directory path. Expected pattern: `<project>/.<agent>/roles/<role-name>/ROLE.md`.

#### Scenario: Claude Code directory
- **WHEN** ROLE.md is at `project/.claude/roles/my-role/ROLE.md`
- **THEN** dialect is detected as `claude-code-agent`

#### Scenario: Codex directory
- **WHEN** ROLE.md is at `project/.codex/roles/my-role/ROLE.md`
- **THEN** dialect is detected as `codex`

#### Scenario: Unknown agent directory
- **WHEN** ROLE.md is at `project/.unknown-agent/roles/my-role/ROLE.md`
- **THEN** a `RoleParseError` is thrown listing known directories

#### Scenario: Not inside roles/ directory
- **WHEN** ROLE.md is not inside a `roles/` directory
- **THEN** a `RoleParseError` is thrown

### Requirement: Field Normalization

The system SHALL normalize agent-specific field names to generic ROLE_TYPES names using the dialect registry. Task references in dialect-specific fields SHALL use `:` as the scope delimiter (e.g., `opsx:apply`). The `adaptTask()` function SHALL split task names on the last `:` to extract scope and name:
- `"opsx:apply"` → `{ name: "apply", scope: "opsx", version: "0.0.0" }`
- `"ops:triage:label"` → `{ name: "label", scope: "ops:triage", version: "0.0.0" }`
- `"doc-cleanup"` → `{ name: "doc-cleanup", scope: "", version: "0.0.0" }` (no scope, bare name preserved)

#### Scenario: Claude Code — commands to tasks with scope extraction
- **WHEN** a Claude Code ROLE.md has `commands: ['opsx:apply', 'opsx:verify', 'doc-cleanup']`
- **THEN** the result has `tasks: [{name: 'apply', scope: 'opsx'}, {name: 'verify', scope: 'opsx'}, {name: 'doc-cleanup', scope: ''}]`

#### Scenario: Codex — instructions to tasks with scope extraction
- **WHEN** a Codex ROLE.md has `instructions: ['opsx:apply']`
- **THEN** the result has `tasks: [{name: 'apply', scope: 'opsx'}]`

#### Scenario: Aider — conventions to tasks with scope extraction
- **WHEN** an Aider ROLE.md has `conventions: ['opsx:apply']`
- **THEN** the result has `tasks: [{name: 'apply', scope: 'opsx'}]`

#### Scenario: Deeply nested scope extraction
- **WHEN** a ROLE.md has `commands: ['ops:triage:label-issue']`
- **THEN** the result has `tasks: [{name: 'label-issue', scope: 'ops:triage'}]`

#### Scenario: mcp_servers to apps
- **WHEN** a ROLE.md has `mcp_servers: [{name: 'github', tools: {allow: ['create_issue']}}]`
- **THEN** the result has `apps: [{name: 'github', tools: {allow: ['create_issue'], deny: []}}]`

### Requirement: Bundled Resource Discovery
The system SHALL scan the role directory for sibling files and produce `ResourceFile` entries with absolute and relative paths.

#### Scenario: Role with template files
- **WHEN** a role directory contains `templates/prd.md` alongside ROLE.md
- **THEN** resources includes `{relativePath: 'templates/prd.md', absolutePath: '<abs-path>'}`

#### Scenario: ROLE.md excluded from resources
- **WHEN** the role directory is scanned
- **THEN** ROLE.md itself is not included in the resources array

#### Scenario: Empty role directory
- **WHEN** a role directory contains only ROLE.md
- **THEN** resources is an empty array

### Requirement: Dependency Reference Resolution
The system SHALL resolve skill references — local paths relative to project root, package names as references.

#### Scenario: Scoped package reference
- **WHEN** skills contains `'@acme/skill-prd-writing'`
- **THEN** result has `{name: 'skill-prd-writing', ref: '@acme/skill-prd-writing'}`

#### Scenario: Local path reference
- **WHEN** skills contains `'./skills/my-skill'`
- **THEN** result has `{name: 'my-skill', ref: '<absolute-path>/skills/my-skill'}`

### Requirement: Zod Validation
The system SHALL validate the assembled role data through `roleSchema.parse()` before returning.

#### Scenario: Valid complete role
- **WHEN** a well-formed Claude Code ROLE.md is parsed
- **THEN** the result passes Zod validation and all defaults are applied

#### Scenario: Missing required description
- **WHEN** a ROLE.md is missing the `description` field
- **THEN** a `RoleParseError` is thrown before Zod validation
