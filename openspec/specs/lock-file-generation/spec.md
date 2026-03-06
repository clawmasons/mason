## ADDED Requirements

### Requirement: generateLockFile produces a chapter.lock.json object

The system SHALL provide a `generateLockFile(agent, generatedFiles)` function that returns a JSON-serializable object representing the lock file.

#### Scenario: Lock file has version field
- **WHEN** `generateLockFile()` is called
- **THEN** the result SHALL include `lockVersion: 1`

### Requirement: Lock file contains agent metadata

The lock file SHALL include:
- `agent.name` — full package name
- `agent.version` — exact version
- `agent.runtimes` — declared runtimes

#### Scenario: Agent metadata is captured
- **WHEN** the agent is `@clawmasons/agent-repo-ops` version `1.0.0`
- **THEN** the lock file SHALL contain `agent: { name: "@clawmasons/agent-repo-ops", version: "1.0.0", runtimes: [...] }`

### Requirement: Lock file contains resolved roles with versions

The lock file SHALL include a `roles` array where each entry has the role's `name`, `version`, and arrays of `tasks`, `apps`, and `skills` (each with `name` and `version`).

#### Scenario: Roles and their dependencies are captured
- **WHEN** the agent has a role `@clawmasons/role-issue-manager` with tasks and apps
- **THEN** the lock file SHALL include the role with its tasks, apps, and skills listed by name and version

### Requirement: Lock file contains generated files list

The lock file SHALL include a `generatedFiles` array listing all file paths that were generated during the install process.

#### Scenario: Generated files are listed
- **WHEN** `generatedFiles` includes `["docker-compose.yml", "mcp-proxy/config.json", ".env"]`
- **THEN** the lock file SHALL contain those paths in the `generatedFiles` array

### Requirement: Lock file output is deterministic

When serialized to JSON, the lock file SHALL produce the same output for the same input. Object keys SHALL be sorted.

#### Scenario: Same input produces same output
- **WHEN** `generateLockFile()` is called twice with identical inputs
- **THEN** `JSON.stringify()` of both results SHALL be identical
