## MODIFIED Requirements

### Requirement: Runtime API keys are included

For each declared runtime, the function SHALL include the conventional API key/auth variable:
- `claude-code` → `CLAUDE_AUTH_TOKEN=`
- `codex` → `OPENAI_API_KEY=`

#### Scenario: Agent with claude-code runtime
- **WHEN** agent has `runtimes: ["claude-code"]`
- **THEN** the template SHALL include `CLAUDE_AUTH_TOKEN=` (not `ANTHROPIC_API_KEY=`)

### Requirement: Output is grouped with section comments

The template SHALL be organized with comment headers:
- `# Proxy` — proxy token and port
- `# App Credentials` — environment variables from app env fields
- `# Runtime Auth` — per-runtime auth variables (renamed from "Runtime API Keys")

#### Scenario: Section header updated
- **WHEN** `generateEnvTemplate()` is called
- **THEN** the output SHALL contain `# Runtime Auth` (not `# Runtime API Keys`)
