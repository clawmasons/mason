# Design: `run-acp-agent` Help Instructions

**Date:** 2026-03-10
**PRD:** acp-session-cwd
**Change:** #9

## Overview

Add comprehensive help text to the `run-acp-agent` command using Commander's `addHelpText("after", ...)` to display an epilog with CWD behavior, side effects, environment configuration, and ACP client examples.

## Implementation Details

### File: `packages/cli/src/cli/commands/run-acp-agent.ts`

In `registerRunAcpAgentCommand`, after the `.action()` call, add `.addHelpText("after", helpEpilog)` where `helpEpilog` is a multi-line string constant.

#### Help Epilog Content

```
Session Behavior:
  When an ACP client sends session/new with a "cwd" field, the agent
  container mounts that directory as /workspace. Each session/new starts
  a fresh agent container; the proxy and credential-service stay running.

  If no "cwd" is provided in session/new, the current working directory
  of this process is used as the default.

Side Effects:
  - Creates .clawmasons/ in the session's CWD for session logs
  - Appends ".clawmasons" to the project's .gitignore if present

Environment:
  CLAWMASONS_HOME    Base directory for chapter runtime state.
                     Default: ~/.clawmasons

ACP Client Configuration Example (Zed / JetBrains):
  {
    "mcpServers": {
      "chapter": {
        "command": "chapter",
        "args": ["run-acp-agent", "--role", "<role-name>"],
        "env": {
          "CLAWMASONS_HOME": "~/.clawmasons"
        }
      }
    }
  }
```

### Testing Approach

Add a new describe block in `run-acp-agent.test.ts` that imports `registerRunAcpAgentCommand`, creates a Commander program, registers the command, and inspects the help output. Use Commander's `helpInformation()` or `outputHelp()` to capture the text and assert on key substrings:

1. Contains "session/new" and "cwd" explanation
2. Contains ".clawmasons/" creation notice
3. Contains ".gitignore" notice
4. Contains "CLAWMASONS_HOME" documentation
5. Contains ACP client configuration example JSON

## Files Changed

- `packages/cli/src/cli/commands/run-acp-agent.ts` — add help epilog
- `packages/cli/tests/cli/run-acp-agent.test.ts` — add help text tests
