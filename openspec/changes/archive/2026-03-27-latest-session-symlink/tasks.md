## Tasks

- [x] 1. Add `updateLatestSymlink()` to `packages/shared/src/session/session-store.ts`
  - Import `symlink`, `readlink` from `node:fs/promises`
  - Add `latestSymlinkPath(cwd)` helper returning `.mason/sessions/latest`
  - Implement atomic create-temp-then-rename pattern:
    - Generate temp path with `randomBytes(4).toString("hex")`
    - `symlink(sessionId, tempPath)` (relative target)
    - `rename(tempPath, latestPath)` (atomic swap)
  - Ensure parent directory exists via `mkdir`

- [x] 2. Add `resolveLatestSession()` to `packages/shared/src/session/session-store.ts`
  - Call `readlink(.mason/sessions/latest)`
  - Return the symlink target string (session ID) on success
  - Return `null` on any error (ENOENT, permissions, etc.)

- [x] 3. Update `createSession()` to call `updateLatestSymlink()`
  - Call after `writeMetaAtomic()` succeeds
  - Wrapped in try/catch so symlink failure doesn't prevent session creation

- [x] 4. Export new functions from `packages/shared/src/session/index.ts`
  - Added `updateLatestSymlink` and `resolveLatestSession` to the export list

- [x] 5. Fix `listSessions()` to skip `latest` symlink and temp files
  - Added filter: `if (entry === "latest" || entry.startsWith(".latest-tmp-")) continue;`
  - Without this, the symlink was being followed and duplicating sessions in the list

- [x] 6. Add unit tests in `packages/shared/tests/session/session-store.test.ts`
  - (a) `updateLatestSymlink()` creates symlink at `.mason/sessions/latest`
  - (b) Symlink target is relative (just the session ID)
  - (c) `resolveLatestSession()` returns the session ID from the symlink
  - (d) Calling `updateLatestSymlink()` twice overwrites the first symlink
  - (e) `resolveLatestSession()` returns null when symlink doesn't exist
  - (f) `createSession()` automatically updates the symlink
  - (g) Second `createSession()` updates symlink to newer session

- [x] 7. Verify: `npx tsc --noEmit`, linter, unit tests pass
  - TypeScript: clean
  - ESLint: clean
  - Shared tests: 294 passed
  - CLI tests: 667 passed
  - Agent-SDK tests: 261 passed
