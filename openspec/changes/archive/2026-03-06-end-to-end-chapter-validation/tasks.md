# Tasks: End-to-End Validation -- Full Chapter Workflow

## Task 1: Add members registry verification (Step 6)

- [x] Add test case "step 6: members registry is populated after install"
- [x] Read `.chapter/members.json` after install
- [x] Verify entry for slug `note-taker` exists
- [x] Verify entry fields: status, memberType, package, installedAt

## Task 2: Add per-member directory completeness check (Step 7)

- [x] Add test case "step 7: per-member directory structure is complete"
- [x] Verify `log/`, `proxy/`, `claude-code/workspace/` directories exist
- [x] Verify `docker-compose.yml`, `.env`, `chapter.lock.json` files exist

## Task 3: Add disable workflow test (Step 8)

- [x] Import `runDisable` from enable/disable commands
- [x] Add test case "step 8: chapter disable updates registry"
- [x] Call `runDisable(tmpDir, "@note-taker")`
- [x] Read registry and verify status is "disabled"
- [x] Verify other fields preserved

## Task 4: Add disabled member run rejection test (Step 9)

- [x] Add test case "step 9: disabled member is blocked from running"
- [x] Verify `getMember()` returns status "disabled" for the member
- [x] Confirm the run command's guard logic would reject this member

## Task 5: Add enable workflow test (Step 10)

- [x] Import `runEnable` from enable commands
- [x] Add test case "step 10: chapter enable re-enables member"
- [x] Call `runEnable(tmpDir, "@note-taker")`
- [x] Read registry and verify status is "enabled"

## Task 6: Add forge-remnant check (Step 11)

- [x] Add test case "step 11: no forge references in generated files"
- [x] Check docker-compose.yml, .env, chapter.lock.json, members.json for "forge" (case-insensitive)
- [x] Include per-line context in error messages for debugging
- [x] Verify zero forge references in generated config/compose/env/lock files
- [x] Fixed: discovered and removed stale `dist/schemas/forge-field.*` build artifacts

## Task 7: Update spec

- [x] Create `openspec/specs/e2e-chapter-workflow/spec.md` with all scenarios
- [x] Verify spec matches implementation

## Task 8: Run full test suite

- [x] Run `npx tsc --noEmit` -- clean
- [x] Run `npx eslint src/ tests/` -- clean
- [x] Run `npx vitest run` -- 634 tests pass across 40 test files
