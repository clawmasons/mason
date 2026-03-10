# Tasks: CLAWMASONS_HOME Utility & chapters.json

**Date:** 2026-03-10

## Completed

- [x] Create `packages/cli/src/runtime/home.ts` with types `ChapterEntry` and `ChaptersJson`
- [x] Implement `getClawmasonsHome()` -- reads `CLAWMASONS_HOME` env var, defaults to `~/.clawmasons`
- [x] Implement `ensureClawmasonsHome(home)` -- creates directory and `.gitignore` if missing
- [x] Implement `readChaptersJson(home)` -- reads and parses `chapters.json`, returns empty on missing
- [x] Implement `writeChaptersJson(home, data)` -- atomic write via temp file + rename
- [x] Implement `findRoleEntry(home, lodge, chapter, role)` -- lookup by composite key
- [x] Implement `upsertRoleEntry(home, entry)` -- insert or update by composite key
- [x] Create `packages/cli/tests/runtime/home.test.ts`
- [x] Test: `getClawmasonsHome()` reads env var
- [x] Test: `getClawmasonsHome()` defaults to `~/.clawmasons` when unset
- [x] Test: `readChaptersJson` returns empty chapters when file missing
- [x] Test: `readChaptersJson` parses valid file
- [x] Test: `readChaptersJson` throws on malformed JSON
- [x] Test: `writeChaptersJson` creates file with correct content
- [x] Test: `upsertRoleEntry` creates new entry
- [x] Test: `upsertRoleEntry` updates existing entry by composite key
- [x] Test: `findRoleEntry` returns matching entry
- [x] Test: `findRoleEntry` returns undefined when not found
- [x] Test: `ensureClawmasonsHome` creates directory and `.gitignore`
- [x] Test: `ensureClawmasonsHome` is idempotent
- [x] Verify type check passes (`npx tsc --noEmit`)
- [x] Verify lint passes
- [x] Verify all tests pass (936 tests, including 18 new runtime/home tests)
