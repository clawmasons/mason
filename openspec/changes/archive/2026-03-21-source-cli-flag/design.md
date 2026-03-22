## Context

PRD Section 5.1 defines a `--source <name>` flag for the `run` command that overrides the `sources` field on the resolved role. PRD Section 6.1 specifies that when used with `--role`, the CLI-provided sources replace (not merge with) the role's declared sources. The dialect registry (`packages/shared/src/role/dialect-registry.ts`) already has `getDialect()` (lookup by registry key) and `getDialectByDirectory()` (lookup by directory name), but no single function that accepts all three input forms (`.claude`, `claude`, `claude-code-agent`).

The `createRunAction()` function in `run-agent.ts` resolves the role at line 601 and passes it to `runAgent()` at lines 651-684. The source override needs to happen after role resolution but before the role reaches mode-specific functions where materialization occurs.

## Goals / Non-Goals

**Goals:**
- Add `resolveDialectName()` to the dialect registry that normalizes any accepted input form to the registry key
- Add repeatable `--source` flag to the `run` command using Commander's `Option` class
- Validate and normalize `--source` values in `createRunAction()` before passing to `runAgent()`
- Override `roleType.sources` when `--source` is provided with `--role`
- Error with available sources list when an invalid `--source` value is given
- Unit tests for `resolveDialectName()` and the source override flow

**Non-Goals:**
- Project role generation when `--source` is used without `--role` (Change 5)
- Modifying `resolveRole()` — sources are overridden after resolution
- Adding `--source` to the `configure` command

## Decisions

### D1: Add `resolveDialectName()` to dialect-registry.ts

**Choice:** Add a single normalization function that tries all three lookup strategies in order: exact registry key match via `getDialect()`, directory name match via `getDialectByDirectory()` (with dot-prefix stripped), and directory match again (for bare directory names like `claude`).

**Rationale:** The PRD specifies three accepted forms. A single function encapsulates the normalization logic, keeping the CLI code clean. This function belongs in the dialect registry module since it's dialect-specific logic.

```typescript
export function resolveDialectName(input: string): string | undefined {
  // 1. Exact registry key match (e.g., "claude-code-agent")
  if (getDialect(input)) return input;
  // 2. Strip leading dot and try directory lookup (e.g., ".claude" → "claude")
  const stripped = input.startsWith(".") ? input.slice(1) : input;
  const entry = getDialectByDirectory(stripped);
  return entry?.name;
}
```

### D2: Use Commander `Option` with custom argParser for repeatable flag

**Choice:** Use `new Option("--source <name>", "...").argParser()` to collect values into an array, rather than Commander's built-in variadic syntax.

**Rationale:** Commander's `.option("--source <name...>")` variadic syntax consumes all subsequent positional args, which would break the `[prompt]` argument. Using `.argParser()` with a collecting function handles the repeatable case correctly: `--source claude --source codex`.

```typescript
import { Option } from "commander";

const sourceOption = new Option(
  "--source <name>",
  "Agent source directory to scan (repeatable). Overrides role sources."
).argParser((value: string, previous: string[]) => {
  return [...(previous ?? []), value];
});
```

### D3: Validate and override sources in createRunAction(), pass to runAgent()

**Choice:** Validate/normalize `--source` values in `createRunAction()` after role resolution. Mutate `roleType.sources` directly since the role object is not shared.

**Rationale:** `createRunAction()` is the single point where CLI options are parsed. Validation here gives clean error messages before any Docker or materialization work. The role object returned by `resolveRole()` is a fresh instance per invocation, so mutation is safe.

The override happens in `runAgent()` via a new `sourceOverride` parameter, which is applied after role resolution in each mode function. This keeps the override close to where `roleType` is used.

**Alternative considered:** Passing sources through `runAgent()` options and applying in each mode function. Rejected because it would require modifying four mode function signatures. Instead, we thread the override through `runAgent()` and apply it in the centralized orchestrator before mode dispatch. However, role resolution happens inside mode functions, not in `runAgent()`. So the cleanest approach is: validate in `createRunAction()`, pass normalized sources to `runAgent()`, and each mode function applies the override after its `resolveRoleFn()` call.

**Revised approach:** Add `sourceOverride?: string[]` to the `runAgent()` options. Each mode function applies `if (sourceOverride) roleType.sources = sourceOverride;` right after resolving the role. This is 3 lines added to 3 mode functions but keeps the pattern consistent with how `homeOverride` works.

### D4: Error format for invalid sources

**Choice:** Match PRD Section 8.3 format exactly:
```
Error: Unknown source "<value>". Available sources: claude, codex, aider, mcp, mason.
```

**Rationale:** PRD specifies this exact format. The available sources list uses directory names (user-facing short names) not registry keys, since users will type directory names.

## Implementation

### Code Changes

**`dialect-registry.ts` — Add `resolveDialectName()`:**
```typescript
export function resolveDialectName(input: string): string | undefined {
  // Exact registry key match (e.g., "claude-code-agent")
  if (getDialect(input)) return input;
  // Strip leading dot and try directory lookup (e.g., ".claude" → "claude")
  const stripped = input.startsWith(".") ? input.slice(1) : input;
  const entry = getDialectByDirectory(stripped);
  return entry?.name;
}
```

**`run-agent.ts` — Add `--source` option to run command:**
```typescript
import { Option } from "commander";
// In registerRunCommand():
const sourceOption = new Option(
  "--source <name>",
  "Agent source directory to scan (repeatable). Overrides role sources."
).argParser((value: string, previous: string[]) => {
  return [...(previous ?? []), value];
});
// ...
.addOption(sourceOption)
```

**`run-agent.ts` — Add validation and normalization function (exported for testing):**
```typescript
export function normalizeSourceFlags(
  sources: string[],
): string[] {
  const normalized: string[] = [];
  for (const s of sources) {
    const resolved = resolveDialectName(s);
    if (!resolved) {
      const available = getKnownDirectories().join(", ");
      console.error(`\n  Error: Unknown source "${s}". Available sources: ${available}.\n`);
      process.exit(1);
    }
    normalized.push(resolved);
  }
  return normalized;
}
```

**`run-agent.ts` — In `createRunAction()`, add source to options type and pass to runAgent():**
```typescript
// options type gets: source?: string[];
// After role validation, before runAgent() calls:
const sourceOverride = options.source?.length
  ? normalizeSourceFlags(options.source)
  : undefined;
// Pass as new field in acpOptions/runAgent options
```

**`run-agent.ts` — In `runAgent()`, add `sourceOverride` field to options and thread to mode functions.**

**`run-agent.ts` — In each mode function, after `resolveRoleFn()` call:**
```typescript
if (sourceOverride?.length) {
  roleType.sources = sourceOverride;
}
```

### Test Coverage

1. **`dialect-registry.test.ts`** — Unit tests for `resolveDialectName()`:
   - Resolves exact registry key: `"claude-code-agent"` → `"claude-code-agent"`
   - Resolves short directory name: `"claude"` → `"claude-code-agent"`
   - Resolves dot-prefixed: `".claude"` → `"claude-code-agent"`
   - Returns undefined for unknown: `"gpt"` → `undefined`
   - Works for all registered dialects (codex, aider, mcp, mason)

2. **`run-agent.test.ts`** — Tests for source flag:
   - Run command has `--source` option registered
   - `normalizeSourceFlags()` normalizes valid inputs
   - `normalizeSourceFlags()` calls `process.exit(1)` for invalid inputs
   - Source override is applied to role's sources field (integration test via `runAgent()` with deps)
