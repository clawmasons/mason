# Design: Update OpenSpec Specs for Chapter Terminology

**Change:** #10 from chapter-members IMPLEMENTATION.md
**Date:** 2026-03-06

## Overview

This is a documentation-only change that renames the last remaining "forge"-named spec directory and updates all references. No source code, test code, or spec content is modified -- only directory names and markdown links.

## Design Decisions

### 1. Rename to `install-command` (not `chapter-install-command`)

The existing spec naming convention uses feature-descriptive names without the product prefix:
- `add-command` (not `chapter-add-command`)
- `remove-command` (not `chapter-remove-command`)
- `build-command`, `run-command`, `stop-command`, `list-command`, etc.

Following this convention, `forge-install-command` becomes `install-command`.

### 2. Do not modify archived changes

Archived changes under `openspec/changes/archive/` are historical records that document what happened at a point in time. Their references to `forge-install-command` were correct when written. Modifying them would rewrite history.

References in archived changes that point to `openspec/specs/forge-install-command/spec.md` will have broken links, but this is acceptable -- archived changes are reference documents, not live navigation tools.

### 3. Update both PRD IMPLEMENTATION files

Both `chapter-members/IMPLEMENTATION.md` and `forge-initial/IMPLEMENTATION.md` contain links to the live spec. These must be updated so the links resolve correctly. The `forge-initial` IMPLEMENTATION also has a link to the archived spec which remains unchanged.

## Files Changed

| File | Change |
|------|--------|
| `openspec/specs/forge-install-command/` | Renamed directory to `openspec/specs/install-command/` |
| `openspec/prds/chapter-members/IMPLEMENTATION.md` | Updated 5 spec links: `forge-install-command` -> `install-command` |
| `openspec/prds/forge-initial/IMPLEMENTATION.md` | Updated 1 live spec link: `forge-install-command` -> `install-command` |
