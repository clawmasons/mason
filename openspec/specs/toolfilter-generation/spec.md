# toolfilter-generation Specification

## Purpose
Compute per-app toolFilter allow-lists from the union of all role permissions in a resolved agent, enforcing the hard governance boundary at the proxy layer.

## Requirements

### Requirement: Compute toolFilter as union of role allow-lists
The system SHALL compute a `toolFilter` for each app referenced by any role in a resolved agent. The toolFilter's `list` SHALL be the set union of all `allow` entries for that app across all roles. The toolFilter `mode` SHALL always be `"allow"`.

#### Scenario: Single role references an app
- **WHEN** agent has one role `role-issue-manager` with `permissions: { "@clawforge/app-github": { allow: ["create_issue", "list_repos", "add_label"] } }`
- **THEN** `computeToolFilters()` returns a toolFilter for `@clawforge/app-github` with `mode: "allow"` and `list: ["create_issue", "list_repos", "add_label"]`

#### Scenario: Multiple roles reference the same app
- **WHEN** agent has `role-issue-manager` allowing `["create_issue", "list_repos", "add_label"]` on `@clawforge/app-github` and `role-pr-reviewer` allowing `["list_repos", "get_pr", "create_review"]` on `@clawforge/app-github`
- **THEN** `computeToolFilters()` returns a toolFilter for `@clawforge/app-github` with `list` containing exactly `["create_issue", "list_repos", "add_label", "get_pr", "create_review"]` (union, no duplicates)

#### Scenario: App referenced by one role but not another
- **WHEN** agent has `role-issue-manager` with permissions for `@clawforge/app-github` and `@clawforge/app-slack`, and `role-pr-reviewer` with permissions for `@clawforge/app-github` only
- **THEN** `computeToolFilters()` returns toolFilters for both apps: github with the union, slack with only the issue-manager's allow-list

### Requirement: Exclude tools not in any role's allow-list
The generated toolFilter SHALL only include tools that appear in at least one role's `allow` list for that app. Tools that exist on the app but are not in any role's allow-list SHALL be excluded, effectively blocking them at the proxy layer.

#### Scenario: App has tools not allowed by any role
- **WHEN** `@clawforge/app-github` exposes tools `["create_issue", "list_repos", "add_label", "delete_repo", "transfer_repo"]` but the only role allowing github tools permits `["create_issue", "list_repos", "add_label"]`
- **THEN** the toolFilter `list` contains only `["create_issue", "list_repos", "add_label"]` — `delete_repo` and `transfer_repo` are excluded

### Requirement: Extract app short name for mcpServers key
The system SHALL derive a short name from the app's package name for use as the mcpServers key. The short name is computed by stripping the npm scope (e.g., `@clawforge/`) and the `app-` prefix if present.

#### Scenario: Scoped package with app- prefix
- **WHEN** the app package name is `@clawforge/app-github`
- **THEN** the short name is `github`

#### Scenario: Scoped package without app- prefix
- **WHEN** the app package name is `@clawforge/slack-server`
- **THEN** the short name is `slack-server`

#### Scenario: Unscoped package
- **WHEN** the app package name is `app-github`
- **THEN** the short name is `github`

### Requirement: Return toolFilter map keyed by app name
The `computeToolFilters()` function SHALL return a `Map<string, ToolFilter>` keyed by the full app package name. Each `ToolFilter` SHALL contain `mode: "allow"` and `list: string[]`.

#### Scenario: Return type structure
- **WHEN** `computeToolFilters(agent)` is called
- **THEN** the result is a Map where each key is a full app package name (e.g., `@clawforge/app-github`) and each value has `{ mode: "allow", list: string[] }`
