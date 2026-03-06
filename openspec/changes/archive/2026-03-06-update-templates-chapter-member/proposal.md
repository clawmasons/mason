# Proposal: Update Templates for Chapter + Member Model

**Change:** #9 from chapter-members IMPLEMENTATION.md
**PRD refs:** REQ-004 (Rename npm Packages -- template portion), REQ-005 (Member Package Type -- template component)
**Date:** 2026-03-06

## Problem

The `templates/note-taker/` template was partially updated during Changes #1-#5 (metadata field rename, npm package rename, member package type). However, the template has not been formally verified as a complete, self-consistent chapter + member template. Specifically:

1. The template member `package.json` is missing the `authProviders` field that the PRD shows in the agent member example (section 4.1).
2. There is no test that verifies `chapter validate` succeeds on template-initialized output.
3. The workspace-init spec needs a requirement ensuring template output validates against the member schema.

## Proposed Solution

1. **Add `authProviders: []`** to `templates/note-taker/members/note-taker/package.json` to match the PRD agent member example.

2. **Add init test** verifying that template-initialized member packages validate against the member schema (use `parseChapterField()` on the substituted template output).

3. **Update workspace-init spec** with a requirement that template member packages validate against the member schema after placeholder substitution.

## Scope

### Source files modified
- `templates/note-taker/members/note-taker/package.json` -- add `authProviders: []`

### Test files modified
- `tests/cli/init.test.ts` -- add test verifying template member validates against schema

### Spec files updated
- `openspec/specs/workspace-init/spec.md` -- add requirement for template schema validation

## Acceptance Criteria

1. `templates/note-taker/members/note-taker/package.json` includes `authProviders: []`
2. After `chapter init --template note-taker --name @acme/my-project`, the generated `members/note-taker/package.json` has `type: "member"`, `memberType: "agent"`, uses `chapter` metadata key, and validates against the member schema
3. The generated root `package.json` depends on `@clawmasons/chapter-core`
4. `chapter validate` would succeed on the init output (template member validates against schema)
5. All tests pass (627+)
