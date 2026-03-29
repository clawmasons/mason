## Context

The ROLE.md parser in `packages/shared/src/role/parser.ts` normalizes dialect-specific field names to generic internal names. The `normalizeTasks()` function reads the task field using the dialect's registered field name (e.g., `commands` for Claude, `tasks` for mason, `instructions` for Codex, `conventions` for Aider).

The problem: if a user writes `commands:` in a mason-dialect ROLE.md (where the primary field is `tasks`), the tasks are silently ignored. PRD section 5 requires bidirectional aliasing between `tasks` and `commands`.

**Key files:**
- `packages/shared/src/role/parser.ts` — `normalizeTasks()` function (lines 231-252)
- `packages/shared/src/role/dialect-registry.ts` — `DialectEntry.fieldMapping.tasks` defines the primary field
- `packages/shared/tests/role-parser.test.ts` — existing parser tests

## Goals / Non-Goals

**Goals:**
- Accept `commands` as an alias for `tasks` in any dialect where the primary is `tasks` (mason)
- Accept `tasks` as an alias for `commands` in any dialect where the primary is `commands` (Claude)
- Emit a warning when both `tasks` and `commands` are present, using the primary
- Maintain backward compatibility — no existing behavior changes

**Non-Goals:**
- Aliasing for `mcp` or `skills` fields (all dialects already use the same names)
- Aliasing for Codex (`instructions`) or Aider (`conventions`) task fields — these are semantically distinct field names, not aliases
- Modifying the dialect registry or schema

## Decisions

### 1. Alias map is a constant, not derived from the registry

The alias relationship is specifically between `tasks` and `commands`. It is not a general "any field can alias any other field" mechanism. A simple constant map in `normalizeTasks()` is sufficient:

```typescript
const TASK_FIELD_ALIASES: Record<string, string> = {
  tasks: "commands",
  commands: "tasks",
};
```

This keeps the alias logic contained in the parser and avoids adding complexity to the dialect registry.

### 2. Primary always wins when both present

When both the primary field and alias are present in frontmatter, the primary is used and a `console.warn()` is emitted. This is deterministic and matches user expectations — the dialect's "official" field name takes precedence.

### 3. Only `tasks`/`commands` pair is aliased

The Codex dialect uses `instructions` and Aider uses `conventions` as their task field names. These are NOT aliased because they represent genuinely different naming conventions for different agent runtimes. The `tasks`/`commands` alias exists specifically because mason and Claude use interchangeable terminology for the same concept.

## Implementation

### Modified: `packages/shared/src/role/parser.ts` — `normalizeTasks()`

```typescript
// Alias map for the tasks/commands field pair
const TASK_FIELD_ALIASES: Record<string, string> = {
  tasks: "commands",
  commands: "tasks",
};

function normalizeTasks(
  frontmatter: Record<string, unknown>,
  dialect: DialectEntry,
): Array<Record<string, unknown>> {
  const fieldName = dialect.fieldMapping.tasks;
  const raw = frontmatter[fieldName];

  // Check for alias if primary field not found
  if (!raw) {
    const aliasField = TASK_FIELD_ALIASES[fieldName];
    if (aliasField) {
      const aliasRaw = frontmatter[aliasField];
      if (aliasRaw) {
        return normalizeTasksArray(aliasRaw);
      }
    }
    return [];
  }

  // Warn if both primary and alias are present
  const aliasField = TASK_FIELD_ALIASES[fieldName];
  if (aliasField && frontmatter[aliasField]) {
    console.warn(
      `Warning: Both "${fieldName}" and "${aliasField}" are present in ROLE.md frontmatter. Using "${fieldName}" (the ${dialect.name} dialect field). Remove one to avoid confusion.`
    );
  }

  return normalizeTasksArray(raw);
}

// Extract the array normalization into a helper
function normalizeTasksArray(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) {
    return [{ name: String(raw) }];
  }
  return raw.map((item: unknown) => {
    if (typeof item === "string") {
      return { name: item };
    }
    if (typeof item === "object" && item !== null && "name" in item) {
      return item as Record<string, unknown>;
    }
    return { name: String(item) };
  });
}
```

### Test Coverage

Three new test cases in `packages/shared/tests/role-parser.test.ts` (per PRD section 11.4, tests 24-26):

1. **Alias recognized (test 24):** Mason dialect ROLE.md with `commands:` field instead of `tasks:` — tasks are parsed correctly via alias fallback.

2. **Primary wins with warning (test 25):** Mason dialect ROLE.md with both `tasks:` and `commands:` — primary (`tasks`) is used, `console.warn` is called with the expected message.

3. **No alias needed — regression guard (test 26):** Mason dialect ROLE.md with `tasks:` field (the primary) — works as before, no alias logic triggered, no warning.

Additionally: Claude dialect ROLE.md with `tasks:` field instead of `commands:` — verifies the symmetric alias in the other direction.
