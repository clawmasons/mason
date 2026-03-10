# Tasks: .gitignore Auto-Management Utility

**Date:** 2026-03-10

## Completed

- [x] Create `packages/cli/src/runtime/gitignore.ts`
- [x] Implement `hasGitignoreEntry(gitignorePath, pattern)` -- line-based exact match
- [x] Implement `ensureGitignoreEntry(dir, pattern)` -- orchestrate check + append
- [x] Create `packages/cli/tests/runtime/gitignore.test.ts`
- [x] Test: appends pattern when `.gitignore` exists but doesn't contain it
- [x] Test: no-op when pattern already present
- [x] Test: no-op when `.gitignore` doesn't exist
- [x] Test: handles `.gitignore` with trailing newline
- [x] Test: handles `.gitignore` without trailing newline
- [x] Test: `hasGitignoreEntry` returns false for non-existent file
- [x] Test: `hasGitignoreEntry` ignores blank lines and whitespace
- [x] Verify type check passes (`npx tsc --noEmit`)
- [x] Verify lint passes
- [x] Verify all tests pass (947 tests, including 11 new runtime/gitignore tests)
