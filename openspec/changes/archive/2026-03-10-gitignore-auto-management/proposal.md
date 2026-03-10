# Proposal: .gitignore Auto-Management Utility

**Date:** 2026-03-10
**Change:** #2 from [ACP Session CWD IMPLEMENTATION](../../../prds/acp-session-cwd/IMPLEMENTATION.md)
**PRD Refs:** PRD §4.3 (Per-Project .clawmasons), US-6

## Problem

When `run-agent` or `run-acp-agent` creates a `.clawmasons/` directory in a project for session state (logs, sessions), that directory must not be committed to version control. Multiple commands need the same logic: check if `.gitignore` exists, check if `.clawmasons` is already ignored, and append it if not. Without a shared utility, this logic would be duplicated across `run-agent`, `run-acp-agent`, and `init-role`, leading to inconsistencies and maintenance burden.

## Proposal

Create `packages/cli/src/runtime/gitignore.ts` -- a small, focused utility module that:

1. Checks if a `.gitignore` file contains a given pattern
2. Appends a pattern to an existing `.gitignore`
3. Orchestrates the "ensure `.clawmasons` is gitignored" logic

This module is used by `run-agent` (Change #5), `run-acp-agent` (Change #7), and any other command that creates `.clawmasons/` in a project directory.

## Scope

- New file: `packages/cli/src/runtime/gitignore.ts`
- New test: `packages/cli/tests/runtime/gitignore.test.ts`
