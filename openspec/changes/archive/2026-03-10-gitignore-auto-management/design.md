# Design: .gitignore Auto-Management Utility

**Date:** 2026-03-10

## Approach

A single module at `packages/cli/src/runtime/gitignore.ts` provides two functions for managing `.gitignore` entries. The module is intentionally minimal -- it only deals with appending patterns to existing `.gitignore` files and does not create `.gitignore` files from scratch.

### Key Design Decisions

1. **No .gitignore creation** -- If a project directory does not have a `.gitignore` file, the utility is a no-op. We don't create `.gitignore` because the absence of one signals the project may not use git, or uses a different VCS. The PRD (§4.3) states: "checks if the parent directory has a `.gitignore`. If it does and `.clawmasons` is not already ignored, a line is appended."

2. **Pattern matching is line-based** -- `hasGitignoreEntry()` checks if any trimmed, non-empty line in the `.gitignore` exactly matches the given pattern. This handles common cases (exact match, surrounding whitespace) without attempting to interpret gitignore glob semantics.

3. **Trailing newline preservation** -- When appending, the utility ensures there's a newline before the new entry so patterns don't merge with the last line. If the file already ends with a newline, no extra blank line is added.

4. **Return value signals action taken** -- `ensureGitignoreEntry()` returns `true` if it appended the pattern, `false` if it was already present or `.gitignore` doesn't exist. Callers can use this for logging.

### Function Signatures

```typescript
/**
 * Ensure a pattern is present in the .gitignore at the given directory.
 * Returns true if the pattern was appended, false if already present or no .gitignore exists.
 */
function ensureGitignoreEntry(dir: string, pattern: string): boolean;

/**
 * Check if a .gitignore file contains a given pattern (exact line match, trimmed).
 * Returns false if the file does not exist.
 */
function hasGitignoreEntry(gitignorePath: string, pattern: string): boolean;
```

### Usage by Future Changes

| Consumer | Usage |
|----------|-------|
| `run-agent` (Change #5) | `ensureGitignoreEntry(projectDir, ".clawmasons")` after creating `.clawmasons/` |
| `run-acp-agent` / bridge (Change #7) | `ensureGitignoreEntry(cwd, ".clawmasons")` when processing `session/new` |

### Error Handling

| Scenario | Behavior |
|----------|----------|
| `.gitignore` doesn't exist | `ensureGitignoreEntry` returns `false` (no-op) |
| `.gitignore` already contains pattern | Returns `false` (no-op) |
| `.gitignore` exists without pattern | Appends pattern, returns `true` |
| File read/write permissions error | Throws native fs error |

### Backward Compatibility

This is a new module with no existing API to maintain. No existing code is modified.
