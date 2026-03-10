# Chapter Creation Knowledge

This skill provides the reference knowledge needed to create valid clawmasons chapter artifacts.

## Chapter Package Taxonomy

A chapter workspace is an npm workspace monorepo with five package types:

| Type | Directory | Purpose |
|------|-----------|---------|
| `app` | `apps/` | MCP server connections (tools the agent can use) |
| `task` | `tasks/` | Workflows with prompts (what the agent does) |
| `skill` | `skills/` | Knowledge documents (what the agent knows) |
| `role` | `roles/` | Permission boundaries (what the agent is allowed to do) |
| `agent` | `agents/` | Agent definitions binding roles to runtimes |

## Package.json Formats

### App (MCP Server)

```json
{
  "name": "@<scope>/app-<name>",
  "version": "1.0.0",
  "chapter": {
    "type": "app",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "<mcp-server-package>", "<args>"],
    "tools": ["tool_a", "tool_b"],
    "capabilities": ["tools"]
  }
}
```

- `transport`: `"stdio"` (local process) or `"sse"` (HTTP endpoint)
- `tools`: Array of tool names the server exposes
- `capabilities`: Usually `["tools"]`, may include `["resources"]` or `["prompts"]`
- Optional: `"credentials": ["API_KEY_NAME"]` for servers requiring authentication
- Optional: `"env": { "KEY": "value" }` for environment variables passed to the server

### Task (Workflow)

```json
{
  "name": "@<scope>/task-<name>",
  "version": "1.0.0",
  "chapter": {
    "type": "task",
    "taskType": "subagent",
    "prompt": "./prompts/<name>.md",
    "requires": {
      "apps": ["@<scope>/app-<name>"],
      "skills": ["@<scope>/skill-<name>"]
    }
  }
}
```

- `taskType`: Always `"subagent"` (the task is executed by a sub-agent)
- `prompt`: Relative path to the markdown prompt file
- `requires.apps`: Apps whose tools the task needs
- `requires.skills`: Skills whose knowledge the task needs
- Optional: `"approval": "confirm"` for tasks requiring user confirmation before execution

### Skill (Knowledge)

```json
{
  "name": "@<scope>/skill-<name>",
  "version": "1.0.0",
  "chapter": {
    "type": "skill",
    "artifacts": ["./SKILL.md"],
    "description": "Brief description of what knowledge this provides"
  }
}
```

- `artifacts`: Array of file paths (relative to the skill directory) containing knowledge
- The SKILL.md file contains the actual knowledge, conventions, or reference material

### Role (Permission Boundary)

```json
{
  "name": "@<scope>/role-<name>",
  "version": "1.0.0",
  "chapter": {
    "type": "role",
    "description": "What this role does",
    "risk": "LOW",
    "tasks": ["@<scope>/task-<name>"],
    "skills": ["@<scope>/skill-<name>"],
    "permissions": {
      "@<scope>/app-<name>": {
        "allow": ["tool_a", "tool_b"],
        "deny": []
      }
    }
  }
}
```

- `risk`: `"LOW"`, `"MEDIUM"`, or `"HIGH"` — determines approval requirements
- `permissions`: Map of app package names to allow/deny tool lists
- `tasks`: Tasks this role can execute
- `skills`: Skills this role has access to
- Optional: `"mounts"` for additional Docker volume mounts
- Optional: `"baseImage"` to override the default Docker base image
- Optional: `"aptPackages"` for additional system packages in the Docker container

### Agent (Runtime Binding)

```json
{
  "name": "@<scope>/agent-<name>",
  "version": "1.0.0",
  "chapter": {
    "type": "agent",
    "name": "Human-Readable Name",
    "slug": "<name>",
    "description": "What this agent does",
    "runtimes": ["claude-code"],
    "roles": ["@<scope>/role-<name>"]
  }
}
```

- `runtimes`: Array of supported runtimes (`"claude-code"`, `"pi-coding-agent"`, `"mcp-agent"`)
- `roles`: Array of role package names this agent can assume
- Optional: `"credentials": ["API_KEY"]` for required API keys
- Optional: `"llm"` for LLM configuration
- Optional: `"acp"` for ACP server configuration

## Permission Model

### Allow/Deny Lists

Each role declares permissions per app:
- `allow`: Tools the role CAN use (whitelist)
- `deny`: Tools the role CANNOT use (blacklist, takes precedence over allow)

### Risk Levels

- **LOW**: Read-only operations, listing, searching
- **MEDIUM**: Write operations that modify files, create resources
- **HIGH**: Destructive operations, external communications, code execution, infrastructure changes

### Role Separation Guidelines

1. **Principle of least privilege**: Each role gets only the permissions it needs
2. **Separate by risk**: HIGH risk tools go in a separate role from LOW/MEDIUM
3. **Separate by function**: Group related tools together (e.g., all database tools in one role)
4. **One role per agent minimum**: Every agent must reference at least one role

## Security Analysis

When analyzing a project for chapter creation, flag these as HIGH risk:

- **File deletion tools**: `rm`, `delete_file`, `remove_directory`
- **Code execution**: `exec`, `run_command`, `shell`, `eval`
- **Network operations**: `send_email`, `post_message`, `http_request` to external APIs
- **Infrastructure**: `deploy`, `publish`, `push`, `merge`
- **Secrets access**: Tools that read/write credentials, tokens, or keys

## Chapter Directory Structure

```
<chapter-name>/
  package.json              # Root workspace
  .clawmasons/
    chapter.json            # Chapter metadata
  .gitignore
  apps/
    <app-name>/
      package.json
  tasks/
    <task-name>/
      package.json
      prompts/
        <task-name>.md
  skills/
    <skill-name>/
      package.json
      SKILL.md
  roles/
    <role-name>/
      package.json
  agents/
    <agent-name>/
      package.json
```

## Best Practices

1. **Name consistency**: Use kebab-case for directory names, match the slug
2. **Scope all packages**: Every package name uses `@<lodge>.<chapter>/` scope
3. **Document everything**: Every task needs a prompt, every skill needs a SKILL.md
4. **Validate the graph**: After creating all artifacts, run `clawmasons chapter build` to verify the dependency graph is valid
5. **Reference the CHARTER**: Check the lodge's CHARTER.md for behavioral constraints that should be reflected in role permissions
