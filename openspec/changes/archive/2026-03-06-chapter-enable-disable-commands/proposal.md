# Proposal: `chapter enable` / `chapter disable` Commands

## Problem

After installing members via `chapter install`, there is no way to temporarily disable a member without uninstalling it. Users need a lightweight mechanism to toggle member availability without losing the installed directory structure, configuration, and credentials.

## Solution

Add two new CLI commands -- `chapter enable @<member>` and `chapter disable @<member>` -- that toggle the `status` field in `.chapter/members.json`. Update `chapter run` to refuse starting disabled members.

## PRD References

- **REQ-007:** `chapter enable` / `chapter disable` Commands
- **PRD Section 6.2:** `chapter enable` / `chapter disable` specification

## Acceptance Criteria (from PRD)

1. Given a member is installed and enabled, when `chapter disable @note-taker` is run, then `members.json` status is `"disabled"`.
2. Given a member is disabled, when `chapter enable @note-taker` is run, then `members.json` status is `"enabled"`.
3. Given a member is not installed, when `chapter enable @note-taker` is run, then an error is displayed.
4. Given a member is disabled, when `chapter run @note-taker` is run, then an error is displayed (disabled members cannot be started).

## Scope

- New file: `src/cli/commands/enable.ts` -- enable command implementation
- New file: `src/cli/commands/disable.ts` -- disable command implementation
- Modify: `src/cli/commands/index.ts` -- register new commands
- Modify: `src/cli/commands/run.ts` -- check member status before starting
- New test: `tests/cli/enable.test.ts` -- unit tests for enable command
- New test: `tests/cli/disable.test.ts` -- unit tests for disable command
- Modify: `tests/cli/run.test.ts` -- test disabled member rejection

## Out of Scope

- Additional status values beyond enabled/disabled (e.g., `suspended`, `pending-approval`)
- Bulk enable/disable of multiple members
- `chapter list` changes (already shows status from Change #7)
