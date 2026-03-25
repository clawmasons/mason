## Why

The `acp-refactor` PRD requires session persistence for ACP session lifecycle (REQ-005, REQ-008, REQ-010). Rather than coupling session storage to ACP, a shared session storage module in `packages/shared` provides a reusable foundation that any session-aware feature can import — including future `mason run --resume`, session cleanup commands, and the ACP handlers themselves.

Currently there is no session persistence layer anywhere in the codebase. Each feature that needs session tracking would have to implement its own file I/O, directory conventions, and metadata format. A single shared module prevents that duplication.

## What Changes

- New file: `packages/shared/src/session/session-store.ts` — typed CRUD operations for session metadata stored as `{cwd}/.mason/sessions/{sessionId}/meta.json`
- New file: `packages/shared/src/session/index.ts` — barrel export
- New test: `packages/shared/tests/session/session-store.test.ts` — unit tests using temp directories
- Modified: `packages/shared/src/index.ts` — add session module exports

## Capabilities

### New Capabilities
- `session-storage`: Create, read, update, list, and close sessions stored as `meta.json` files under `{cwd}/.mason/sessions/{sessionId}/`

## Impact

- **New files:** 3 (session-store.ts, index.ts barrel, test file)
- **Modified files:** 1 (`packages/shared/src/index.ts` — add exports)
- **No new dependencies** — uses `node:crypto` for UUID v7, `node:fs/promises` for I/O
- **No behavioral changes** to any existing functionality
- **Consumers:** ACP handlers (CHANGE 3+), future `mason run --resume`
