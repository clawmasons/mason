## MODIFIED Requirements

### Requirement: Runtime auth variables are included

For each declared runtime, the function SHALL include the conventional auth variable:
- `codex` → `OPENAI_API_KEY=`

The `claude-code` runtime SHALL NOT map to any auth variable. Users authenticate by running `claude /login` inside the container on first run.

#### Scenario: Agent with claude-code runtime has no auth token
- **WHEN** agent has `runtimes: ["claude-code"]`
- **THEN** the template SHALL NOT include `CLAUDE_AUTH_TOKEN=` or `ANTHROPIC_API_KEY=`

#### Scenario: Agent with codex runtime still includes OPENAI_API_KEY
- **WHEN** agent has `runtimes: ["codex"]`
- **THEN** the template SHALL include `OPENAI_API_KEY=`
