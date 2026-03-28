## Design

### Type Changes (`packages/agent-sdk/src/types.ts`)

Add a `resume` field to the `AgentPackage` interface after the existing `jsonMode` field:

```typescript
export interface AgentPackage {
  // ... existing fields ...

  /** Session resume configuration. When present, the CLI can inject resume arguments into agent-launch.json. */
  resume?: {
    /** CLI argument flag for resuming (e.g., "--resume"). */
    flag: string;
    /** meta.json field containing the agent's session ID (e.g., "agentSessionId"). */
    sessionIdField: string;
  };
}
```

This is a purely additive change. The field is optional, so all existing `AgentPackage` implementations remain valid without modification.

### Function Changes (`packages/agent-sdk/src/helpers.ts`)

Update `generateAgentLaunchJson()` to accept an optional `resumeId` parameter as the 9th positional argument:

```typescript
export function generateAgentLaunchJson(
  agentPkg: AgentPackage,
  roleCredentials: string[],
  acpMode?: boolean,
  instructions?: string,
  agentArgs?: string[],
  initialPrompt?: string,
  printMode?: boolean,
  jsonMode?: boolean,
  resumeId?: string,        // NEW
): string;
```

**Resume arg injection logic:**

After the existing `initialPrompt` handling block and before the final `config` object construction, add:

```typescript
if (resumeId && agentPkg.resume) {
  args = [...(args ?? []), agentPkg.resume.flag, resumeId];
}
```

**Placement rationale:** Resume args are appended last, after all other args (runtime args, instructions, agent args, prompt). This ensures the resume flag is always at the end of the args array, which is the conventional placement for flags that modify the execution mode.

**Guard conditions:**
- Both `resumeId` and `agentPkg.resume` must be truthy. If the agent has no resume config, the resumeId is silently ignored.
- This works correctly in ACP mode too -- if ACP mode sets a different command, resume args are still appended to whatever args exist.

### Test Coverage (`packages/agent-sdk/tests/helpers.test.ts`)

Add the following test cases to the existing `generateAgentLaunchJson` describe block:

1. **Resume with config**: Agent has `resume: { flag: "--resume", sessionIdField: "agentSessionId" }` and `resumeId` is `"session-123"` -- args should include `["--resume", "session-123"]` at the end.

2. **Resume without config**: Agent has no `resume` field, `resumeId` is `"session-123"` -- output should be identical to calling without `resumeId` (no crash, no extra args).

3. **No resumeId (backward compat)**: Agent has `resume` config but `resumeId` is `undefined` -- output matches pre-change behavior exactly.

4. **Resume with other args**: Agent has `resume` config, `resumeId` provided, plus `agentArgs` and `initialPrompt` -- resume args appear after all other args.

5. **TypeScript compilation**: Implicitly verified by creating an `AgentPackage` with the `resume` field in the test fixture and having `tsc --noEmit` pass.

### Files Changed

| File | Change |
|------|--------|
| `packages/agent-sdk/src/types.ts` | Add optional `resume` field to `AgentPackage` interface |
| `packages/agent-sdk/src/helpers.ts` | Add `resumeId` parameter to `generateAgentLaunchJson()`, add resume arg injection logic |
| `packages/agent-sdk/tests/helpers.test.ts` | Add 4-5 test cases for resume behavior |

### Interactions with Future Changes

- **CHANGE 5 (Claude Code Agent Resume Support)** will add `resume: { flag: "--resume", sessionIdField: "agentSessionId" }` to the claude-code-agent's `AgentPackage` export. This change provides the type and mechanism; CHANGE 5 provides the first concrete usage.
- **CHANGE 6 (`mason run --resume` CLI Flag)** will call `generateAgentLaunchJson()` with the `resumeId` parameter when resuming a session. The CLI reads `agentSessionId` from `meta.json` using the `sessionIdField` from the agent's `resume` config.
- **CHANGE 7 (ACP Automatic Resume)** uses the same `generateAgentLaunchJson()` path indirectly via the CLI's resume flow.
