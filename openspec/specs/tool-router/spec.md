# tool-router Specification

## Purpose
Build a routing table that prefixes upstream MCP tool names with their app short name, filters tools by role-based allow-lists, and resolves prefixed names back to the original upstream app and tool name for forwarding.

## Requirements

### Requirement: Tool name prefixing
The system SHALL prefix all upstream tool names with the app's short name (derived by `getAppShortName()`) using the format `<appShortName>_<toolName>`.

#### Scenario: Standard prefixing
- **GIVEN** app `@clawforge/app-github` exposes tool `create_pr`
- **WHEN** the routing table is built
- **THEN** the tool appears as `github_create_pr`
- **AND** the tool's description and inputSchema are preserved unchanged

#### Scenario: Multiple apps
- **GIVEN** app `@clawforge/app-github` exposes `create_pr` and app `@clawforge/app-slack` exposes `send_message`
- **WHEN** the routing table is built
- **THEN** tools `github_create_pr` and `slack_send_message` are both listed

### Requirement: Role-based tool filtering
The system SHALL only include tools that appear in the app's tool filter allow-list. Apps with no tool filter entry SHALL have all their tools excluded.

#### Scenario: Tool in allow-list
- **GIVEN** app-github has filter `{ mode: "allow", list: ["create_pr", "list_repos"] }`
- **AND** app-github exposes tools `create_pr`, `list_repos`, `delete_repo`
- **WHEN** the routing table is built
- **THEN** `github_create_pr` and `github_list_repos` are listed
- **AND** `github_delete_repo` is NOT listed

#### Scenario: App with no filter entry
- **GIVEN** app-github has no entry in the tool filters map
- **AND** app-github exposes tool `create_pr`
- **WHEN** the routing table is built
- **THEN** `github_create_pr` is NOT listed

#### Scenario: Empty allow-list
- **GIVEN** app-github has filter `{ mode: "allow", list: [] }`
- **WHEN** the routing table is built
- **THEN** no github tools are listed

### Requirement: Route resolution
The system SHALL resolve a prefixed tool name back to the original app name, short name, and tool name for upstream forwarding.

#### Scenario: Known prefixed name
- **WHEN** `resolve("github_create_pr")` is called
- **THEN** it returns `{ appName: "@clawforge/app-github", appShortName: "github", originalToolName: "create_pr", prefixedToolName: "github_create_pr", tool: <Tool> }`

#### Scenario: Unknown prefixed name
- **WHEN** `resolve("github_delete_repo")` is called and `delete_repo` was filtered out
- **THEN** it returns `null`

#### Scenario: Completely unknown name
- **WHEN** `resolve("nonexistent_tool")` is called
- **THEN** it returns `null`

### Requirement: Duplicate prefixed name detection
The system SHALL throw an error during construction if two different upstream tools produce the same prefixed name.

#### Scenario: Duplicate detected
- **GIVEN** two apps both produce prefixed name `github_create_pr`
- **WHEN** the routing table is constructed
- **THEN** an error is thrown indicating the duplicate

### Requirement: Static prefix/unprefix helpers
The system SHALL provide static helper methods `prefixName(appShortName, toolName)` and `unprefixName(appShortName, prefixedName)` for consistent name manipulation.

#### Scenario: prefixName
- **WHEN** `ToolRouter.prefixName("github", "create_pr")` is called
- **THEN** it returns `"github_create_pr"`

#### Scenario: unprefixName
- **WHEN** `ToolRouter.unprefixName("github", "github_create_pr")` is called
- **THEN** it returns `"create_pr"`
