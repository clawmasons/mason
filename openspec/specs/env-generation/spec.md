# env-generation Specification

## Purpose
Generates .env template files with all required environment variables for the agent stack.

## Requirements

### Requirement: generateEnvTemplate produces a .env file string with all required variables

The system SHALL provide a `generateEnvTemplate(agent)` function that returns a string in `.env` format containing all environment variables needed by the agent stack, grouped by source with comments.

#### Scenario: Template includes proxy token
- **WHEN** `generateEnvTemplate()` is called
- **THEN** the output SHALL include `CHAPTER_PROXY_TOKEN=` in the proxy section

#### Scenario: Template includes proxy port
- **WHEN** `generateEnvTemplate()` is called
- **THEN** the output SHALL include `CHAPTER_PROXY_PORT=<default-port>` in the proxy section

### Requirement: App environment variables are collected and deduplicated

The function SHALL walk all resolved apps across all roles, collect the keys from their `env` fields, deduplicate them, and include each as `KEY=` in the apps section.

#### Scenario: Multiple apps with overlapping env vars
- **WHEN** two apps both reference `GITHUB_TOKEN` in their env
- **THEN** the template SHALL include `GITHUB_TOKEN=` exactly once

#### Scenario: App env values with interpolation are extracted as keys
- **WHEN** an app has `env: { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }`
- **THEN** the template SHALL include `GITHUB_TOKEN=` (the interpolated variable name) not the key name

### Requirement: Runtime auth variables are included

For each declared runtime, the function SHALL include the conventional auth variable:
- `codex` → `OPENAI_API_KEY=`

The `claude-code` runtime SHALL NOT map to any auth variable. Users authenticate by running `/login` inside the container on first run.

#### Scenario: Agent with claude-code runtime has no auth token
- **WHEN** agent has `runtimes: ["claude-code"]`
- **THEN** the template SHALL NOT include `CLAUDE_AUTH_TOKEN=` or `ANTHROPIC_API_KEY=`

#### Scenario: Agent with codex runtime still includes OPENAI_API_KEY
- **WHEN** agent has `runtimes: ["codex"]`
- **THEN** the template SHALL include `OPENAI_API_KEY=`

### Requirement: Output is grouped with section comments

The template SHALL be organized with comment headers:
- `# Proxy` — proxy token and port
- `# App Credentials` — environment variables from app env fields
- `# Runtime Auth` — per-runtime auth variables

#### Scenario: Sections are clearly labeled
- **WHEN** `generateEnvTemplate()` is called
- **THEN** the output SHALL contain `# Proxy`, `# App Credentials`, and `# Runtime Auth` comment headers
