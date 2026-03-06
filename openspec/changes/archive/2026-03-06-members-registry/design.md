# Design: Members Registry — `.chapter/members.json`

## Overview

This change introduces a centralized members registry at `.chapter/members.json` that tracks installed members, their types, and their enabled/disabled status. The registry is managed by a new `src/registry/members.ts` module and integrated with `chapter install` and `chapter list`.

## Registry Data Model

### `MemberEntry`

```typescript
interface MemberEntry {
  package: string;        // npm package name, e.g. "@acme/member-note-taker"
  memberType: "human" | "agent";
  status: "enabled" | "disabled";
  installedAt: string;    // ISO 8601 timestamp
}
```

### `MembersRegistry`

```typescript
interface MembersRegistry {
  members: Record<string, MemberEntry>;  // keyed by slug
}
```

### File Format

The registry is stored as a pretty-printed JSON file at `.chapter/members.json`:

```json
{
  "members": {
    "note-taker": {
      "package": "@acme/member-note-taker",
      "memberType": "agent",
      "status": "enabled",
      "installedAt": "2026-03-06T10:30:00.000Z"
    }
  }
}
```

## Module: `src/registry/members.ts`

### `readMembersRegistry(chapterDir: string): MembersRegistry`

- Read `.chapter/members.json` from `chapterDir`
- If file does not exist, return `{ members: {} }`
- Parse JSON and return typed result
- Throw on malformed JSON (file exists but is not valid JSON)

### `writeMembersRegistry(chapterDir: string, registry: MembersRegistry): void`

- Write the registry object to `chapterDir/members.json` with 2-space indentation
- Create the directory if it does not exist (using `recursive: true`)

### `addMember(chapterDir: string, slug: string, entry: MemberEntry): void`

- Read the current registry
- Set `registry.members[slug] = entry` (overwrites if exists)
- Write the updated registry

### `updateMemberStatus(chapterDir: string, slug: string, status: "enabled" | "disabled"): void`

- Read the current registry
- If `slug` is not found, throw an error
- Update `registry.members[slug].status = status`
- Write the updated registry

### `getMember(chapterDir: string, slug: string): MemberEntry | undefined`

- Read the current registry
- Return `registry.members[slug]` or `undefined` if not found

## Types: `src/registry/types.ts`

Export `MemberEntry` and `MembersRegistry` interfaces as described above.

## Integration: `src/cli/commands/install.ts`

After the success message (both agent and human paths), add a call to `addMember()`:

```typescript
import { addMember } from "../../registry/members.js";

// After successful install (both agent and human paths):
const chapterDir = path.join(rootDir, ".chapter");
addMember(chapterDir, member.slug, {
  package: member.name,
  memberType: member.memberType,
  status: "enabled",
  installedAt: new Date().toISOString(),
});
```

For human members, add the call before the early return. For agent members, add the call after all files are written and log/ is created.

## Integration: `src/cli/commands/list.ts`

Update the list command to show member status from the registry:

```typescript
import { readMembersRegistry } from "../../registry/members.js";

// After resolving members, read the registry:
const chapterDir = path.join(rootDir, ".chapter");
const registry = readMembersRegistry(chapterDir);

// In the tree output, show status:
// @test/member-ops@1.0.0 (agent, enabled)
// @test/member-alice@1.0.0 (human, disabled)
```

The status display format:
- `(agent, enabled)` or `(human, enabled)` for enabled members
- `(agent, disabled)` or `(human, disabled)` for disabled members
- `(agent)` or `(human)` when member is not in the registry (not yet installed)

## Edge Cases

1. **No `.chapter/` directory**: `readMembersRegistry()` handles this by returning an empty registry. `addMember()` creates the directory if needed via `writeMembersRegistry()`.

2. **Concurrent writes**: Not handled. The registry is a single JSON file; concurrent `chapter install` commands could conflict. This is acceptable for v1.

3. **Reinstall updates entry**: When `addMember()` is called for an existing slug, the entry is fully replaced. The `installedAt` timestamp is refreshed.

4. **Member not in registry**: When `chapter list` encounters a member package that is not in the registry (e.g., never installed), it shows the member type without status.

5. **Registry without corresponding package**: If a member is in the registry but the package has been removed from the workspace, the registry entry is stale. This is not cleaned up automatically in this change.

## Test Plan

### Unit tests: `tests/registry/members.test.ts`

1. `readMembersRegistry` returns empty registry when file does not exist
2. `readMembersRegistry` parses valid registry file
3. `writeMembersRegistry` creates file with proper JSON format
4. `writeMembersRegistry` creates directory if it does not exist
5. `addMember` adds a new member entry
6. `addMember` overwrites existing member entry (updates timestamp)
7. `updateMemberStatus` changes status from enabled to disabled
8. `updateMemberStatus` throws when slug not found
9. `getMember` returns entry for existing member
10. `getMember` returns undefined for non-existent member

### Integration tests: `tests/cli/install.test.ts`

1. `chapter install` creates `members.json` with correct entry
2. Reinstalling same member updates the entry
3. Human member install also updates the registry

### Integration tests: `tests/cli/list.test.ts`

1. `chapter list` shows member type and status when registry exists
2. `chapter list` shows member type without status when registry does not exist
