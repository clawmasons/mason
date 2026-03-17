---
name: my-role
description: Describe what this role does
version: 1.0.0

# Commands/slash-commands this role provides
commands:
  - deploy
  - review

# Skills this role depends on
skills:
  - '@acme/skill-prd-writing'

# MCP server configurations with tool-level permissions
mcp_servers:
  - name: github
    tools:
      allow:
        - create_issue
        - list_repos
        - create_pr
      deny:
        - delete_repo

# Container requirements
container:
  packages:
    apt:
      - jq
      - curl
    npm:
      - typescript
  ignore:
    paths:
      - '.mason/'
      - '.claude/'
      - '.env'

# Governance
risk: LOW
credentials:
  - GITHUB_TOKEN
  - ANTHROPIC_API_KEY
constraints:
  maxConcurrentTasks: 3
  requireApprovalFor:
    - create_pr
---

You are an AI assistant operating in the my-role role.

Describe the role's behavior, constraints, and capabilities here.
This markdown body becomes the system prompt for the agent.
