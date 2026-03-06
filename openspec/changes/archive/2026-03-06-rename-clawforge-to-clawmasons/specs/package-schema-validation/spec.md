## MODIFIED Requirements

### Requirement: Task schema validation

A valid task package.json SHALL conform to the ForgeTask schema with all required fields.

#### Scenario: Valid subagent task

- **WHEN** a task package.json contains `type: "subagent"` with `agentRef`, `input`, `output`, and `requires`
- **THEN** validation SHALL pass with the task recognized as a subagent delegation
```json
{
  "forgeType": "task",
  "forgeTask": {
    "type": "subagent",
    "agentRef": "@clawmasons/agent-label-bot",
    "input": { "issue_url": "string" },
    "output": { "labels": "string[]" },
    "requires": {
      "apps": ["@clawmasons/app-github"],
      "skills": ["@clawmasons/skill-labeling"]
    }
  }
}
```

### Requirement: Role schema validation

A valid role package.json SHALL conform to the ForgeRole schema with all required fields.

#### Scenario: Valid role with permissions

- **WHEN** a role package.json contains `permissions` with tool allow/deny lists and `tasks`
- **THEN** validation SHALL pass and the role's granted tools and tasks are recognized
```json
{
  "forgeType": "role",
  "forgeRole": {
    "permissions": {
      "@clawmasons/app-github": {
        "allow": ["create_issue", "list_repos"],
        "deny": ["delete_repo"]
      }
    },
    "tasks": ["@clawmasons/task-triage-issue"]
  }
}
```

#### Scenario: Role with deny wildcard

- **WHEN** a role contains `deny: ["*"]` for an app
- **THEN** validation SHALL pass and interpret `*` as denying all tools not explicitly allowed
```json
{
  "forgeType": "role",
  "forgeRole": {
    "permissions": {
      "@clawmasons/app-slack": {
        "allow": ["send_message"],
        "deny": ["*"]
      }
    }
  }
}
```

### Requirement: Agent schema validation

A valid agent package.json SHALL conform to the ForgeAgent schema with all required fields.

#### Scenario: Valid agent

- **WHEN** an agent package.json has `roles` and `model`
- **THEN** validation SHALL pass with the agent ready for resolution
```json
{
  "forgeType": "agent",
  "forgeAgent": {
    "roles": ["@clawmasons/role-issue-manager"],
    "model": "claude-sonnet-4-20250514"
  }
}
```

#### Scenario: Agent with resources

- **WHEN** an agent package.json includes a `resources` array
- **THEN** validation SHALL pass and each resource SHALL have `type`, `ref`, and `access`
```json
{
  "forgeType": "agent",
  "forgeAgent": {
    "roles": ["@clawmasons/role-issue-manager"],
    "model": "claude-sonnet-4-20250514",
    "resources": [
      {
        "type": "github-repo",
        "ref": "clawmasons/openclaw",
        "access": "read-write"
      }
    ]
  }
}
```
