## Why

ROLE.md frontmatter uses dialect-specific field names for tasks (e.g., `commands` for Claude, `tasks` for mason). When a user authors a `.mason/roles/project/ROLE.md` (mason dialect) but writes `commands:` instead of `tasks:`, the field is silently ignored and no tasks are loaded. This is confusing because both names refer to the same concept. The PRD (default-project-role, section 5) requires that either field name be accepted regardless of dialect.

## What Changes

- Modify `normalizeTasks()` in `packages/shared/src/role/parser.ts` to add alias fallback logic:
  1. Check the dialect-registered primary field name first (e.g., `tasks` for mason, `commands` for Claude)
  2. If not found, check the alias (`commands` if primary is `tasks`, or `tasks` if primary is `commands`)
  3. If both are present, use the primary and emit a `console.warn()` message
- The alias logic is symmetric: mason dialect accepts `commands` as alias, Claude dialect accepts `tasks` as alias
- Only the `tasks`/`commands` pair is aliased; `mcp` and `skills` are not affected

## Capabilities

### Modified Capabilities
- `role-md-parser-dialect-registry`: The parser's `normalizeTasks()` function gains alias fallback logic for the `tasks`/`commands` field pair

## Impact

- **Modified**: `packages/shared/src/role/parser.ts` — `normalizeTasks()` function (lines 231-252)
- **New tests**: `packages/shared/tests/role-parser.test.ts` — 3 new test cases for alias behavior (PRD tests 24-26)
- **No schema changes**: The Zod `roleSchema` is unchanged
- **No dialect registry changes**: Aliasing is handled in the parser, not the registry
