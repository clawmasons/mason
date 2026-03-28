## Why

The claude-code-agent package needs two additions to enable session resume:

1. **Resume config declaration**: The `AgentPackage` export must include a `resume` field so the CLI knows how to inject `--resume <sessionId>` when resuming a claude-code session. Without this, the CLI has no way to discover that claude-code uses `--resume` as its resume flag or that `agentSessionId` is the relevant `meta.json` field.

2. **Session ID capture via hook**: Claude Code exposes its internal session ID via the `CLAUDE_SESSION_ID` environment variable, but this value is only available inside the container at runtime. There must be a mechanism to write this value back to `meta.json` (mounted at `/home/mason/.mason/session/meta.json`) so the host CLI can read it later for `--resume`. The standard mechanism is a Claude Code `SessionStart` hook that runs a Node.js one-liner to read `meta.json`, set `agentSessionId`, and write it back.

The materializer is the right place to inject this hook because it already generates `.claude/settings.json` with permissions. The hook must be merged alongside existing permissions so nothing is lost.

## What Changes

- Add `resume: { flag: "--resume", sessionIdField: "agentSessionId" }` to the `mockClaudeCodeAgent` in `packages/cli/tests/helpers/mock-agent-packages.ts` (the real agent is in `mason-extensions`; the mock is the in-repo representation)
- Update `mockClaudeCodeMaterializer.materializeWorkspace()` to merge a `SessionStart` hook into the `.claude/settings.json` output, alongside existing permissions
- The hook command: `node -e "const f='/home/mason/.mason/session/meta.json';const d=JSON.parse(require('fs').readFileSync(f));d.agentSessionId=process.env.CLAUDE_SESSION_ID;require('fs').writeFileSync(f,JSON.stringify(d,null,2))"`

## Capabilities

### New Capabilities

- claude-code-agent declares resume support via `resume` field on its `AgentPackage`
- Materializer generates `.claude/settings.json` with `SessionStart` hook that captures `CLAUDE_SESSION_ID` into `meta.json`

### Modified Capabilities

- `mockClaudeCodeMaterializer.materializeWorkspace()` now produces `.claude/settings.json` with both `permissions` and `hooks` sections

## Impact

- **Code**: `packages/cli/tests/helpers/mock-agent-packages.ts` (mock updates)
- **Dependencies**: None new -- uses existing `AgentPackage.resume` type from CHANGE 4
- **Testing**: Unit tests verifying (a) `resume` field on AgentPackage, (b) settings.json contains `SessionStart` hook, (c) hook references correct meta.json path, (d) hook reads `CLAUDE_SESSION_ID`, (e) permissions preserved alongside hooks
- **Compatibility**: Fully backward compatible -- adds optional fields, merges into existing settings
