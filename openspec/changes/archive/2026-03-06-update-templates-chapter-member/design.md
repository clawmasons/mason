# Design: Update Templates for Chapter + Member Model

**Change:** #9 from chapter-members IMPLEMENTATION.md
**Date:** 2026-03-06

## Overview

This change ensures the `templates/note-taker/` template fully aligns with the chapter + member model defined in the PRD. Most heavy lifting was done in prior changes (#1 renamed metadata field, #2 renamed packages and directories, #5 introduced the member schema). This change fills the remaining gaps and adds verification.

## Design Decisions

### 1. Add `authProviders` to template member

The PRD section 4.1 shows `"authProviders": []` in the agent member example. While optional in the schema (defaults to `[]`), including it in the template serves as documentation for users -- it shows them the field exists and where to configure auth providers. This matches the `chapter-core/members/note-taker/package.json` pattern.

**Template member package.json after change:**
```json
{
  "name": "@{{projectScope}}/member-note-taker",
  "version": "1.0.0",
  "description": "Note-taker member -- creates and organizes markdown notes via filesystem MCP server",
  "chapter": {
    "type": "member",
    "memberType": "agent",
    "name": "Note Taker",
    "slug": "note-taker",
    "email": "note-taker@chapter.local",
    "authProviders": [],
    "description": "A note-taking agent that reads, writes, and organizes markdown files.",
    "runtimes": ["claude-code"],
    "roles": ["@{{projectScope}}/role-writer"]
  }
}
```

### 2. Schema validation test for template output

Add a test to `tests/cli/init.test.ts` that:
1. Runs `chapter init --template test-template --name @acme/my-project`
2. Reads the generated `members/note-taker/package.json`
3. Parses it with `parseChapterField()` from the schemas module
4. Asserts the parse succeeds and the result has `type: "member"` and `memberType: "agent"`

This ensures template output is always schema-valid, catching regressions if the member schema changes.

### 3. Spec update

Add a scenario to `openspec/specs/workspace-init/spec.md` under the template requirements:

```
#### Scenario: Template member validates against schema
- **WHEN** `chapter init --template note-taker --name @acme/my-project` is run
- **THEN** the generated `members/note-taker/package.json` has `chapter.type` = `"member"`, `chapter.memberType` = `"agent"`, and validates against the member schema
```

## Files Changed

| File | Change |
|------|--------|
| `templates/note-taker/members/note-taker/package.json` | Add `authProviders: []` |
| `tests/cli/init.test.ts` | Add schema validation test for template output |
| `openspec/specs/workspace-init/spec.md` | Add template schema validation scenario |
