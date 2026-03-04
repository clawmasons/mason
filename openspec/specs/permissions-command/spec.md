# Spec: permissions-command

## ADDED Requirements

### Requirement: pam permissions command is registered as a CLI command

The CLI SHALL register a `permissions` command that accepts a required `<agent>` argument and a `--json` flag.

#### Scenario: Command registration
- **WHEN** the CLI program is initialized
- **THEN** the `permissions` command SHALL be available with argument `<agent>` and flag `--json`

### Requirement: pam permissions displays the per-role permission breakdown

When `pam permissions <agent>` is run, the command SHALL:
1. Discover packages and resolve the agent's dependency graph
2. For each role, display the app → allowed tools mapping from `role.permissions`
3. Display the proxy-level toolFilter (union of all role allow-lists per app)

#### Scenario: Per-role permission display
- **WHEN** `pam permissions` is run for an agent with roles `issue-manager` and `pr-reviewer`
- **THEN** the output SHALL show each role's name
- **AND** under each role, the apps and their allowed tools from `role.permissions`

#### Scenario: Proxy-level toolFilter display
- **WHEN** `pam permissions` is run for an agent
- **THEN** the output SHALL include a "Proxy toolFilter" section
- **AND** for each app, the union of all role allow-lists SHALL be displayed

#### Scenario: Agent with deny lists
- **WHEN** a role has explicit `deny` entries for an app
- **THEN** the per-role section SHALL also display the denied tools

### Requirement: pam permissions exits with non-zero code on failure

#### Scenario: Agent not found
- **WHEN** `pam permissions` is run with a non-existent agent name
- **THEN** the command SHALL print an error message and exit with code 1

### Requirement: pam permissions supports JSON output

#### Scenario: JSON output
- **WHEN** `pam permissions` is run with `--json`
- **THEN** the output SHALL be a JSON object containing `roles` (per-role breakdown) and `toolFilters` (proxy-level union)
