## ADDED Requirements

### Requirement: CLI auto-creates .mason/config.json from template on first agent-name invocation

When `mason run --agent <name>` or the `mason <name>` shorthand is used and `.mason/config.json` does not exist in the project directory, the CLI SHALL create the file from a default template before proceeding. The CLI SHALL print a notice informing the user the file was created.

Auto-init SHALL only trigger when the invocation references an agent by name (via `--agent` flag or positional shorthand). It SHALL NOT trigger on `mason run --role <name>` invocations that do not specify an agent name.

#### Scenario: config created on first agent-name invocation
- **WHEN** `.mason/config.json` does not exist
- **AND** the user runs `mason claude --role writer`
- **THEN** the CLI SHALL create `.mason/config.json` with the default template content
- **AND** SHALL print: `Created .mason/config.json with default agent configuration.`
- **AND** SHALL continue resolving the agent normally

#### Scenario: existing config is not overwritten
- **WHEN** `.mason/config.json` already exists
- **AND** the user runs `mason claude --role writer`
- **THEN** the CLI SHALL NOT modify `.mason/config.json`
- **AND** SHALL NOT print the creation notice

#### Scenario: auto-init does not fire for role-only invocations
- **WHEN** `.mason/config.json` does not exist
- **AND** the user runs `mason run --role writer` (no `--agent` flag)
- **THEN** the CLI SHALL NOT create `.mason/config.json`

### Requirement: Default template contains standard built-in agent entries

The auto-created `.mason/config.json` SHALL contain the following content exactly:

```json
{
  "agents": {
    "claude": {
      "package": "@clawmasons/claude-code"
    },
    "pi-mono-agent": {
      "package": "@clawmasons/pi-mono-agent"
    },
    "mcp": {
      "package": "@clawmasons/mcp-agent"
    }
  }
}
```

#### Scenario: created file matches default template
- **WHEN** auto-init creates `.mason/config.json`
- **THEN** the file SHALL be valid JSON
- **AND** SHALL contain an `agents` object with keys `"claude"`, `"pi-mono-agent"`, and `"mcp"`
- **AND** each entry SHALL have only a `"package"` field with the corresponding package name

### Requirement: .mason directory is created if it does not exist

If the `.mason/` directory does not exist when auto-init fires, the CLI SHALL create it (recursively) before writing `config.json`.

#### Scenario: .mason directory created alongside config
- **WHEN** `.mason/` does not exist in the project directory
- **AND** auto-init fires
- **THEN** the CLI SHALL create `.mason/config.json` (creating the directory as needed)
- **AND** SHALL NOT throw an error about the missing directory
