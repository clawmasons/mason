# Tasks: Update OpenSpec Specs for Chapter Terminology

**Change:** #10 from chapter-members IMPLEMENTATION.md
**Date:** 2026-03-06

## Task List

- [x] **T1: Rename `forge-install-command` spec directory to `install-command`**
  - Renamed: `openspec/specs/forge-install-command/` -> `openspec/specs/install-command/`
  - Verified: spec.md content unchanged after rename

- [x] **T2: Update chapter-members IMPLEMENTATION.md links**
  - File: `openspec/prds/chapter-members/IMPLEMENTATION.md`
  - Replaced 5 occurrences of `forge-install-command` with `install-command` in spec links
  - Lines: 132, 175, 230, 263, 302

- [x] **T3: Update forge-initial IMPLEMENTATION.md live spec link**
  - File: `openspec/prds/forge-initial/IMPLEMENTATION.md`
  - Replaced 1 occurrence of `forge-install-command` in the live spec link (line 220)
  - Left the archived spec link on line 219 unchanged (points to archive directory)

- [x] **T4: Verify no forge-named directories remain in specs**
  - `ls openspec/specs/ | grep forge` -- returns empty
  - `grep -r 'forge-install-command' openspec/prds/` -- returns only archived reference in forge-initial

- [x] **T5: Verify all tests pass**
  - `npx tsc --noEmit` -- passes
  - `npx eslint src/ tests/` -- passes
  - `npx vitest run` -- 628 tests pass (40 test files)
