# Proposal: `run-acp-agent` Help Instructions

**Date:** 2026-03-10
**PRD:** acp-session-cwd
**Change:** #9

## Problem

The `run-acp-agent` command currently has a minimal description ("Start an ACP-compliant agent endpoint for editor integration") but doesn't explain the key behaviors that affect the user's project: CWD-aware session mounting, `.clawmasons/` directory creation, `.gitignore` management, `CLAWMASONS_HOME` configuration, or how to configure ACP clients. Users need this information in `--help` output so they can understand the command's side effects and configure their editors.

## Proposed Solution

1. Update the command description to be more comprehensive
2. Add an `addHelpText("after", ...)` epilog to the commander command that includes:
   - CWD behavior: explains that `session/new` with a `cwd` field mounts that directory as `/workspace`
   - `.clawmasons/` creation: notes that a `.clawmasons/` directory is created in the session's CWD for logs
   - `.gitignore` management: explains that `.clawmasons` is appended to the project's `.gitignore` if present
   - `CLAWMASONS_HOME` configuration: documents the environment variable and its default
   - ACP client configuration example: JSON snippet for editor integration (Zed/JetBrains)
3. Add tests verifying that the help text contains each required section

## PRD References

- REQ-010: Help Instructions in `run-acp-agent`
