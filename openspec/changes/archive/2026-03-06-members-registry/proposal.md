# Proposal: Members Registry — `.chapter/members.json`

**Change:** #7 from chapter-members IMPLEMENTATION.md
**PRD refs:** REQ-006 (Members Registry)
**Date:** 2026-03-06

## Problem

After `chapter install` scaffolds a member's directory under `.chapter/members/<slug>/`, there is no centralized record of which members are installed, their types, or their operational status. The system has no way to:

1. Track which members have been installed and when
2. Know whether a member is enabled or disabled (needed by future `chapter enable`/`chapter disable` commands in Change #8)
3. Show member status in `chapter list` output
4. Prevent `chapter run` from starting disabled members (Change #8 dependency)

## Proposed Solution

Create a members registry module that manages `.chapter/members.json`. The registry is a simple JSON file that records installed members with their metadata and status.

### Registry Structure

```json
{
  "members": {
    "note-taker": {
      "package": "@acme/member-note-taker",
      "memberType": "agent",
      "status": "enabled",
      "installedAt": "2026-03-05T10:30:00Z"
    },
    "alice": {
      "package": "@acme/member-alice",
      "memberType": "human",
      "status": "enabled",
      "installedAt": "2026-03-05T10:30:00Z"
    }
  }
}
```

### Module Functions

- `readMembersRegistry(chapterDir)` — Read and parse `.chapter/members.json`, returning an empty registry if the file does not exist
- `writeMembersRegistry(chapterDir, registry)` — Write the registry to `.chapter/members.json`
- `addMember(chapterDir, slug, entry)` — Add or update a member entry in the registry
- `updateMemberStatus(chapterDir, slug, status)` — Update a member's status (enabled/disabled)
- `getMember(chapterDir, slug)` — Get a member entry by slug, returning undefined if not found

### Integration Points

1. **`chapter install`** — After successful installation, call `addMember()` to add/update the member in the registry with status `"enabled"` and current timestamp
2. **`chapter list`** — Read the registry and display member status (enabled/disabled) alongside the dependency tree

## Scope

### New files
- `src/registry/members.ts` — Registry CRUD functions
- `src/registry/types.ts` — TypeScript types for MembersRegistry and MemberEntry
- `tests/registry/members.test.ts` — Unit tests for registry functions

### Modified files
- `src/cli/commands/install.ts` — Call `addMember()` after successful install
- `src/cli/commands/list.ts` — Show member status from registry
- `tests/cli/install.test.ts` — Add tests verifying registry is updated
- `tests/cli/list.test.ts` — Add tests verifying status display

### Spec files
- `openspec/specs/members-registry/spec.md` — New spec for the registry module
- `openspec/specs/forge-install-command/spec.md` — Add registry integration requirement
- `openspec/specs/list-command/spec.md` — Add status display requirement, update to member terminology

## Acceptance Criteria

1. After `chapter install @member`, `.chapter/members.json` exists with a correct entry for the member (slug, package, memberType, status: "enabled", installedAt timestamp)
2. Reinstalling the same member updates (not duplicates) the entry and refreshes the timestamp
3. `chapter list` output includes member status (enabled/disabled) from the registry
4. Unit tests for all registry functions (read, write, addMember, updateMemberStatus, getMember) pass
5. `npx tsc --noEmit`, `npx vitest run`, and `npx eslint src/ tests/` all pass
