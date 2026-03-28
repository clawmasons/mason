## Why

When a developer runs `mason run --resume` (without specifying a session ID), the CLI needs a fast, reliable way to find the most recently started session. Currently there is no mechanism for this -- the only option would be scanning all session directories and comparing timestamps, which is fragile and slow.

The PRD (section 4.4) specifies a `.mason/sessions/latest` symbolic link that always points to the most recently started session directory. This provides O(1) lookup for resume-latest and is updated atomically on every session start.

## What Changes

- Add `updateLatestSymlink(cwd, sessionId)` function to `packages/shared/src/session/session-store.ts`:
  - Creates/updates `.mason/sessions/latest` as a relative symlink pointing to `{sessionId}`
  - Uses the create-temp-then-rename pattern for atomicity (no partial reads during concurrent access)

- Add `resolveLatestSession(cwd)` function to `packages/shared/src/session/session-store.ts`:
  - Reads the `.mason/sessions/latest` symlink target
  - Returns the session ID string, or `null` if the symlink doesn't exist or is unreadable

- Update `createSession()` to call `updateLatestSymlink()` after writing `meta.json`, so every session start (CLI and ACP) automatically updates the symlink

- Export both new functions from `packages/shared/src/session/index.ts`

## Capabilities

### New Capabilities

- `updateLatestSymlink(cwd, sessionId)` -- atomically creates/updates the latest symlink
- `resolveLatestSession(cwd)` -- reads the symlink target to get the most recent session ID

### Modified Capabilities

- `createSession()` now also updates the latest symlink after writing `meta.json`

## Impact

- **Code**: `packages/shared/src/session/session-store.ts` (two new functions + `createSession` modification), `packages/shared/src/session/index.ts` (exports)
- **Dependencies**: No new external dependencies; uses `node:fs/promises` (already imported) for `symlink`, `readlink`, `rename`, `unlink`
- **Testing**: New unit tests for all six testable outputs specified in IMPLEMENTATION.md
- **Compatibility**: Fully backward compatible -- the symlink is a new artifact that doesn't affect existing behavior. Sessions created before this change won't have the symlink, which `resolveLatestSession` handles by returning `null`.
