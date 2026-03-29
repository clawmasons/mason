# Default Project Role — Implementation Plan

**PRD:** [openspec/prds/default-project-role/PRD.md](./PRD.md)
**Related:** [project-role PRD](../project-role/PRD.md)

---

## Key Design Decisions

1. **No Zod schema changes.** The `roleSchema` fields `tasks`, `skills`, and `mcp` retain their `.optional().default([])` behavior. Omitted = empty = include nothing. This avoids breaking 20+ call sites across 7+ files that assume these fields are always arrays.

2. **Wildcards are the inclusion mechanism.** `tasks: ["*"]` means "discover all tasks from sources." This is explicit, visible in the ROLE.md, and requires no schema-level distinction between "omitted" and "empty."

3. **MCP servers are explicit only.** No wildcard discovery for MCP. The `scanProject()` infrastructure exists and will be exposed in a future PRD once MCP wildcard syntax is defined.

4. **Aliasing is a parser change, not a dialect change.** The `tasks`/`commands` alias is implemented in `normalizeTasks()` as a fallback lookup — not by modifying dialect registrations.

5. **Single resolution pipeline.** Wildcard expansion is a new step inserted between role loading and materialization, used by both the file-based path and the `generateProjectRole()` fallback.

---

## Resolution Pipeline

After a role is loaded (from file or in-memory), the following pipeline runs before materialization:

```
readMaterializedRole() or generateProjectRole()
  │
  ├─1─ normalizeTasks() — dialect field mapping + alias fallback (CHANGE 1)
  │    (already part of parser, enhanced with alias)
  │
  ├─2─ expandWildcards(role, projectDir) — resolve * patterns (CHANGE 2)
  │    For each tasks/skills entry containing "*":
  │    - scanProject(projectDir, { dialects: role.sources })
  │    - Match patterns against discovered names
  │    - Replace wildcard entries with concrete TaskRef/SkillRef objects
  │
  ├─3─ resolveIncludes(role, projectDir) — recursive role composition (CHANGE 3)
  │    For each role.includes entry:
  │    - resolveRole(name, projectDir)
  │    - Recursively apply pipeline steps 2-3 on included role
  │    - mergeRoles(current, included)
  │
  └─4─ adaptRoleToResolvedAgent() — existing materialization
```

This pipeline is called from `run-agent.ts` after the role is loaded, replacing the direct `adaptRoleToResolvedAgent()` call.

---

## Implementation Steps

### CHANGE 1: `tasks`/`commands` Field Aliasing in Role Parser

Implement PRD §5 — accept either `tasks` or `commands` as a field name in ROLE.md frontmatter, regardless of dialect.

**PRD refs:** §5.1 (Behavior), §5.2 (Scope), UC-5

**Summary:** Modify `normalizeTasks()` in `packages/shared/src/role/parser.ts` (lines 231-252) to add a fallback check. Currently it reads only `frontmatter[dialect.fieldMapping.tasks]`. After this change: if the primary field is not found, check the alias (`"commands"` if primary is `"tasks"`, or `"tasks"` if primary is `"commands"`). If both are present, use the primary and emit a warning via `console.warn()`.

**User Story (UC-5):** As a developer authoring `.mason/roles/project/ROLE.md` (mason dialect, primary field = `"tasks"`), I write `commands:` instead. The parser recognizes it and loads my tasks. If I write both, I get a warning telling me which one wins.

**Key implementation detail:** The Claude dialect is registered dynamically at runtime by `@clawmasons/claude-code-agent` with `dialectFields.tasks = "commands"`. For Claude-dialect ROLE.md files (under `.claude/roles/`), the primary is `"commands"` and the alias is `"tasks"`. For mason-dialect files (under `.mason/roles/`), it's reversed. The alias logic is symmetric.

**Scope:**
- Modify: `packages/shared/src/role/parser.ts` — `normalizeTasks()` function (lines 231-252)
- Add tests: `packages/shared/tests/role-parser.test.ts`
- Test cases per PRD §11.4 tests 24-26:
  - Alias recognized: mason dialect ROLE.md with `commands:` field is parsed correctly
  - Primary wins: both `tasks:` and `commands:` present → primary used, warning emitted
  - No alias needed: standard dialect field name works as before (regression guard)

**Testable output:** Unit tests pass. A ROLE.md with `commands:` in mason dialect resolves tasks correctly. Both fields present → warning + primary wins.

**Tests to run:**
- `npm run lint`
- `npm run build`
- `npx vitest run packages/shared/tests/`
- `npx vitest run packages/cli/tests/`
- In `../mason-extensions`: `npm run lint && npm run build && npm run test`

**Implemented**

**Artifacts:**
- Proposal: [openspec/changes/archive/2026-03-29-tasks-commands-field-aliasing/proposal.md](../../changes/archive/2026-03-29-tasks-commands-field-aliasing/proposal.md)
- Design: [openspec/changes/archive/2026-03-29-tasks-commands-field-aliasing/design.md](../../changes/archive/2026-03-29-tasks-commands-field-aliasing/design.md)
- Tasks: [openspec/changes/archive/2026-03-29-tasks-commands-field-aliasing/tasks.md](../../changes/archive/2026-03-29-tasks-commands-field-aliasing/tasks.md)
- Spec: [openspec/changes/archive/2026-03-29-tasks-commands-field-aliasing/specs/role-md-parser-dialect-registry/spec.md](../../changes/archive/2026-03-29-tasks-commands-field-aliasing/specs/role-md-parser-dialect-registry/spec.md)

---

### CHANGE 2: Wildcard Patterns in Tasks and Skills

Implement PRD §6-§7 — support `*` glob patterns in `tasks` and `skills` arrays, expanded against source directories at build time. This is the primary mechanism for "include all."

**PRD refs:** §6.1 (Semantics), §7.1 (Syntax), §7.2 (Resolution), §7.3 (Non-Wildcard Names), §7.4 (Resolution Timing), UC-1, UC-3, UC-8

**Summary:** Create a wildcard expansion module that takes a Role's tasks/skills arrays and expands any entries containing `*` against items discovered by `scanProject()`. The bare `*` wildcard matches ALL items (crossing `/` boundaries). Scoped wildcards like `deploy/*` match within a single path segment. This module is called after role loading and before materialization — it is the key new step in the resolution pipeline.

**User Story:** As a developer, my auto-created ROLE.md has `tasks: ["*"]` and `skills: ["*"]`. Mason scans `.claude/commands/` and `.claude/skills/`, finds `review`, `deploy/staging`, `deploy/production`, and skill `testing`. My role ends up with all three tasks and the skill. When I edit the file to `tasks: ["deploy/*"]`, only `deploy/staging` and `deploy/production` are included.

**Scope:**
- New file: `packages/shared/src/role/wildcard.ts`
  - `expandTaskWildcards(tasks: TaskRef[], discovered: DiscoveredCommand[]): { expanded: TaskRef[], warnings: string[] }`
  - `expandSkillWildcards(skills: SkillRef[], discovered: DiscoveredSkill[]): { expanded: SkillRef[], warnings: string[] }`
  - `isWildcardPattern(name: string): boolean` — returns true if name contains `*`
  - `validatePattern(name: string): void` — rejects `**`, `?`, `[...]` with descriptive error
  - `matchWildcard(pattern: string, name: string): boolean` — bare `*` matches all; scoped `deploy/*` uses single-segment matching; `*` does not cross `/` in scoped patterns
- New file: `packages/shared/src/role/resolve-role-fields.ts`
  - `resolveRoleFields(role: Role, projectDir: string): Promise<Role>` — calls `scanProject()` with `role.sources`, then expands wildcards in tasks and skills. Returns a new Role with expanded arrays. This is the integration point called from `run-agent.ts`.
  - If `role.sources` is empty, wildcards cannot be expanded — emit a warning and leave wildcard entries as-is (they will fail during materialization with a clear error).
- New tests: `packages/shared/tests/role/wildcard.test.ts`
- New tests: `packages/shared/tests/role/resolve-role-fields.test.ts`
- Test cases per PRD §11.4 tests 12-23:
  - Bare `*` matches ALL discovered tasks regardless of scope
  - Scoped `deploy/*` matches `deploy/staging`, `deploy/production`
  - Scoped `deploy/*` does NOT match `deploy/sub/deep`
  - Mixed list with dedup: `["review", "*"]` — review appears once
  - Zero matches → warning
  - No wildcard → pass through as-is
  - Invalid syntax → error
  - Skills wildcard `["*"]` discovers all skills
  - Omitted/empty field → `[]` (no expansion needed, Zod default)
  - Wildcard `["*"]` with explicit entries → all discovered

**Testable output:** Unit tests pass. `*` expands to all items. `deploy/*` scopes correctly. Invalid syntax rejected. Zero-match warnings emitted.

**Tests to run:**
- `npm run lint`
- `npm run build`
- `npx vitest run packages/shared/tests/`
- `npx vitest run packages/cli/tests/`
- In `../mason-extensions`: `npm run lint && npm run build && npm run test`

**Implemented**

**Artifacts:**
- Proposal: [openspec/changes/archive/2026-03-29-wildcard-patterns-tasks-skills/proposal.md](../../changes/archive/2026-03-29-wildcard-patterns-tasks-skills/proposal.md)
- Design: [openspec/changes/archive/2026-03-29-wildcard-patterns-tasks-skills/design.md](../../changes/archive/2026-03-29-wildcard-patterns-tasks-skills/design.md)
- Tasks: [openspec/changes/archive/2026-03-29-wildcard-patterns-tasks-skills/tasks.md](../../changes/archive/2026-03-29-wildcard-patterns-tasks-skills/tasks.md)
- Spec: [openspec/changes/archive/2026-03-29-wildcard-patterns-tasks-skills/specs/wildcard-expansion/spec.md](../../changes/archive/2026-03-29-wildcard-patterns-tasks-skills/specs/wildcard-expansion/spec.md)

---

### CHANGE 3: Role Composition via `role.includes`

Implement PRD §8 — a new `role.includes` field that lets a ROLE.md reference other roles to merge into itself.

**PRD refs:** §8.1-§8.7 (Syntax, Resolution, Merge Semantics, Multiple Includes, Circular Detection, Missing Role, Recursive Includes), UC-4, UC-6

**Summary:** Add a `role` section to the role schema with an `includes` array. During role loading, after the current role's wildcards are expanded (CHANGE 2), each included role is resolved via `resolveRole()`, recursively processed (wildcards + its own includes), and merged into the current role using additive merge semantics where the current role always wins.

**User Story (UC-4):** As a developer, I install `@clawmasons/role-configure-project` and add `role: { includes: ["@clawmasons/role-configure-project"] }` to my ROLE.md. Mason resolves my role, expands my wildcards, then resolves the included role from `node_modules/`, and merges it — my values win, but the included role adds tasks, skills, and instructions I didn't have.

**Key design decisions:**
- `resolveRole()` is always called with the **user's project directory** as `projectDir`, regardless of whether the included role is local or packaged. This ensures `node_modules/` lookups work consistently.
- Packaged roles without `sources` get no wildcard expansion — they must declare their content explicitly (their tasks/skills are concrete lists, not wildcards).
- Note: there is a separate `roleFieldSchema` in `packages/shared/src/schemas/role.ts` (the forge package field type for role packages). This is unrelated to the `role.includes` frontmatter section. The naming overlap is coincidental — they live in different schemas.

**Scope:**
- Modify: `packages/shared/src/schemas/role-types.ts` — add `role` section:
  ```typescript
  role: z.object({
    includes: z.array(z.string()).optional().default([]),
  }).optional().default({}),
  ```
- Modify: `packages/shared/src/types/role.ts` — type updates (auto-derived from schema)
- Modify: `packages/shared/src/role/parser.ts` — extract `frontmatter.role` and pass to schema
- New file: `packages/shared/src/role/merge.ts`
  - `mergeRoles(current: Role, included: Role): Role` — merge semantics per PRD Appendix B:
    - Lists (tasks, skills, mcp, credentials, packages, mounts): union, dedup by identity key (`name` for tasks/skills/mcp, `target` for mounts, string value for packages/credentials). Current role items first.
    - Scalars (risk, name, description, type): current wins
    - Instructions: current first, included appended after `\n\n` separator
    - Sources: NOT merged (current only)
- New file: `packages/shared/src/role/includes.ts`
  - `resolveIncludes(role: Role, projectDir: string, visited?: Set<string>, depth?: number): Promise<Role>`
    - Resolve current role's wildcards first (calls `resolveRoleFields` from CHANGE 2)
    - For each `role.includes` entry: call `resolveRole(name, projectDir)`, recursively process (wildcards + includes), then `mergeRoles(current, included)`
    - `visited` set for circular detection — error with full chain: `"project → base-role → project"`
    - `depth` counter — error at 10: `"Role inclusion depth exceeds maximum (10)"`
    - Missing role → `RoleDiscoveryError` with install instructions (existing error type)
- Modify: `packages/shared/src/role/resolve-role-fields.ts` (from CHANGE 2) — integrate include resolution after wildcard expansion
- New tests: `packages/shared/tests/role/merge.test.ts`, `packages/shared/tests/role/includes.test.ts`
- Test cases per PRD §11.4 tests 1-11:
  - List union with dedup (duplicate task names discarded)
  - List ordering (current first, included appended)
  - Map identity-key dedup (same-name MCP server discarded entirely)
  - Scalar current-wins (risk, name, description)
  - Instructions append / fallback
  - Multiple includes ordering
  - Circular detection: A → B → A
  - Transitive: A → B → C
  - Depth limit: chain of 11 fails

**Testable output:** Unit tests for merge and includes pass. Circular includes detected with clear chain. Depth limit enforced. Missing roles produce install instructions.

**Tests to run:**
- `npm run lint`
- `npm run build`
- `npx vitest run packages/shared/tests/`
- `npx vitest run packages/cli/tests/`
- `npm run test:e2e`
- In `../mason-extensions`: `npm run lint && npm run build && npm run test && npm run test:e2e`

**Implemented**

**Artifacts:**
- Proposal: [openspec/changes/archive/2026-03-29-role-composition-includes/proposal.md](../../changes/archive/2026-03-29-role-composition-includes/proposal.md)
- Design: [openspec/changes/archive/2026-03-29-role-composition-includes/design.md](../../changes/archive/2026-03-29-role-composition-includes/design.md)
- Tasks: [openspec/changes/archive/2026-03-29-role-composition-includes/tasks.md](../../changes/archive/2026-03-29-role-composition-includes/tasks.md)
- Spec: [openspec/changes/archive/2026-03-29-role-composition-includes/specs/role-composition-includes/spec.md](../../changes/archive/2026-03-29-role-composition-includes/specs/role-composition-includes/spec.md)

---

### CHANGE 4: Auto-Creation of Default Project Role + CLI Integration

Implement PRD §4 — when `mason <agent>` is run without `--role` and no `.mason/roles/project/ROLE.md` exists, create the file on disk with the template. Also wire the resolution pipeline into the CLI.

**PRD refs:** §4.1 (Trigger Condition), §4.2 (Creation Process), §4.3 (ROLE.md Template), §4.4 (Relationship to Existing), UC-1, UC-2, UC-7

**Summary:** Replace the current `generateProjectRole()` fallback in `run-agent.ts` (around line 1315-1336) with a three-way branch:

```
if (!role) {
  if (existsSync(".mason/roles/project/ROLE.md")) {
    // File exists → load via readMaterializedRole(), then resolveRoleFields()
    preResolvedRole = await loadAndResolveProjectRole(projectDir);
  } else {
    // File doesn't exist → try to create it
    const created = await createDefaultProjectRole(projectDir, dialectDir);
    if (created) {
      // Created successfully → load the new file
      preResolvedRole = await loadAndResolveProjectRole(projectDir);
    } else {
      // Write failed → warn, fall back to generateProjectRole()
      preResolvedRole = await generateProjectRole(projectDir, effectiveSources);
    }
  }
}
```

The `loadAndResolveProjectRole()` function reads the file via `readMaterializedRole()`, then runs the resolution pipeline (wildcard expansion + include resolution from CHANGES 2-3).

**User Story (UC-1):** I run `mason claude` for the first time. Mason creates `.mason/roles/project/ROLE.md` with `sources: [claude]`, `tasks: ["*"]`, `skills: ["*"]`. The `*` wildcards expand against `.claude/commands/` and `.claude/skills/` — all items discovered. Next time I run `mason claude`, the existing file is loaded without modification.

**Key implementation details:**
- Template uses dialect **directory** name (e.g., `claude`), not registry key (e.g., `claude-code-agent`). This is derived from the dialect entry's `.directory` field via `getDialectByName(resolvedDialectName)?.directory`.
- The alias check (`configEntry?.role`, `aliasEntry?.role`) must be verified BEFORE attempting auto-creation. If either provides a role name, skip auto-creation entirely.
- `generateProjectRole()` remains as the fallback but is no longer the primary path. Long-term it should be refactored to reuse `resolveRoleFields()` internally.
- The `--source` override continues to work: it overrides `role.sources` after loading, before wildcard expansion.

**Scope:**
- Modify: `packages/cli/src/cli/commands/run-agent.ts`:
  - New function: `createDefaultProjectRole(projectDir: string, dialectDir: string): Promise<boolean>` — writes template, returns success/failure
  - New function: `loadAndResolveProjectRole(projectDir: string, sourceOverride?: string[]): Promise<Role>` — reads file + resolution pipeline
  - Replace lines ~1315-1336 with the three-way branch above
- New tests: `packages/cli/tests/cli/default-project-role.test.ts`
- Test cases:
  - File created on first run with correct `sources`, `tasks: ["*"]`, `skills: ["*"]`
  - Template uses dialect directory name, not registry key
  - Existing file not overwritten on subsequent runs
  - Existing file loaded and wildcards expanded
  - Write failure falls back to in-memory with warning (UC-7)
  - `--role` flag bypasses auto-creation entirely
  - `--source` override applied before wildcard expansion
  - Alias with default role bypasses auto-creation

**Testable output:** Unit tests pass. File creation produces valid ROLE.md. Fallback on write failure works. Existing files are never overwritten. Full pipeline (create → load → expand → materialize) works.

**Tests to run:**
- `npm run lint`
- `npm run build`
- `npx vitest run packages/shared/tests/`
- `npx vitest run packages/cli/tests/`
- `npm run test:e2e`
- In `../mason-extensions`: `npm run lint && npm run build && npm run test && npm run test:e2e`

**Not Implemented Yet**

---

### CHANGE 5: End-to-End Integration Tests

Validate the full default-project-role lifecycle end-to-end through the CLI.

**Summary:** Write E2E tests exercising the complete flow. Extend the existing `packages/cli/tests/e2e/project-role.test.ts` which already tests zero-config, cross-source, multi-source, and error cases for the project role.

**Scope:**
- Extend: `packages/cli/tests/e2e/project-role.test.ts`
- Add fixture content: scoped tasks (`deploy/staging.md`, `deploy/production.md`), skills (`testing/SKILL.md`)
- Test scenarios:
  1. **Auto-creation:** First run without `--role` creates `.mason/roles/project/ROLE.md` with correct template content (`sources`, `tasks: ["*"]`, `skills: ["*"]`)
  2. **Reuse:** Second run loads existing file without overwriting
  3. **Wildcard all:** `tasks: ["*"]` includes all tasks from source
  4. **Scoped wildcard:** Edited ROLE.md with `tasks: ["deploy/*"]` includes only scoped tasks
  5. **Explicit restriction:** `tasks: ["review"]` includes only that task
  6. **Alias:** `commands: ["*"]` in mason dialect ROLE.md works
  7. **Role includes:** ROLE.md with `role.includes` merges correctly (requires a local role fixture in `.mason/roles/base-role/`)
  8. **Circular include:** Produces clear error with cycle chain
  9. **Write failure fallback:** Read-only directory falls back to in-memory (UC-7)
- Uses shared test helpers from `@clawmasons/agent-sdk/testing`

**Testable output:** All E2E tests pass. Full lifecycle validated through CLI.

**Tests to run:**
- `npm run lint`
- `npm run build`
- `npm run test`
- `npm run test:e2e`
- In `../mason-extensions`: `npm run lint && npm run build && npm run test && npm run test:e2e`

**Not Implemented Yet**
