# Proposal: Rename `acp-proxy` to `run-acp-agent`

**Date:** 2026-03-10
**PRD:** acp-session-cwd
**Change:** #6

## Problem

The `acp-proxy` command name doesn't describe what it actually does (run an ACP agent endpoint). The CLI naming is confusing for operators. Additionally, the command lacks `CLAWMASONS_HOME` support and auto-init behavior that `run-agent` already has (from CHANGE 5).

## Proposed Solution

1. Rename `packages/cli/src/cli/commands/acp-proxy.ts` to `run-acp-agent.ts`
2. Rename all exported types/functions from `AcpProxy*` to `RunAcpAgent*` and `acpProxy` to `runAcpAgent`
3. Update the command registration to use `run-acp-agent` as the command name
4. Add `CLAWMASONS_HOME` + auto-init logic (same pattern as `run-agent` from CHANGE 5)
5. Update all log messages from `[chapter acp-proxy]` to `[chapter run-acp-agent]`
6. Update `warnings.ts` log prefix from `[chapter acp-proxy]` to `[chapter run-acp-agent]`
7. Register the new command in `commands/index.ts`
8. Rename test file and update all imports/references
9. Update e2e test references

Note: The old `acp-proxy` command registration was already removed in CHANGE 3. This change creates the replacement `run-acp-agent` command.

## PRD References

- REQ-004: Rename `acp-proxy` to `run-acp-agent`
- US-5: Auto-init when role not initialized
