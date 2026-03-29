# Default Project Role — Product Requirements Document

**Version:** 0.2.0 · Draft
**Date:** March 2026
**Author:** ClawForge, Inc.

---

## 1. Problem Statement

Today, running `mason claude` without a `--role` flag triggers the in-memory project role system (see [project-role PRD](../project-role/PRD.md)). This auto-generated role exists only in memory, is invisible to the user, and is rebuilt from scratch on every run. While functional, this creates several friction points:

- **No visible starting point.** New users run `mason claude` and things work, but there is no artifact they can inspect, customize, or version-control. The role that governs what their agent can do is ephemeral and opaque.
- **No path from zero-config to configured.** The in-memory project role is a dead end. Users who want to add a task filter, restrict an MCP server, or include a shared skill must create a ROLE.md from scratch, losing the auto-discovered defaults. There is no incremental path from "everything included" to "curated."
- **Repeated discovery overhead.** Every `mason <agent>` invocation re-scans source directories, re-deduplicates, and re-constructs the project role. While fast (under 1 second), this is unnecessary work when the project configuration has not changed.
- **No role composition.** Existing ROLE.md files are self-contained. There is no mechanism to include a base role and layer project-specific overrides on top. Users who want a shared starting point (e.g., `@clawmasons/role-configure-project`) must copy its content rather than composing with it.
- **Wildcard task/skill selection is unsupported.** Users who want "all tasks under `deploy/`" must enumerate each one individually. There is no glob syntax to express partial inclusion.
- **The `tasks` and `commands` naming inconsistency.** The mason dialect uses `tasks` as its canonical field name, but Claude-dialect ROLE.md files use `commands`. Users authoring `.mason/roles/project/ROLE.md` may use either name. Currently, only the dialect-registered field name is recognized; the other is silently ignored.

---

## 2. Goals

### User Goals

- **G-1 Persisted default role on first run.** When a user runs `mason <agent>` without `--role` and no `.mason/roles/project/ROLE.md` exists, mason creates the file on disk. The user now has a visible, editable starting point.
- **G-2 Wildcards for "include all."** The `*` wildcard in tasks and skills fields means "discover all matching items from sources at build time." The auto-created template uses `tasks: ["*"]` and `skills: ["*"]` so users start with full inclusion and can narrow down by replacing the wildcard with explicit lists.
- **G-3 Scoped wildcard patterns in tasks and skills.** Users can write `tasks: ["deploy/*", "review"]` to include all tasks matching a glob pattern, resolved against source directories at container build time.
- **G-4 Role composition via `role.includes`.** A new `role.includes` field lets a ROLE.md reference other roles to merge into itself. Included roles are resolved completely, then merged additively (current role values always win).
- **G-5 `tasks`/`commands` aliasing.** ROLE.md frontmatter accepts either `tasks` or `commands` as field names in any dialect. Both map to the same internal `tasks` field.

### Non-Goals

- **NG-1 Runtime wildcard resolution.** Wildcards resolve at container build time, not at agent runtime. Adding a new task file requires rebuilding the container.
- **NG-2 Full specification of `@clawmasons/role-configure-project`.** This PRD references the seed role but does not fully specify its content or behavior. That is a separate deliverable.
- **NG-3 Recursive wildcard globbing.** Only single-level `*` wildcards are supported (e.g., `deploy/*`), not recursive `**` patterns.
- **NG-4 Replacing the in-memory project role.** When `.mason/roles/project/ROLE.md` exists, it is loaded through the normal role pipeline. When it does not exist, this PRD specifies that it is created on disk rather than generated only in memory. The in-memory `generateProjectRole()` function remains available as an internal fallback but is no longer the primary path for first-time users.
- **NG-5 MCP wildcard discovery.** MCP servers must be listed explicitly in ROLE.md. Wildcard-based MCP discovery is planned for a future PRD. The infrastructure supports it but the syntax is not yet defined.

---

## 3. Design Principles

- **Visible defaults.** Configuration that affects agent behavior should be visible on disk, not hidden in memory. Users should be able to `cat` the file that governs their agent.
- **Explicit is better than implicit.** Wildcards (`*`) are an explicit declaration of intent — "include everything." An empty field (`tasks: []`) means "include nothing." An omitted field means "include nothing" (same as empty). There is no hidden magic — what you see in the ROLE.md is what you get.
- **Current role wins.** When merging included roles, the current role's values always take precedence. Includes add to the role; they never override it.
- **Build-time resolution.** Wildcards and includes are resolved when the Docker build directory is generated, not at agent runtime. This keeps the container deterministic and reproducible.
- **Convention over configuration, with an escape hatch.** The auto-created ROLE.md uses sensible defaults (wildcard inclusion, single source). Users who need different behavior edit the file.

---

## 4. Auto-Creation of Default Project Role

### 4.1 Trigger Condition

The default project role ROLE.md file is created on disk when ALL of the following are true:

1. The user runs `mason run <agent-type>` (or shorthand `mason <agent-type>`) **without** a `--role` flag.
2. No alias configuration provides a default role for the given agent type (checked via `configEntry?.role` and `aliasEntry?.role`).
3. The file `.mason/roles/project/ROLE.md` does **not** already exist in the project directory.

When conditions 1 and 2 are true but condition 3 is false (the file already exists), the existing ROLE.md is loaded through the standard role resolution pipeline (`resolveRole("project", projectDir)`). No file is created or overwritten.

### 4.2 Creation Process

When all three conditions are met:

1. Create the directory `.mason/roles/project/` if it does not exist.
2. Write the ROLE.md template (see §4.3) with the `sources` field populated from the agent type the user invoked (e.g., `mason claude` produces `sources: [claude]`).
3. Load the newly written file through `readMaterializedRole()` (the standard parser path).
4. Resolve wildcards in the loaded role (see §7).
5. Proceed with the normal materialization pipeline.

The file is created synchronously before any scanning or materialization work begins. If the write fails (e.g., permissions, read-only filesystem), fall back to the existing in-memory `generateProjectRole()` behavior and warn the user.

### 4.3 ROLE.md Template

The auto-created file serves as both configuration and documentation. The `tasks` and `skills` fields use the `*` wildcard to include everything from sources. MCP servers are not included by default (they must be listed explicitly). Optional fields are present as YAML comments, teaching users the available options.

```yaml
---
name: project
type: project
description: Default project role — includes all tasks and skills from sources

# sources: which agent configuration directories to scan for tasks, skills, and MCP servers
# Accepted values: claude, codex, pi, mason (or dot-prefixed: .claude, .codex, etc.)
# Multiple sources merge with first-wins deduplication.
sources:
  - {agent-user-started-with}

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

The `{agent-user-started-with}` placeholder is replaced at creation time with the agent's dialect **directory** name (not the dialect registry key). For example, `mason claude` produces `sources: [claude]`; `mason codex` produces `sources: [codex]`.

### 4.4 Relationship to Existing Project Role PRD

This PRD extends the [project-role PRD](../project-role/PRD.md). The existing PRD's non-goal "Persisting the project role to disk" is explicitly superseded by this PRD. Specifically:

- The `generateProjectRole()` function (project-role PRD) remains as an internal fallback when the file cannot be written to disk. Long-term, it should be refactored to share wildcard resolution logic with the file-based path rather than maintaining a parallel discovery codepath.
- All scanning, deduplication, source resolution, and materialization logic from the project-role PRD is reused unchanged.
- The `--source` CLI flag behavior is unchanged: it overrides the `sources` field in the ROLE.md.
- Docker pre-flight checks, implied agent aliases, and scanner enhancements from the project-role PRD are prerequisites and remain unchanged.

---

## 5. `tasks`/`commands` Field Aliasing

### 5.1 Behavior

ROLE.md frontmatter accepts either `tasks` or `commands` as a field name for declaring task references. Both map to the same internal `tasks` field on the Role object.

This aliasing is implemented in the parser's `normalizeTasks()` function (`packages/shared/src/role/parser.ts`), which currently reads only `frontmatter[dialect.fieldMapping.tasks]`. The alias logic adds a fallback check:

1. The dialect-registered field name is checked first (e.g., `commands` for Claude, `tasks` for Mason).
2. If not found, check the alias (`tasks` if the dialect uses `commands`, or `commands` if the dialect uses `tasks`).
3. If both are present, the dialect-registered field name wins and a warning is emitted: `Warning: Both "tasks" and "commands" are present in ROLE.md frontmatter. Using "<dialect-field>" (the <dialect-name> dialect field). Remove one to avoid confusion.`

Note: The Claude dialect is registered dynamically at runtime by `@clawmasons/claude-code-agent` with `dialectFields.tasks = "commands"`. The alias ensures that a `.mason/roles/` ROLE.md (mason dialect, primary = `"tasks"`) also accepts `commands`, and vice versa.

### 5.2 Scope

This aliasing applies to the `tasks`/`commands` pair only. The `mcp` and `skills` fields do not have aliases (all dialects already use the same names for these fields).

---

## 6. Field Semantics: Explicit Inclusion via Wildcards

### 6.1 Semantics

Tasks and skills are included in a role only when explicitly listed. Wildcards provide a shorthand for "include everything" without requiring the user to enumerate each item. There is no implicit discovery for omitted or empty fields.

| Field State | Behavior |
|-------------|----------|
| **`tasks: ["*"]`** | Discover and include ALL tasks from source directories |
| **`tasks: ["deploy/*"]`** | Include all tasks matching the scoped wildcard |
| **`tasks: ["review", "build"]`** | Include only the named tasks (exact match) |
| **`tasks: []`** | Include nothing |
| **Omitted** (key not present) | Include nothing (same as empty `[]` — Zod default) |

This means the Zod schema is **unchanged** — `tasks`, `skills`, and `mcp` retain their `.optional().default([])` behavior. No distinction between "omitted" and "empty" is needed.

### 6.2 MCP Servers: Explicit Only

MCP server configurations must be listed explicitly. Wildcard discovery for MCP servers is not supported in this version. The infrastructure for wildcard-based MCP discovery (scanning `settings.json` files from sources) already exists via `scanProject()` and will be exposed in a future PRD once the wildcard syntax for MCP is defined.

When `mcp` is omitted or empty, no MCP servers are included in the role.

### 6.3 Backward Compatibility

Existing ROLE.md files that list tasks/skills explicitly continue to work unchanged. The only new behavior is that entries containing `*` are now expanded rather than treated as literal names (which would have failed during materialization anyway since no task is named `*`).

---

## 7. Wildcard Patterns in Tasks and Skills

### 7.1 Syntax

Task and skill names may include a `*` character to indicate a glob pattern:

```yaml
tasks:
  - "*"              # ALL tasks from all source directories
  - deploy/*         # All tasks under the deploy/ scope
  - review           # Exact match
  - ops/monitoring/* # All tasks under ops/monitoring/
```

**Bare `*` (the "all" wildcard):** When the entry is exactly `"*"`, it matches ALL discovered items regardless of scope depth. This is a special case — it crosses `/` boundaries. It is the mechanism for "include everything from sources."

**Scoped wildcards (e.g., `deploy/*`):** The `*` matches any sequence of characters within a single path segment (it does not cross `/` boundaries). `deploy/*` matches `deploy/staging` and `deploy/production` but not `deploy/sub/deep`.

**Unsupported syntax:** `**`, `?`, and `[...]` character classes are not supported. Using them produces an error: `Error: Unsupported glob syntax "<pattern>". Only "*" and "scope/*" wildcards are supported.`

### 7.2 Resolution

Wildcards are resolved at container build time (during role loading, before materialization):

1. Scan the source directories for all available tasks (or skills) using `scanProject(projectDir, { dialects: resolvedSources })`.
2. For each entry containing `*`:
   - If the entry is exactly `"*"`: replace with ALL discovered items.
   - Otherwise: match the pattern against discovered names using single-segment glob semantics. Discovered task names use `/` as the scope separator (e.g., `deploy/staging`).
3. Replace the pattern entry with all matching concrete names as `TaskRef` / `SkillRef` objects.
4. Apply first-wins deduplication across all expanded entries (explicit names listed before wildcards take precedence).

If a wildcard pattern matches zero items, emit a warning: `Warning: Pattern "deploy/*" matched no tasks in source directories.`

### 7.3 Non-Wildcard Names

Task/skill names without `*` are treated as exact references. They are NOT validated against source directories at this stage — missing references are caught later during materialization (existing behavior).

### 7.4 Resolution Timing

Wildcards are resolved at container build time. This means:

- Adding a new task file to a source directory requires rebuilding the container (`mason <agent> --build` or re-running `mason <agent>`).
- The set of tasks/skills included in a container is deterministic and reproducible from the ROLE.md + source directories at build time.

---

## 8. Role Composition via `role.includes`

### 8.1 Syntax

A new `role` section in ROLE.md frontmatter supports an `includes` array:

```yaml
role:
  includes:
    - @clawmasons/role-configure-project
    - security-baseline
```

Each entry is a role reference resolved through the standard `resolveRole()` function: local roles by name in `.mason/roles/`, then npm packages, then `@clawmasons/role-<name>` auto-conversion.

### 8.2 Resolution Order

1. The current role's own fields are fully resolved first:
   - Wildcard patterns in tasks/skills are expanded (§7).
2. Each included role is completely resolved (including its own wildcards and its own includes, recursively). Included roles use the **user's project directory** as the resolution context for `resolveRole()` lookups, regardless of whether the included role is local or from a package. Packaged roles without `sources` get no wildcard expansion — they must declare their content explicitly.
3. Each included role is merged into the current role (in declaration order).

### 8.3 Merge Semantics

When merging an included role into the current role, the following rules apply:

**Lists (tasks, skills, mcp, credentials, container.packages.apt, container.packages.npm, container.packages.pip, container.ignore.paths, container.mounts):**

- Union: items from the included role are added to the current role's list.
- Deduplication: if an item with the same identity key (e.g., `name` for tasks, skills, and MCP servers; string value for credentials and packages) already exists in the current role, the included role's duplicate is discarded.
- The current role's items always appear first and are never modified.

**Maps (mcp[].tools, mcp[].env):**

- Only NEW keys from the included role are added.
- Keys that already exist in the current role are never overwritten.
- For `mcp` servers, if the current role already has a server with the same name, the included role's version is discarded entirely (the server name is the identity key).

**Scalars (risk, name, description, type):**

- Current role value always wins.
- The included role's value is used only if the current role's value is unset/empty.

**Instructions (markdown body):**

- If both roles have non-empty instructions, the current role's instructions are kept and the included role's instructions are appended after a blank line separator. This allows included roles to contribute base instructions that the current role extends.

**Sources:**

- The `sources` field is NOT merged from included roles. The current role's sources are authoritative.

### 8.4 Multiple Includes

When multiple roles are included, they are merged in declaration order:

```yaml
role:
  includes:
    - base-role         # Merged first
    - security-baseline # Merged second
```

After `base-role` is merged into the current role, `security-baseline` is merged into the result. At each step, the "current role" (including previously merged content) wins over the new included role.

### 8.5 Circular Include Detection

If role A includes role B, and role B includes role A (directly or transitively), the system must detect the cycle and fail with an error:

```
Error: Circular role inclusion detected: project → base-role → project.
```

Detection uses a visited set: before resolving an included role, check if its name is already in the current resolution chain. If so, fail immediately.

### 8.6 Missing Included Role

If an included role cannot be resolved (not found locally or as a package), fail with the standard `RoleDiscoveryError`:

```
Error: Role "@clawmasons/role-configure-project" not found.
  It is not a local role and is not installed as a package.
  To install: npm install --save-dev @clawmasons/role-configure-project
```

### 8.7 Included Role's Own Includes

Included roles may themselves declare `role.includes`. These are resolved recursively with the same merge semantics. The maximum recursion depth is 10. Exceeding this produces:

```
Error: Role inclusion depth exceeds maximum (10). Check for deep or unintended inclusion chains.
```

---

## 9. `@clawmasons/role-configure-project` Seed Role

### 9.1 Purpose

The default project role template includes `@clawmasons/role-configure-project` (commented out) as a reference to a seed role that helps users configure their project for mason. This is a packaged role published to npm.

### 9.2 Scope in This PRD

This PRD does not fully specify the seed role's contents. It specifies only:

- The role is referenced by package name in the default ROLE.md template (commented out by default).
- The role is resolved through the standard `resolveRole()` function when uncommented.
- Users who uncomment the line must install the package: `npm install --save-dev @clawmasons/role-configure-project`.

The full specification of `@clawmasons/role-configure-project` is a separate deliverable.

---

## 10. Use Cases

### UC-1: First-Run Auto-Creation

**Actor:** Developer with a `.claude/` directory who runs mason for the first time.
**Goal:** Get a working agent session AND a visible, editable role file.

**Flow:**
1. Developer runs `mason claude`.
2. CLI checks Docker Compose availability (pass).
3. No `--role` provided and no alias defines a default role.
4. CLI checks for `.mason/roles/project/ROLE.md` — file does not exist.
5. CLI creates `.mason/roles/project/ROLE.md` with template, `sources: [claude]`, `tasks: ["*"]`, `skills: ["*"]`.
6. CLI loads the new file through `readMaterializedRole()`.
7. Wildcard `*` in tasks and skills is expanded against `.claude/commands/` and `.claude/skills/` — all items discovered.
8. MCP is empty (not in template) — no MCP servers included unless user adds them.
9. Role materialized, container built, agent started.

**Acceptance Criteria:**
- `.mason/roles/project/ROLE.md` exists on disk after the command completes.
- The file contains `sources: [claude]`, `tasks: ["*"]`, `skills: ["*"]`.
- All tasks and skills from `.claude/` are available in the container.
- MCP servers are NOT included unless explicitly listed.
- Running `mason claude` again reuses the existing file (does not overwrite it).

---

### UC-2: Subsequent Runs with Existing Default Role

**Actor:** Developer who previously ran `mason claude` (UC-1) and now runs it again.
**Goal:** Use the existing project role without modification.

**Flow:**
1. Developer runs `mason claude`.
2. No `--role`, no alias role.
3. CLI checks for `.mason/roles/project/ROLE.md` — file exists.
4. CLI loads the file through `readMaterializedRole()`, then resolves wildcards.
5. Wildcards expanded, materialization proceeds.

**Acceptance Criteria:**
- The existing ROLE.md is not overwritten or modified.
- If the user has edited the file (e.g., replaced wildcards with explicit lists), those edits are respected.

---

### UC-3: Narrowing Down from "Include Everything"

**Actor:** Developer who wants to restrict their agent to specific tasks.
**Goal:** Edit the default ROLE.md to include only selected tasks.

**Flow:**
1. Developer edits `.mason/roles/project/ROLE.md`, replaces `tasks: ["*"]` with:
   ```yaml
   tasks:
     - review
     - deploy/*
   ```
2. Developer runs `mason claude`.
3. CLI loads the ROLE.md. `tasks` field has explicit entries.
4. `review` is an exact match (passed through). `deploy/*` is expanded against `.claude/commands/deploy/` directory.
5. Only matched tasks are included in the container. Skills still use `*` wildcard (all included).

**Acceptance Criteria:**
- Only `review` and tasks matching `deploy/*` are materialized.
- Skills still include everything (wildcard `*` unchanged).
- A warning is emitted if `deploy/*` matches zero tasks.

---

### UC-4: Role Composition with Includes

**Actor:** Developer who wants to layer a shared base role into their project role.
**Goal:** Include a published role package and have it merged with local configuration.

**Flow:**
1. Developer installs the role: `npm install --save-dev @clawmasons/role-configure-project`.
2. Developer edits `.mason/roles/project/ROLE.md`:
   ```yaml
   role:
     includes:
       - @clawmasons/role-configure-project
   ```
3. Developer runs `mason claude`.
4. CLI resolves the current role (project). Wildcards expanded (tasks/skills `*` → all items).
5. CLI resolves `@clawmasons/role-configure-project` from node_modules (using the user's project directory for resolution).
6. Included role merged into current role: new tasks/skills/mcp added, existing ones kept.
7. Container built with the merged configuration.

**Acceptance Criteria:**
- Items from both the current role and included role are present in the container.
- If both declare a task with the same name, the current role's version is used.
- The included role's instructions are appended to the current role's body text.

---

### UC-5: `tasks`/`commands` Aliasing

**Actor:** Developer authoring a ROLE.md in `.mason/roles/` (mason dialect) who writes `commands` instead of `tasks`.
**Goal:** The field is recognized despite not matching the mason dialect's registered field name.

**Flow:**
1. Developer creates `.mason/roles/project/ROLE.md` with:
   ```yaml
   commands:
     - review
     - build
   ```
2. CLI parses the file. The mason dialect's registered field is `tasks`.
3. Parser checks for `tasks` — not found. Falls back to alias `commands` — found.
4. Tasks `review` and `build` are loaded normally.

**Acceptance Criteria:**
- `commands` is accepted in any dialect's ROLE.md as an alias for the task field.
- If both `tasks` and `commands` are present, a warning is emitted and the dialect's primary field wins.

---

### UC-6: Circular Include Detection

**Actor:** Developer who accidentally creates a circular role inclusion.
**Goal:** Get a clear error instead of infinite recursion.

**Flow:**
1. `.mason/roles/project/ROLE.md` includes `base-role`.
2. `.mason/roles/base-role/ROLE.md` includes `project`.
3. Developer runs `mason claude`.
4. CLI detects the cycle during resolution.
5. CLI exits with: `Error: Circular role inclusion detected: project → base-role → project.`

**Acceptance Criteria:**
- The error message shows the full cycle chain.
- No infinite recursion or stack overflow.
- Exit code is non-zero.

---

### UC-7: Filesystem Write Failure Fallback

**Actor:** Developer running mason in a read-only project directory.
**Goal:** Agent session still starts despite inability to create the default ROLE.md.

**Flow:**
1. Developer runs `mason claude` in a read-only filesystem.
2. CLI attempts to create `.mason/roles/project/ROLE.md` — write fails.
3. CLI emits a warning: `Warning: Could not create default project role at .mason/roles/project/ROLE.md (<reason>). Using in-memory project role.`
4. CLI falls back to `generateProjectRole()` (existing in-memory generation).
5. Agent session starts normally.

**Acceptance Criteria:**
- The agent session is not blocked by a write failure.
- The warning clearly states what happened and why.
- Behavior is identical to the current in-memory project role when the fallback is used.

---

### UC-8: Wildcard Matching Zero Tasks

**Actor:** Developer who specifies a wildcard pattern that matches nothing.
**Goal:** Get a warning, not a silent empty result.

**Flow:**
1. Developer edits ROLE.md: `tasks: ["deploy/*"]`.
2. No `deploy/` directory exists in `.claude/commands/`.
3. CLI emits: `Warning: Pattern "deploy/*" matched no tasks in source directories.`
4. The role proceeds with zero tasks (or whatever other tasks were listed).

**Acceptance Criteria:**
- Warning is emitted for each zero-match pattern.
- The role is not rejected — it proceeds with whatever was resolved.

---

## 11. Non-Functional Requirements

### 11.1 Performance

- **File creation** (writing the ROLE.md template) must complete in under 100ms.
- **Wildcard expansion** against source directories must complete in under 500ms for projects with up to 200 tasks.
- **Role inclusion resolution** (up to 10 levels deep) must complete in under 2 seconds total.
- **No regression** in the existing project role scanning performance (under 1 second per source directory).

### 11.2 Compatibility

- **Backward compatible.** Projects that already have `.mason/roles/project/ROLE.md` are unaffected. The auto-creation only triggers when the file does not exist. Existing roles with explicit task/skill lists continue to work unchanged — only entries containing `*` trigger wildcard expansion.
- **Existing `--role` flows unchanged.** When `--role` is provided, the entire auto-creation path is bypassed.
- **Existing `--source` override unchanged.** The `--source` CLI flag overrides the `sources` field in the ROLE.md, same as before.
- **Scanner reuse.** Uses the existing `scanProject()` infrastructure from `packages/shared/src/mason/scanner.ts` for wildcard expansion.
- **No schema changes.** The Zod `roleSchema` is unchanged — `tasks`, `skills`, and `mcp` retain their `.optional().default([])` behavior. No downstream code is affected.

### 11.3 Error Handling

| Condition | Behavior |
|-----------|----------|
| File write failure (permissions, disk full) | Warn and fall back to in-memory project role |
| Invalid YAML in user-edited ROLE.md | Fail with `RoleParseError` (existing behavior) |
| Wildcard matches zero items | Warn, proceed with empty expansion for that pattern |
| Circular role includes | Fail with clear cycle chain in error message |
| Missing included role | Fail with `RoleDiscoveryError` including install instructions |
| Include depth exceeds 10 | Fail with depth limit error |
| Both `tasks` and `commands` present | Warn, use dialect-registered field |
| Invalid wildcard syntax (e.g., `**`) | Fail with: `Error: Unsupported glob syntax "<pattern>". Only "*" and "scope/*" wildcards are supported.` |
| Wildcard in `mcp` field | Not supported — MCP entries must be explicit objects, not strings |

### 11.4 Testing Requirements

**Unit tests for merge behavior** (`role.includes` merge semantics):

1. List union with dedup: included role adds new tasks; duplicate task names are discarded.
2. List ordering: current role items appear first; included role items are appended.
3. Map shallow merge (new keys only): included role's MCP server env vars added only when key does not exist in current role.
4. Map identity-key dedup: included role's MCP server with same name as current role's is discarded entirely.
5. Scalar current-wins: included role's `risk: HIGH` does not override current role's `risk: LOW`.
6. Instructions append: both roles have instructions; included role's are appended after separator.
7. Instructions fallback: current role has empty instructions; included role's are used.
8. Multiple includes ordering: second include sees first include's merged result as "current."
9. Circular detection: A → B → A fails with cycle error.
10. Transitive includes: A includes B, B includes C; C's items appear in A.
11. Depth limit: chain of 11 includes fails with depth error.

**Unit tests for wildcard expansion:**

12. Bare wildcard: `["*"]` matches ALL discovered tasks regardless of scope.
13. Scoped wildcard: `["deploy/*"]` matches `deploy/staging` and `deploy/production` but not `review`.
14. Scoped wildcard does not cross boundaries: `["deploy/*"]` does NOT match `deploy/sub/deep`.
15. Mixed list: `["review", "deploy/*"]` produces `review` + expanded deploy tasks.
16. Deduplication: `["review", "*"]` — `review` appears once (first-wins), wildcard adds the rest.
17. No matches: `["deploy/*"]` with no deploy tasks produces warning and empty expansion.
18. No wildcard: `["review"]` is passed through as-is (no expansion).
19. Invalid syntax: `["**"]` or `["deploy/?"]` produces error.
20. Skills wildcard: `["*"]` in skills discovers all skills from source directories.

**Unit tests for field defaults (no schema change needed):**

21. Omitted tasks: no `tasks` field → defaults to `[]` (no tasks included).
22. Empty tasks: `tasks: []` → no tasks included (same as omitted).
23. Wildcard tasks: `tasks: ["*"]` → all tasks discovered from sources.

**Unit tests for `tasks`/`commands` aliasing:**

24. Alias recognized: mason dialect ROLE.md with `commands:` field is parsed correctly.
25. Primary wins: both `tasks:` and `commands:` present → primary used, warning emitted.
26. No alias needed: standard dialect field name works as before (regression guard).

---

## Appendix A: Annotated ROLE.md Template

This is the exact file content written to `.mason/roles/project/ROLE.md` during auto-creation (example for `mason claude`):

```yaml
---
name: project
type: project
description: Default project role — includes all tasks and skills from sources

# sources: which agent configuration directories to scan for tasks, skills, and MCP servers
# Accepted values: claude, codex, pi, mason (or dot-prefixed: .claude, .codex, etc.)
# Multiple sources merge with first-wins deduplication.
sources:
  - claude

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

---

## Appendix B: Merge Semantics Reference Table

| Field | Type | Merge Rule | Identity Key |
|-------|------|-----------|-------------|
| `tasks` | TaskRef[] | Union, dedup by identity key | `name` |
| `skills` | SkillRef[] | Union, dedup by identity key | `name` |
| `mcp` | McpServerConfig[] | Union, dedup by identity key | `name` |
| `governance.credentials` | string[] | Union, dedup by value | string value |
| `container.packages.apt` | string[] | Union, dedup by value | string value |
| `container.packages.npm` | string[] | Union, dedup by value | string value |
| `container.packages.pip` | string[] | Union, dedup by value | string value |
| `container.ignore.paths` | string[] | Union, dedup by value | string value |
| `container.mounts` | MountConfig[] | Union, dedup by identity key | `target` |
| `governance.risk` | enum | Current wins | — |
| `instructions` | string | Append (current first, separator, included) | — |
| `metadata.name` | string | Current wins (never merged) | — |
| `metadata.description` | string | Current wins | — |
| `type` | enum | Current wins | — |
| `sources` | string[] | Not merged (current only) | — |
