## ADDED Requirements

### Requirement: Session compose uses stable image names without session ID

The generated Docker Compose YAML SHALL use image tags scoped to project + role + agent, NOT to session ID. The image name format SHALL be `mason-{projectHash}-{agentServiceName}-{agentShortName}` (or `mason-{projectHash}-{agentServiceName}` when no agent short name applies). Multiple sessions of the same role within the same project SHALL reuse the same image tag.

#### Scenario: Image tag does not contain session ID
- **WHEN** a session compose YAML is generated
- **THEN** the `image:` field for agent services does NOT contain the session ID

#### Scenario: Same role produces same image tag across sessions
- **WHEN** two sessions are created for the same role in the same project
- **THEN** both sessions' compose files reference the same image tag

#### Scenario: Different roles produce different image tags
- **WHEN** two sessions are created for different roles in the same project
- **THEN** each session's compose file references a distinct image tag

#### Scenario: Different projects produce different image tags
- **WHEN** sessions are created for the same role in different projects
- **THEN** the image tags differ due to different projectHash values
