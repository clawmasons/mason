## Why

When users run `mason <agent>` without `--role`, the system falls back to `generateProjectRole()` which builds a role entirely in memory. The role is invisible to users — there is no artifact on disk to inspect, customize, or version-control. The PRD (default-project-role, section 4) requires that the first run creates `.mason/roles/project/ROLE.md` on disk with a template using `sources`, `tasks: ["*"]`, `skills: ["*"]`. Subsequent runs load the existing file through the resolution pipeline (wildcard expansion + include resolution). A write-failure fallback preserves the current in-memory behavior.

## What Changes

- Modify: `packages/cli/src/cli/commands/run-agent.ts`:
  - New function: `createDefaultProjectRole(projectDir, dialectDir)` — writes the ROLE.md template to `.mason/roles/project/ROLE.md`, returns `true` on success, `false` on failure
  - New function: `loadAndResolveProjectRole(projectDir, sourceOverride?)` — reads the file via `readMaterializedRole()`, applies `--source` override if provided, then runs `resolveRoleFields()` (wildcard expansion + include resolution)
  - Replace the `generateProjectRole()` call at lines ~1316-1338 with a three-way branch: existing file -> load; no file -> create then load; write failure -> fallback to `generateProjectRole()`
- New tests: `packages/cli/tests/cli/default-project-role.test.ts`

## Capabilities

### New Capabilities
- `auto-create-default-project-role`: Auto-creates `.mason/roles/project/ROLE.md` on first run, loads it via the resolution pipeline on subsequent runs
- `load-and-resolve-project-role`: Reads the project ROLE.md file and runs the full resolution pipeline (wildcards + includes)

## Impact

- **Modified**: `packages/cli/src/cli/commands/run-agent.ts` — new functions + three-way branch replacing `generateProjectRole()` call
- **New tests**: `packages/cli/tests/cli/default-project-role.test.ts` — 8 test cases
- **No schema changes**: The Zod `roleSchema` is unchanged
- **No parser changes**: Uses existing `readMaterializedRole()` from `packages/shared/src/role/parser.ts`
- **No shared package changes**: Uses existing `resolveRoleFields()` from `packages/shared/src/role/resolve-role-fields.ts`
