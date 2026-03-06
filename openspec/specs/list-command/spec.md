# Spec: list-command

## ADDED Requirements

### Requirement: chapter list command is registered as a CLI command

The CLI SHALL register a `list` command with no required arguments and a `--json` flag.

#### Scenario: Command registration
- **WHEN** the CLI program is initialized
- **THEN** the `list` command SHALL be available with flag `--json`

### Requirement: chapter list displays all installed agents as a tree

When `chapter list` is run, the command SHALL:
1. Discover packages in the workspace via `discoverPackages()`
2. Find all packages with `chapter.type === "agent"`
3. Resolve each agent's dependency graph
4. Print a tree for each agent: agent → roles → tasks → apps/skills

#### Scenario: Single agent workspace
- **WHEN** `chapter list` is run in a workspace with one agent that has 2 roles
- **THEN** the output SHALL show the agent name and version
- **AND** each role indented under the agent with its tasks, apps, and skills

#### Scenario: Multiple agent workspace
- **WHEN** `chapter list` is run in a workspace with multiple agents
- **THEN** each agent SHALL be listed with its full dependency tree

#### Scenario: Empty workspace
- **WHEN** `chapter list` is run in a workspace with no agent packages
- **THEN** the command SHALL print "No agents found." and exit with code 1

### Requirement: chapter list supports JSON output

#### Scenario: JSON output
- **WHEN** `chapter list` is run with `--json`
- **THEN** the output SHALL be a JSON array of resolved agent objects
