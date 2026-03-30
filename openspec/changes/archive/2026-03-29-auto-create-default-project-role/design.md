## Context

In `packages/cli/src/cli/commands/run-agent.ts`, when no `--role` flag is provided and no alias/config entry sets a role, the code currently calls `generateProjectRole(projectDir, effectiveSources)` which builds an in-memory `Role` object by scanning source directories. This role is never persisted to disk.

**Key files:**
- `packages/cli/src/cli/commands/run-agent.ts` — the `createRunAction()` handler at lines ~1316-1338 where `preResolvedRole` is set
- `packages/shared/src/role/parser.ts` — `readMaterializedRole(rolePath)` reads and validates a ROLE.md file
- `packages/shared/src/role/resolve-role-fields.ts` — `resolveRoleFields(role, projectDir)` expands wildcards and resolves includes
- `packages/shared/src/role/dialect-registry.ts` — `getDialect(name)` returns a `DialectEntry` with a `.directory` field

**Key types:**
- `Role` — the validated role object (from `packages/shared/src/types/role.ts`)
- `DialectEntry` — `{ name: string, directory: string, fieldMapping: {...} }` — maps dialect names to directory names

**Current flow (lines 1316-1338 of run-agent.ts):**
```
if (!role) {
  const effectiveSources = sourceOverride ?? deriveFromAgentType();
  if (effectiveSources.length === 0) { error + exit }
  preResolvedRole = await generateProjectRole(projectDir, effectiveSources);
}
```

## Goals / Non-Goals

**Goals:**
- When no role is specified and `.mason/roles/project/ROLE.md` doesn't exist, create it with the PRD template
- Template uses the dialect **directory** name (e.g., `claude`), not the registry key (e.g., `claude-code-agent`)
- After creation (or if file already exists), load via `readMaterializedRole()` then `resolveRoleFields()`
- Apply `--source` override before wildcard expansion (override `role.sources`)
- Fallback to `generateProjectRole()` if file write fails, with a warning
- Never overwrite an existing `.mason/roles/project/ROLE.md`

**Non-Goals:**
- Modifying `generateProjectRole()` — it remains as the fallback
- Changing the Zod schema or shared package code
- Modifying the parser

## Decisions

### 1. Template uses dialect directory name, not registry key

The PRD specifies `sources: [claude]` not `sources: [claude-code-agent]`. The directory name is obtained from `getDialect(resolvedDialectName)?.directory`. The `resolvedDialectName` is already the registry key (e.g., `claude-code-agent`); we use `getDialect(resolvedDialectName)?.directory` to get the user-facing name (e.g., `claude`).

### 2. Three-way branch replaces single `generateProjectRole()` call

```
if (!role) {
  const effectiveSources = sourceOverride ?? deriveFromAgentType();
  if (effectiveSources.length === 0) { error + exit }

  const projectRolePath = path.join(projectDir, ".mason", "roles", "project", "ROLE.md");
  if (fs.existsSync(projectRolePath)) {
    preResolvedRole = await loadAndResolveProjectRole(projectDir, sourceOverride);
  } else {
    const dialectDir = getDialectDirectoryForSources(effectiveSources);
    const created = await createDefaultProjectRole(projectDir, dialectDir);
    if (created) {
      preResolvedRole = await loadAndResolveProjectRole(projectDir, sourceOverride);
    } else {
      preResolvedRole = await generateProjectRole(projectDir, effectiveSources);
    }
  }
}
```

### 3. `loadAndResolveProjectRole()` applies source override before resolution

The function reads the file, optionally overrides `role.sources` with the `--source` flag values, then calls `resolveRoleFields()`. This ensures `--source` affects wildcard expansion.

### 4. `createDefaultProjectRole()` returns boolean, no throw

On success returns `true`. On any error (permissions, disk full), catches the error, emits a warning via `console.warn`, and returns `false`. The caller falls back to `generateProjectRole()`.

### 5. Template body text matches PRD exactly

The ROLE.md template includes the full commented-out sections from PRD section 4.3. The `{agent-user-started-with}` placeholder is replaced with the actual dialect directory name.

## Implementation

### Modified: `packages/cli/src/cli/commands/run-agent.ts`

**New function: `createDefaultProjectRole(projectDir: string, dialectDir: string): Promise<boolean>`**
- Builds the template string with `dialectDir` substituted for `{agent-user-started-with}`
- Creates directory `.mason/roles/project/` via `fs.mkdirSync(dir, { recursive: true })`
- Writes `.mason/roles/project/ROLE.md` via `fs.writeFileSync()`
- Returns `true` on success, catches errors, warns and returns `false`

**New function: `loadAndResolveProjectRole(projectDir: string, sourceOverride?: string[]): Promise<Role>`**
- Reads the file via `readMaterializedRole(path.join(projectDir, ".mason", "roles", "project", "ROLE.md"))`
- If `sourceOverride` is provided, overrides `role.sources` with the normalized source values
- Calls `resolveRoleFields(role, projectDir)` to expand wildcards and resolve includes
- Returns the resolved role

**Modified: `createRunAction()` handler**
- Replace lines ~1316-1338 with the three-way branch (see Decisions section 2)
- Extract `dialectDir` from `effectiveSources[0]` via `getDialect(effectiveSources[0])?.directory`

### New: `packages/cli/tests/cli/default-project-role.test.ts`

**Test cases:**
1. `createDefaultProjectRole` creates file with correct template content (sources, tasks: ["*"], skills: ["*"])
2. Template uses dialect directory name (e.g., "claude"), not registry key
3. `createDefaultProjectRole` returns false and warns on write failure
4. `loadAndResolveProjectRole` reads file and expands wildcards
5. `loadAndResolveProjectRole` applies source override before expansion
6. Existing file is loaded without modification (not overwritten)
7. Three-way branch: no file -> creates then loads
8. Three-way branch: file exists -> loads existing

Tests mock `readMaterializedRole` and `resolveRoleFields` to avoid filesystem and scanner dependencies. The `createDefaultProjectRole` test uses a temp directory for actual file I/O.
