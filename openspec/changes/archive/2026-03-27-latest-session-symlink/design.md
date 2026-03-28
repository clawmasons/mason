## Context

The session store in `packages/shared/src/session/session-store.ts` provides CRUD operations for session metadata stored in `.mason/sessions/{id}/meta.json`. CHANGE 1 (universal meta.json) already ensures every session -- CLI and ACP -- creates a `meta.json` via `createSession()`. Now we need a fast way to find the most recently started session for `mason run --resume` (without an explicit ID).

The PRD (section 4.4) specifies a `.mason/sessions/latest` symbolic link pointing to the most recent session directory, updated atomically on every session start.

## Goals / Non-Goals

**Goals:**
- Add `updateLatestSymlink()` that atomically creates/updates `.mason/sessions/latest` as a relative symlink
- Add `resolveLatestSession()` that reads the symlink and returns the session ID
- Integrate into `createSession()` so the symlink is updated on every session start
- Comprehensive unit test coverage for all six testable outputs

**Non-Goals:**
- Validating that the symlink target actually contains a valid `meta.json` (that's the caller's responsibility)
- Removing stale symlinks pointing to deleted sessions (out of scope per PRD NG-5)
- Using the symlink in the CLI's `--resume` flag (that's CHANGE 6)

## Decisions

### 1. Relative symlink target

The symlink at `.mason/sessions/latest` points to just the session ID (e.g., `019d2b36-...`), not an absolute path. This makes the symlink portable -- moving the project directory doesn't break it. `resolveLatestSession()` reads the symlink target string directly as the session ID.

**Alternative**: Absolute symlink -- rejected because it breaks when the project is moved and violates the PRD's intent of a relative link.

### 2. Atomic update via create-temp-then-rename

To avoid a race where a concurrent `resolveLatestSession()` call reads a partially created symlink:

1. Create a temporary symlink at `.mason/sessions/.latest-tmp-{random}` pointing to the session ID
2. Rename (atomic on POSIX) the temp symlink over `.mason/sessions/latest`

This matches the same atomic-write pattern already used for `meta.json` in `writeMetaAtomic()`.

**Alternative**: `unlink` then `symlink` -- rejected because there's a window where `latest` doesn't exist, causing `resolveLatestSession()` to return `null` incorrectly.

### 3. `resolveLatestSession()` returns `string | null`

Returns the raw symlink target (the session ID string) or `null` if:
- The symlink doesn't exist
- The symlink can't be read (permissions, etc.)

It does NOT validate that the target session directory exists or has a valid `meta.json`. This keeps the function simple and fast. The caller (CHANGE 6's `--resume` flow) is responsible for calling `readSession()` on the returned ID and handling the case where the session doesn't exist.

### 4. Integration into `createSession()`

`createSession()` calls `updateLatestSymlink(cwd, session.sessionId)` after `writeMetaAtomic()` succeeds. This ensures:
- The symlink always points to a session that has a valid `meta.json`
- Both CLI and ACP sessions update the symlink (since both call `createSession()`)

If the symlink update fails (e.g., filesystem permissions), `createSession()` still succeeds -- the session is created, just the symlink is stale. This is a deliberate choice: failing to create a convenience symlink should not prevent session creation.

### 5. Node.js fs API usage

- `fs.symlink(target, path)` -- creates the temp symlink
- `fs.readlink(path)` -- reads the symlink target in `resolveLatestSession()`
- `fs.rename(oldPath, newPath)` -- atomic rename for the swap
- `randomBytes` (already imported) -- for temp filename uniqueness

## Test Coverage

### Unit tests (packages/shared/tests/session/session-store.test.ts)

New `describe("updateLatestSymlink")` and `describe("resolveLatestSession")` blocks:

- **(a)** `updateLatestSymlink()` creates a symlink at `.mason/sessions/latest` -- verify the file exists and `lstat` reports it as a symlink
- **(b)** Symlink target is relative (just the session ID, not an absolute path) -- read with `readlink` and assert it equals the session ID string
- **(c)** `resolveLatestSession()` returns the session ID from the symlink -- create a symlink, call resolve, assert the returned string matches
- **(d)** Calling `updateLatestSymlink()` twice overwrites the first symlink -- create with ID1, then ID2, verify `readlink` returns ID2
- **(e)** `resolveLatestSession()` returns `null` when symlink doesn't exist -- call on a fresh temp directory with no sessions
- **(f)** `createSession()` automatically updates the symlink -- call `createSession()`, verify `.mason/sessions/latest` points to the new session ID

## Risks / Trade-offs

**[Symlink on Windows]** -- `fs.symlink` on Windows may require elevated permissions or developer mode. This is acceptable because mason primarily targets Unix-like systems, and Docker Desktop on Windows already requires similar privileges.

**[Dangling symlink after session deletion]** -- If a user manually deletes a session directory, `.mason/sessions/latest` becomes a dangling symlink. `resolveLatestSession()` will return the session ID, but `readSession()` will return `null`. The caller handles this gracefully. This is by design per PRD NG-5 (no garbage collection).

**[Non-atomic on some filesystems]** -- The rename-over-symlink atomicity guarantee holds on POSIX filesystems (ext4, APFS, etc.) but may not on network filesystems (NFS, SMB). This is acceptable for `.mason/` which is always local.
