# Tasks: Update Templates for Chapter + Member Model

**Change:** #9 from chapter-members IMPLEMENTATION.md
**Date:** 2026-03-06

## Task List

- [x] **T1: Add `authProviders: []` to template member package.json**
  - File: `templates/note-taker/members/note-taker/package.json`
  - Added `"authProviders": []` to the chapter field, after `email`
  - Matches PRD section 4.1 agent member example

- [x] **T2: Add schema validation test for template output**
  - File: `tests/cli/init.test.ts`
  - Added test in the `--template flag` describe block
  - Initializes with template, reads generated member package.json, parses with `parseChapterField()`, asserts valid member with `type: "member"` and `memberType: "agent"`
  - Updated test template setup to include `authProviders: []` to match real template

- [x] **T3: Update workspace-init spec with template validation scenario**
  - File: `openspec/specs/workspace-init/spec.md`
  - Added two scenarios under "Template directory structure" requirement:
    - Template member includes identity fields (name, slug, email, authProviders)
    - Template member validates against member schema after init

- [x] **T4: Verify all tests pass**
  - `npx tsc --noEmit` -- passes
  - `npx eslint src/ tests/` -- passes
  - `npx vitest run` -- 628 tests pass (40 test files)
