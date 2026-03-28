## Design

### Resume Config (`packages/cli/tests/helpers/mock-agent-packages.ts`)

Add the `resume` field to `mockClaudeCodeAgent`:

```typescript
export const mockClaudeCodeAgent: AgentPackage = {
  name: "claude-code-agent",
  // ... existing fields ...
  resume: {
    flag: "--resume",
    sessionIdField: "agentSessionId",
  },
};
```

This declares that claude-code-agent:
- Uses `--resume` as the CLI flag for session resumption
- Reads `agentSessionId` from `meta.json` to get the value to pass after the flag

### SessionStart Hook in settings.json

Update `mockClaudeCodeMaterializer.materializeWorkspace()` to produce a `.claude/settings.json` that includes both `permissions` and `hooks`:

```typescript
materializeWorkspace: (_agent, proxyEndpoint, proxyToken) => {
  const files = new Map<string, string>();
  // ... existing .claude.json ...

  const settings = {
    permissions: { allow: ["mcp__mason__*"], deny: [] },
    hooks: {
      SessionStart: [{
        hooks: [{
          type: "command",
          command: "node -e \"const f='/home/mason/.mason/session/meta.json';const d=JSON.parse(require('fs').readFileSync(f));d.agentSessionId=process.env.CLAUDE_SESSION_ID;require('fs').writeFileSync(f,JSON.stringify(d,null,2))\""
        }]
      }]
    }
  };
  files.set(".claude/settings.json", JSON.stringify(settings, null, 2));
  // ... existing agent-launch.json ...
  return files;
};
```

**Hook structure rationale**: Claude Code's settings.json `hooks` field uses the structure `{ [hookName]: Array<{ hooks: Array<{ type, command }> }> }`. The `SessionStart` event fires once when Claude Code initializes, before any user interaction. This is the correct time to capture the session ID.

**Hook command breakdown**:
1. Read `/home/mason/.mason/session/meta.json` (the session directory mounted by CHANGE 3)
2. Parse the JSON
3. Set `agentSessionId` to `process.env.CLAUDE_SESSION_ID` (provided by Claude Code runtime)
4. Write the updated JSON back to the same file

The command uses `require('fs')` (Node.js) which is guaranteed available since claude-code-agent installs Node.js in its Docker image.

### Test Coverage

Add tests to the existing test suites:

**`packages/cli/tests/helpers/mock-agent-packages.test.ts`** (new file):

1. **Resume field exists**: Verify `mockClaudeCodeAgent.resume` has `flag: "--resume"` and `sessionIdField: "agentSessionId"`.

2. **Settings.json has SessionStart hook**: Call `mockClaudeCodeMaterializer.materializeWorkspace()`, parse `.claude/settings.json`, verify `hooks.SessionStart` exists with the correct structure.

3. **Hook references meta.json path**: Verify the hook command string contains `/home/mason/.mason/session/meta.json`.

4. **Hook reads CLAUDE_SESSION_ID**: Verify the hook command string contains `process.env.CLAUDE_SESSION_ID`.

5. **Permissions preserved**: Verify the settings.json output contains `permissions.allow` with `["mcp__mason__*"]` alongside the hooks.

**Existing test updates**:

Tests in `packages/cli/tests/materializer/docker-generator.test.ts` and `packages/cli/tests/cli/run-agent.test.ts` that check the content of `.claude/settings.json` will now see the `hooks` field in the output. These tests should continue to pass since they check for `permissions` specifically or check for substrings.

### Files Changed

| File | Change |
|------|--------|
| `packages/cli/tests/helpers/mock-agent-packages.ts` | Add `resume` field to `mockClaudeCodeAgent`; update materializer to include `SessionStart` hook in settings.json |
| `packages/cli/tests/helpers/mock-agent-packages.test.ts` | New test file: 5 tests covering resume field, hook presence, meta.json path, env var, permissions preservation |

### Interactions with Future Changes

- **CHANGE 6 (`mason run --resume` CLI Flag)** will use `mockClaudeCodeAgent.resume.sessionIdField` to look up `agentSessionId` from `meta.json` and pass it as `resumeId` to `generateAgentLaunchJson()`.
- **CHANGE 7 (ACP Automatic Resume)** relies on the hook having written `agentSessionId` to `meta.json` during the first prompt's session. Without this hook, ACP would never find an `agentSessionId` to trigger resume.
- The real `@clawmasons/claude-code-agent` package in `mason-extensions` will need the same `resume` field and `SessionStart` hook in its actual materializer implementation.
