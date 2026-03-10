# Proposal: CLAWMASONS_HOME Utility & chapters.json

**Date:** 2026-03-10
**Change:** #1 from [ACP Session CWD IMPLEMENTATION](../../../prds/acp-session-cwd/IMPLEMENTATION.md)
**PRD Refs:** REQ-002 (CLAWMASONS_HOME Environment Variable), PRD 4.1 (CLAWMASONS_HOME), PRD 4.2 (chapters.json)

## Problem

All subsequent changes in the ACP Session CWD PRD need a shared way to resolve the `CLAWMASONS_HOME` directory and read/write the `chapters.json` registry. Without a centralized utility, each command (`init-role`, `run-agent`, `run-acp-agent`) would duplicate path resolution and JSON manipulation logic, leading to inconsistencies and maintenance burden.

## Proposal

Create `packages/cli/src/runtime/home.ts` -- a utility module that:

1. Resolves `CLAWMASONS_HOME` from the environment variable or defaults to `~/.clawmasons`
2. Reads/writes/updates `chapters.json` with type-safe entries for initialized chapter/role combinations
3. Resolves role directories from `chapters.json` (handling `targetDir` overrides)
4. Ensures the `CLAWMASONS_HOME` directory exists with a `.gitignore` ignoring log subdirectories

This is the foundational module used by all subsequent changes (init-role, run-agent, run-acp-agent).

## Scope

- New file: `packages/cli/src/runtime/home.ts`
- New test: `packages/cli/tests/runtime/home.test.ts`
