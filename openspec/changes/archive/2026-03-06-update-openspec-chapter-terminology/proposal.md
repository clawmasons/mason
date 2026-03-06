# Proposal: Update OpenSpec Specs for Chapter Terminology

**Change:** #10 from chapter-members IMPLEMENTATION.md
**PRD refs:** REQ-010 (Rename Internal References -- documentation portion)
**Date:** 2026-03-06

## Problem

Changes #1-#9 updated all spec file **content** to use chapter terminology (chapter field, CHAPTER_* env vars, .chapter/ paths, member references). However, one spec **directory name** still uses the old "forge" naming:

1. `openspec/specs/forge-install-command/` -- directory name still says "forge" while the spec content inside already references "chapter install" throughout.
2. All references to this directory in `IMPLEMENTATION.md` (chapter-members PRD) use the stale path `../../specs/forge-install-command/spec.md`.
3. The `forge-initial` PRD's `IMPLEMENTATION.md` also links to the live spec via the old path.

The spec content itself is already fully updated -- this change only addresses the directory naming and link references.

## Proposed Solution

1. **Rename spec directory:** `openspec/specs/forge-install-command/` to `openspec/specs/install-command/`
   - Use `install-command` (not `chapter-install-command`) to follow the existing naming convention where spec directories describe the feature, not the product name (e.g., `add-command`, `remove-command`, `build-command`, `run-command`).

2. **Update IMPLEMENTATION.md references:** Update all links in `openspec/prds/chapter-members/IMPLEMENTATION.md` from `forge-install-command` to `install-command`.

3. **Update forge-initial IMPLEMENTATION.md:** Update the live spec link in `openspec/prds/forge-initial/IMPLEMENTATION.md` (the archived spec link stays as-is since it points to the archive directory).

4. **Do NOT modify archived changes** -- those are historical records.

## Scope

### Spec directories renamed
- `openspec/specs/forge-install-command/` -> `openspec/specs/install-command/`

### Files modified
- `openspec/prds/chapter-members/IMPLEMENTATION.md` -- update 5 links from `forge-install-command` to `install-command`
- `openspec/prds/forge-initial/IMPLEMENTATION.md` -- update 1 link from `forge-install-command` to `install-command`

### Files NOT modified
- Archived changes in `openspec/changes/archive/` -- historical record, left as-is
- Spec content files -- already fully updated in prior changes

## Acceptance Criteria

1. `openspec/specs/forge-install-command/` no longer exists
2. `openspec/specs/install-command/spec.md` exists with identical content
3. All links in `IMPLEMENTATION.md` files resolve correctly
4. Grepping `openspec/specs/` directory names for `forge` returns zero results
5. All tests pass (no source code changes, so no regressions expected)
