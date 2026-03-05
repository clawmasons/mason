# Approval Workflow Hook

The approval hook gates tool calls that match glob patterns from `role.constraints.requireApprovalFor`. Matching calls are paused pending human approval via SQLite, with a configurable TTL and auto-deny on expiry.

## Requirements

### Requirement: matchesApprovalPattern matches prefixed tool names against glob patterns
The `matchesApprovalPattern(prefixedToolName: string, patterns: string[])` function SHALL return `true` if the prefixed tool name matches any pattern in the array. Patterns use `*` as a wildcard matching any sequence of characters. Special regex characters in the pattern (other than `*`) SHALL be escaped.

#### Scenario: Exact match
- **WHEN** `matchesApprovalPattern("github_delete_repo", ["github_delete_repo"])` is called
- **THEN** it returns `true`

#### Scenario: Wildcard suffix match
- **WHEN** `matchesApprovalPattern("github_delete_repo", ["github_delete_*"])` is called
- **THEN** it returns `true`

#### Scenario: Wildcard prefix match
- **WHEN** `matchesApprovalPattern("slack_send_message", ["*_send_message"])` is called
- **THEN** it returns `true`

#### Scenario: Wildcard middle match
- **WHEN** `matchesApprovalPattern("slack_send_message", ["*_send_*"])` is called
- **THEN** it returns `true`

#### Scenario: No match
- **WHEN** `matchesApprovalPattern("github_list_repos", ["github_delete_*"])` is called
- **THEN** it returns `false`

#### Scenario: Empty patterns array
- **WHEN** `matchesApprovalPattern("github_delete_repo", [])` is called
- **THEN** it returns `false`

#### Scenario: Multiple patterns, one matches
- **WHEN** `matchesApprovalPattern("github_delete_repo", ["slack_*", "github_delete_*"])` is called
- **THEN** it returns `true`

### Requirement: requestApproval creates a pending approval request and polls for resolution
The `requestApproval(context: HookContext, db: Database, options?)` function SHALL:
1. Generate a unique ID and create a pending approval request in the `approval_requests` table with all context fields
2. Poll `getApprovalRequest()` every `pollIntervalMs` (default 1000ms)
3. Return `"approved"` when status changes to `"approved"`
4. Return `"denied"` when status changes to `"denied"`
5. After `ttlSeconds` (default 300) elapses, call `updateApprovalStatus(id, "denied", "auto-timeout")` and return `"timeout"`

#### Scenario: Approval granted during polling
- **WHEN** `requestApproval()` is called with a valid context
- **AND** an external process updates the approval request status to `"approved"` before TTL expires
- **THEN** the function returns `"approved"`

#### Scenario: Approval denied during polling
- **WHEN** `requestApproval()` is called with a valid context
- **AND** an external process updates the approval request status to `"denied"` before TTL expires
- **THEN** the function returns `"denied"`

#### Scenario: Approval times out
- **WHEN** `requestApproval()` is called with `ttlSeconds: 2`
- **AND** no external process updates the status within 2 seconds
- **THEN** the function calls `updateApprovalStatus(id, "denied", "auto-timeout")`
- **AND** returns `"timeout"`

#### Scenario: Approval request contains correct context fields
- **WHEN** `requestApproval()` is called with context `{ agentName: "note-taker", roleName: "writer", appName: "github", toolName: "delete_repo", prefixedToolName: "github_delete_repo", arguments: { repo: "test" } }`
- **THEN** the approval request in the database contains `agent_name: "note-taker"`, `role_name: "writer"`, `app_name: "github"`, `tool_name: "github_delete_repo"` (uses prefixed name), `arguments: '{"repo":"test"}'`, `status: "pending"`, and `ttl_seconds` matching the configured TTL

### Requirement: Approval hook failure SHALL NOT crash the proxy
If `createApprovalRequest()` or `getApprovalRequest()` throws an error, the approval hook SHALL catch the error, log it to stderr, and return `"denied"` (fail-closed). Tool calls SHALL NOT proceed without a valid approval check when approval is required.

#### Scenario: Database error during approval request creation
- **WHEN** `requestApproval()` is called and `createApprovalRequest()` throws
- **THEN** the error is logged to stderr
- **AND** the function returns `"denied"`

#### Scenario: Database error during polling
- **WHEN** `requestApproval()` is called and `getApprovalRequest()` throws during polling
- **THEN** the error is logged to stderr
- **AND** the function returns `"denied"`
