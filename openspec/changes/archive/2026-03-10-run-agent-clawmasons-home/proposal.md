# Proposal: `run-agent` CLAWMASONS_HOME & Auto-Init

## Problem

`run-agent` currently requires a pre-existing `.clawmasons/chapter.json` in the project directory (created by the now-removed `run-init` command). This means:

1. Users must manually run `init-role` before `run-agent` works
2. The `docker-build` path is read from a project-local config instead of the host-wide `chapters.json`
3. No per-project `.clawmasons/` session state is created automatically
4. `.gitignore` is not updated to exclude `.clawmasons`

## Solution

Update `run-agent` to:

1. **Read role from `chapters.json`** — On invocation, look up the matching role entry in `CLAWMASONS_HOME/chapters.json` using the `home.ts` utility from Change #1.
2. **Auto-invoke `init-role`** — If the role is not found in `chapters.json`, automatically run the `initRole()` logic from Change #4 before proceeding.
3. **Use `roleDir` from `chapters.json`** — Respect `targetDir` overrides for the docker-build path.
4. **Create per-project `.clawmasons/`** — Create session-specific state (sessions, logs) in the current project directory.
5. **Manage `.gitignore`** — Use the `ensureGitignoreEntry()` utility from Change #2 to add `.clawmasons` to the project's `.gitignore`.

## Scope

- Modify `packages/cli/src/cli/commands/run-agent.ts`
- Update `packages/cli/tests/cli/run-agent.test.ts`
- No new files needed — leverages existing `home.ts`, `gitignore.ts`, and `init-role.ts` modules

## Non-Goals

- Changing the compose generation or Docker execution flow (unchanged)
- Modifying `run-acp-agent` (that's Change #6)
- ACP session CWD support (that's Change #7)
