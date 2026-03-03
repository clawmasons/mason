## ADDED Requirements

### Requirement: generateEnvTemplate produces a .env file string with all required variables

The system SHALL provide a `generateEnvTemplate(agent)` function that returns a string in `.env` format containing all environment variables needed by the agent stack, grouped by source with comments.

#### Scenario: Template includes proxy token
- **WHEN** `generateEnvTemplate()` is called
- **THEN** the output SHALL include `PAM_PROXY_TOKEN=` in the proxy section

#### Scenario: Template includes proxy port
- **WHEN** `generateEnvTemplate()` is called
- **THEN** the output SHALL include `PAM_PROXY_PORT=<default-port>` in the proxy section

### Requirement: App environment variables are collected and deduplicated

The function SHALL walk all resolved apps across all roles, collect the keys from their `env` fields, deduplicate them, and include each as `KEY=` in the apps section.

#### Scenario: Multiple apps with overlapping env vars
- **WHEN** two apps both reference `GITHUB_TOKEN` in their env
- **THEN** the template SHALL include `GITHUB_TOKEN=` exactly once

#### Scenario: App env values with interpolation are extracted as keys
- **WHEN** an app has `env: { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }`
- **THEN** the template SHALL include `GITHUB_TOKEN=` (the interpolated variable name) not the key name

### Requirement: Runtime API keys are included

For each declared runtime, the function SHALL include the conventional API key variable:
- `claude-code` → `ANTHROPIC_API_KEY=`
- `codex` → `OPENAI_API_KEY=`

#### Scenario: Agent with claude-code runtime
- **WHEN** agent has `runtimes: ["claude-code"]`
- **THEN** the template SHALL include `ANTHROPIC_API_KEY=`

### Requirement: Output is grouped with section comments

The template SHALL be organized with comment headers:
- `# Proxy` — proxy token and port
- `# App Credentials` — environment variables from app env fields
- `# Runtime API Keys` — per-runtime API keys

#### Scenario: Sections are clearly labeled
- **WHEN** `generateEnvTemplate()` is called
- **THEN** the output SHALL contain `# Proxy`, `# App Credentials`, and `# Runtime API Keys` comment headers
