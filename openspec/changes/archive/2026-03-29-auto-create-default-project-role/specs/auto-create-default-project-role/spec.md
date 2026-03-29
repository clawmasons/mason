# Auto-Creation of Default Project Role + CLI Integration

## Overview

When `mason <agent>` is run without `--role` and no `.mason/roles/project/ROLE.md` exists, create the file on disk with the PRD template (section 4.3). Load the file through `readMaterializedRole()` and `resolveRoleFields()` to expand wildcards and resolve includes. Fall back to `generateProjectRole()` if the file write fails.

## Specification

### `createDefaultProjectRole(projectDir: string, dialectDir: string): Promise<boolean>`

Creates `.mason/roles/project/ROLE.md` from the PRD template.

**Parameters:**
- `projectDir` — Absolute path to the project root
- `dialectDir` — Dialect directory name (e.g., "claude", "codex") — NOT the registry key

**Behavior:**
1. Build the ROLE.md template string with `dialectDir` substituted for `{agent-user-started-with}`
2. Create directory `path.join(projectDir, ".mason", "roles", "project")` recursively
3. Write the template to `path.join(projectDir, ".mason", "roles", "project", "ROLE.md")`
4. Return `true` on success
5. On any error: emit `console.warn("Warning: Could not create default project role at .mason/roles/project/ROLE.md (<reason>). Using in-memory project role.")` and return `false`

### `loadAndResolveProjectRole(projectDir: string, sourceOverride?: string[]): Promise<Role>`

Loads and resolves the project ROLE.md file through the full pipeline.

**Parameters:**
- `projectDir` — Absolute path to the project root
- `sourceOverride` — Optional `--source` flag values (already normalized to dialect registry keys)

**Behavior:**
1. Read file via `readMaterializedRole(path.join(projectDir, ".mason", "roles", "project", "ROLE.md"))`
2. If `sourceOverride` is provided, create a copy of the role with `sources` replaced by the override values
3. Call `resolveRoleFields(role, projectDir)` to expand wildcards and resolve includes
4. Return the resolved role

### Three-way branch in `createRunAction()`

Replace lines ~1316-1338 in `run-agent.ts`:

```typescript
// Generate project role when no explicit role is provided
let preResolvedRole: Role | undefined;
if (!role) {
  const effectiveSources = sourceOverride ?? (() => {
    if (resolvedAgentType) {
      const dialectName = resolveDialectName(resolvedAgentType);
      if (dialectName) return [dialectName];
    }
    return [];
  })();

  if (effectiveSources.length === 0) {
    console.error(
      "\n  --role <name> is required ...\n"
    );
    process.exit(1);
    return;
  }

  const projectRolePath = path.join(projectDir, ".mason", "roles", "project", "ROLE.md");
  if (fs.existsSync(projectRolePath)) {
    // File exists -> load via readMaterializedRole() + resolveRoleFields()
    preResolvedRole = await loadAndResolveProjectRole(projectDir, sourceOverride);
  } else {
    // File doesn't exist -> try to create it
    const dialectEntry = getDialect(effectiveSources[0]);
    const dialectDir = dialectEntry?.directory ?? effectiveSources[0];
    const created = await createDefaultProjectRole(projectDir, dialectDir);
    if (created) {
      preResolvedRole = await loadAndResolveProjectRole(projectDir, sourceOverride);
    } else {
      // Write failed -> fallback to in-memory
      preResolvedRole = await generateProjectRole(projectDir, effectiveSources);
    }
  }
}
```

### ROLE.md Template

The exact template from PRD section 4.3, with `{agent-user-started-with}` replaced dynamically:

```yaml
---
name: project
type: project
description: Default project role — includes all tasks and skills from sources

# sources: which agent configuration directories to scan for tasks, skills, and MCP servers
# Accepted values: claude, codex, pi, mason (or dot-prefixed: .claude, .codex, etc.)
# Multiple sources merge with first-wins deduplication.
sources:
  - {dialectDir}

# role:
#   includes:
#     - @clawmasons/role-configure-project

# tasks (also accepts "commands"): task references to include from sources
# Use "*" to include ALL tasks. Use scoped wildcards: "deploy/*" for all tasks under deploy/.
# Use explicit names to restrict: ["review", "build"] includes only those two.
# An empty list (tasks: []) includes nothing.
tasks:
  - "*"

# skills: skill references to include from sources
# Use "*" to include ALL skills. Use explicit names to restrict.
# An empty list (skills: []) includes nothing.
skills:
  - "*"

# mcp: MCP server configurations (must be listed explicitly)
# mcp:
#   - name: github
#     tools:
#       allow: ['create_issue', 'list_repos']
#       deny: ['delete_repo']

# container:
#   packages:
#     apt: []
#     npm: []
#     pip: []
#   ignore:
#     paths: []
#   mounts: []

# risk: LOW
# credentials: []
---

Started within a container created by the mason project. We are using .mason/roles/project/ROLE.md to configure roles for this project.
```

## Test Coverage

1. `createDefaultProjectRole` creates file with correct content (sources, tasks: ["*"], skills: ["*"])
2. Template uses dialect directory name (e.g., "claude"), not registry key
3. `createDefaultProjectRole` returns false and warns on write failure
4. `loadAndResolveProjectRole` reads file and runs resolution pipeline
5. `loadAndResolveProjectRole` applies `--source` override before expansion
6. Existing file is loaded without overwriting
7. Full three-way branch: no file -> creates -> loads
8. Full three-way branch: file exists -> loads existing
