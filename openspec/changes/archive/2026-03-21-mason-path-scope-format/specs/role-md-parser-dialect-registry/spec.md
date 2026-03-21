## MODIFIED Requirements

### Requirement: Field Normalization

The system SHALL normalize agent-specific field names to generic ROLE_TYPES names using the dialect registry. Task references in dialect-specific fields SHALL accept both `:` and `/` as scope delimiters. The `adaptTask()` function SHALL normalize `/` to `:` before splitting on the last `:` to extract scope and name:
- `"opsx:apply"` → `{ name: "apply", scope: "opsx", version: "0.0.0" }`
- `"opsx/apply"` → `{ name: "apply", scope: "opsx", version: "0.0.0" }`
- `"ops:triage:label"` → `{ name: "label", scope: "ops:triage", version: "0.0.0" }`
- `"ops/triage/label"` → `{ name: "label", scope: "ops:triage", version: "0.0.0" }`
- `"ops/triage:label"` → `{ name: "label", scope: "ops:triage", version: "0.0.0" }` (mixed delimiters)
- `"doc-cleanup"` → `{ name: "doc-cleanup", scope: "", version: "0.0.0" }` (no scope)

#### Scenario: Colon-delimited task reference
- **WHEN** a ROLE.md has `commands: ['opsx:apply']`
- **THEN** the result has `tasks: [{name: 'apply', scope: 'opsx'}]`

#### Scenario: Slash-delimited task reference
- **WHEN** a ROLE.md has `commands: ['opsx/apply']`
- **THEN** the result has `tasks: [{name: 'apply', scope: 'opsx'}]`

#### Scenario: Mixed delimiter task reference
- **WHEN** a ROLE.md has `commands: ['ops/triage:label']`
- **THEN** the result has `tasks: [{name: 'label', scope: 'ops:triage'}]`

#### Scenario: Deeply nested slash-delimited reference
- **WHEN** a ROLE.md has `commands: ['ops/triage/label-issue']`
- **THEN** the result has `tasks: [{name: 'label-issue', scope: 'ops:triage'}]`

#### Scenario: Unscoped task reference unchanged
- **WHEN** a ROLE.md has `commands: ['doc-cleanup']`
- **THEN** the result has `tasks: [{name: 'doc-cleanup', scope: ''}]`

#### Scenario: mcp_servers to apps unchanged
- **WHEN** a ROLE.md has `mcp_servers: [{name: 'github', tools: {allow: ['create_issue']}}]`
- **THEN** the result has `apps: [{name: 'github', tools: {allow: ['create_issue'], deny: []}}]`
