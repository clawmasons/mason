# Design: Monorepo Generation

## Architecture

### 1. Component Overview

```
packages/cli/src/commands/mason-init-repo.ts   — CLI command + monorepo generator
packages/cli/tests/cli/mason-init-repo.test.ts — Unit tests
```

The implementation lives entirely in the CLI package since it orchestrates file generation and depends on the role discovery system.

### 2. Command Interface

```
mason init-repo --role <name> [--target-dir <path>]
```

- `--role <name>` (required): Name of a local role to generate the monorepo from
- `--target-dir <path>` (optional): Override the default output directory

Default target: `<project>/.clawmasons/repositories/<role-name>/`

### 3. Generator Flow

```
resolveRole(name) → RoleType
    ↓
generateMonorepo(role, targetDir)
    ├── createRootPackageJson(role, workspaces)
    ├── createRolePackage(role)
    │   ├── package.json (chapter.type = "role")
    │   └── ROLE.md (copy from source)
    ├── for each skill dependency:
    │   └── createSkillPackage(skill)
    │       └── package.json (chapter.type = "skill")
    ├── for each app dependency:
    │   └── createAppPackage(app)
    │       └── package.json (chapter.type = "app")
    └── for each task dependency:
        └── createTaskPackage(task)
            ├── package.json (chapter.type = "task")
            └── PROMPT.md (if local task with content)
```

### 4. Generated Structure (PRD §11.3)

```
<role-name>/
├── package.json           # Root workspace config (private: true)
├── roles/
│   └── <role-name>/
│       ├── package.json   # chapter.type = "role"
│       └── ROLE.md
├── skills/
│   └── <skill-name>/
│       ├── package.json   # chapter.type = "skill"
│       └── SKILL.md       # (if source available)
├── apps/
│   └── <app-name>/
│       └── package.json   # chapter.type = "app"
└── tasks/
    └── <task-name>/
        ├── package.json   # chapter.type = "task"
        └── PROMPT.md      # (if source available)
```

### 5. Package.json Generation

#### Root package.json
```json
{
  "name": "<role-name>-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "roles/*",
    "skills/*",
    "apps/*",
    "tasks/*"
  ]
}
```

#### Role package.json
```json
{
  "name": "@<scope>/role-<role-name>",
  "version": "<role-version or 1.0.0>",
  "description": "<role-description>",
  "chapter": {
    "type": "role"
  },
  "files": ["ROLE.md"],
  "dependencies": {
    "@<scope>/skill-<name>": "<version>",
    "@<scope>/task-<name>": "<version>"
  }
}
```

#### Skill/App/Task package.json
Each sub-package follows the same pattern with the appropriate `chapter.type`.

### 6. Scope Derivation

The npm scope for generated packages is derived from:
1. The role's `metadata.scope` field (if present) — converted from dot notation to npm scope: `acme.engineering` → `@acme-engineering`
2. Falls back to no scope if `metadata.scope` is not set

### 7. Dependency Name Derivation

Dependency package names are derived from the reference:
- If a dependency is already an npm package reference (e.g., `@acme/skill-prd-writing`), use it as-is
- If a dependency is a local path reference, derive a package name: `<scope>/skill-<name>` or `<scope>/task-<name>`

### 8. ROLE.md Handling

The ROLE.md file is copied from the source role directory into the generated role package. If the role has bundled resources (templates, scripts), those are also copied.

### 9. Error Handling

- If the role is not found: throw with a clear error message
- If the target directory already exists: warn and overwrite (with backup)
- If the role source is a package (not local): throw — can only generate from local roles

### 10. File Structure

```
packages/cli/src/commands/mason-init-repo.ts    — Command registration + generator logic
packages/cli/tests/cli/mason-init-repo.test.ts  — Unit tests
```
