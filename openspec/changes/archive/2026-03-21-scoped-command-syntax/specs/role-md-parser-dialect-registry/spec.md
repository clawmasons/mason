## MODIFIED Requirements

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
