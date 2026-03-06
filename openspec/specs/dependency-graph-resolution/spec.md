## ADDED Requirements

### Requirement: Resolve member dependency graph
The system SHALL provide a `resolveMember(memberName, packages)` function that takes a member package name and a discovery map, and returns a `ResolvedMember` containing the fully-resolved dependency tree: all roles with their tasks, apps, and skills.

#### Scenario: Resolve PRD repo-ops member example
- **WHEN** `resolveMember("@clawmasons/member-repo-ops", packages)` is called with a discovery map containing the PRD's member-repo-ops (2 roles: issue-manager, pr-reviewer), their tasks, apps, and skills
- **THEN** the result is a `ResolvedMember` with `name: "@clawmasons/member-repo-ops"`, 2 resolved roles, each with their resolved tasks, and all referenced apps and skills resolved

#### Scenario: Member not found
- **WHEN** `resolveMember("@clawmasons/nonexistent", packages)` is called and the package is not in the discovery map
- **THEN** a `PackageNotFoundError` is thrown with the missing package name

### Requirement: Resolve roles from member
The resolver SHALL resolve each package name in the member's `roles` array to a `ResolvedRole` containing the role's description, permissions, constraints, and resolved tasks/apps/skills.

#### Scenario: Resolve role with tasks and permissions
- **WHEN** a member references role `@clawmasons/role-issue-manager` which has `tasks: ["@clawmasons/task-triage-issue"]` and `permissions: { "@clawmasons/app-github": { allow: ["create_issue"], deny: ["delete_repo"] } }`
- **THEN** the resolved role contains the resolved task and the permissions object

#### Scenario: Role references non-role package
- **WHEN** a member's `roles` array contains `@clawmasons/app-github` (which has `chapter.type: "app"`, not `"role"`)
- **THEN** a `TypeMismatchError` is thrown indicating expected type "role" but got "app"

### Requirement: Resolve tasks from roles
The resolver SHALL resolve each package name in a role's `tasks` array to a `ResolvedTask` containing the task's type, prompt, timeout, approval, and resolved required apps and skills.

#### Scenario: Resolve task with required apps and skills
- **WHEN** a role references task `@clawmasons/task-triage-issue` which has `requires: { apps: ["@clawmasons/app-github"], skills: ["@clawmasons/skill-labeling"] }`
- **THEN** the resolved task contains the resolved app and skill objects

#### Scenario: Task references missing app
- **WHEN** a task requires app `@clawmasons/app-missing` which is not in the discovery map
- **THEN** a `PackageNotFoundError` is thrown with context about which task requires the missing app

### Requirement: Resolve composite tasks recursively
For tasks with `taskType: "composite"`, the resolver SHALL recursively resolve sub-tasks referenced in the task's dependency list, following the same resolution rules.

#### Scenario: Composite task with sub-tasks
- **WHEN** a composite task references sub-tasks `["@clawmasons/task-a", "@clawmasons/task-b"]`
- **THEN** both sub-tasks are resolved recursively and included in the resolved task

### Requirement: Detect circular dependencies
The resolver SHALL detect circular dependencies in the task graph (especially composite task chains) and throw a `CircularDependencyError` with the full cycle path.

#### Scenario: Direct circular dependency
- **WHEN** task-A depends on task-B and task-B depends on task-A
- **THEN** a `CircularDependencyError` is thrown with the cycle path `["task-A", "task-B", "task-A"]`

#### Scenario: Transitive circular dependency
- **WHEN** task-A depends on task-B, task-B depends on task-C, and task-C depends on task-A
- **THEN** a `CircularDependencyError` is thrown with the full cycle path

### Requirement: Diamond dependencies are valid
The resolver SHALL handle diamond dependencies correctly — when multiple roles or tasks reference the same app or skill, it is resolved once and shared.

#### Scenario: Same app referenced by multiple roles
- **WHEN** role-issue-manager and role-pr-reviewer both reference `@clawmasons/app-github`
- **THEN** the `ResolvedMember` contains the app resolved in both roles without errors

### Requirement: ResolvedMember data structure
A `ResolvedMember` SHALL contain: `name`, `version`, `memberType`, `memberName`, `slug`, `email`, `authProviders`, `description`, `runtimes`, `roles` (array of `ResolvedRole`), `resources`, and `proxy` configuration. Each `ResolvedRole` SHALL contain: `name`, `version`, `description`, `permissions`, `constraints`, `tasks` (array of `ResolvedTask`), `apps` (array of `ResolvedApp`), `skills` (array of `ResolvedSkill`). Each `ResolvedTask` SHALL contain: `name`, `version`, `taskType`, `prompt`, `timeout`, `approval`, `requiredApps` (optional string array of original app package names from `requires.apps`), `requiredSkills` (optional string array of original skill package names from `requires.skills`), `apps` (array of `ResolvedApp`), `skills` (array of `ResolvedSkill`), `subTasks` (array of `ResolvedTask` for composites). Each `ResolvedApp` SHALL contain: `name`, `version`, `transport`, `command`/`args`/`url`, `env`, `tools`, `capabilities`. Each `ResolvedSkill` SHALL contain: `name`, `version`, `artifacts`, `description`.

#### Scenario: ResolvedMember is serializable
- **WHEN** a `ResolvedMember` is produced by the resolver
- **THEN** it can be serialized to JSON via `JSON.stringify()` without loss of information (no functions, no circular references)

### Requirement: Resolve skills from roles and tasks
The resolver SHALL resolve skills referenced in both role-level `skills` arrays and task-level `requires.skills` arrays.

#### Scenario: Role-level skill resolution
- **WHEN** a role has `skills: ["@clawmasons/skill-labeling"]`
- **THEN** the resolved role contains the resolved skill in its `skills` array

#### Scenario: Task-level skill resolution
- **WHEN** a task has `requires: { skills: ["@clawmasons/skill-labeling"] }`
- **THEN** the resolved task contains the resolved skill in its `skills` array
