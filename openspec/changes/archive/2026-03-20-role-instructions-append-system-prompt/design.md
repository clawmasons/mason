# Design: Role Instructions into System Prompt

## Overview

Four targeted edits across three packages. No new files, no new dependencies, no interface changes beyond the field rename.

## Change 1 — `packages/agent-sdk/src/types.ts`

Rename `supportsInitialPrompt` → `supportsAppendSystemPrompt` on `RuntimeConfig`. Update the doc comment to reflect the actual mechanism.

```ts
/** When true, the runtime accepts role instructions via --append-system-prompt <text>. */
supportsAppendSystemPrompt?: boolean;
```

## Change 2 — `packages/agent-sdk/src/helpers.ts`

In `generateAgentLaunchJson`, replace the positional append with a two-element flag pair:

**Before** (line 150–152):
```ts
if (instructions && !acpMode && agentPkg.runtime?.supportsInitialPrompt) {
  args = [...(args ?? []), instructions];
}
```

**After**:
```ts
if (instructions && !acpMode && agentPkg.runtime?.supportsAppendSystemPrompt) {
  args = [...(args ?? []), "--append-system-prompt", instructions];
}
```

`agentArgs` continue to be appended after this block — no change needed there.

## Change 3 — `packages/claude-code-agent/src/index.ts`

Rename the field on the `runtime` object:

```ts
runtime: {
  command: "claude",
  args: ["--effort", "max"],
  credentials: [{ key: "CLAUDE_CODE_OAUTH_TOKEN", type: "env" }],
  supportsAppendSystemPrompt: true,  // was supportsInitialPrompt
},
```

## Change 4 — `packages/pi-coding-agent/src/materializer.ts`

In `materializeWorkspace`, add one conditional block after the existing file entries:

```ts
const instructions = agent.roles[0]?.instructions;
if (instructions) {
  result.set(".pi/APPEND_SYSTEM.md", instructions);
}
```

Place it before the `agent-launch.json` entry (after the skills loop). The `generateAgentLaunchJson` call for pi already passes `undefined` as the instructions arg — no change needed there.

## Test Updates

### `packages/agent-sdk/tests/helpers.test.ts`

- Replace all `supportsInitialPrompt` with `supportsAppendSystemPrompt` in existing tests.
- Update the "appends instructions to args" test to assert `["--flag", "--append-system-prompt", "Do the thing"]` instead of `["--flag", "Do the thing"]`.
- Update the "appends agentArgs after instructions" test similarly.

### `packages/pi-coding-agent/tests/materializer.test.ts`

Add two new tests:
1. When `agent.roles[0].instructions` is set → result contains `.pi/APPEND_SYSTEM.md` with that value.
2. When `agent.roles[0].instructions` is absent/undefined → result does not contain `.pi/APPEND_SYSTEM.md`.

## Ordering

1. Edit `types.ts` first (defines the renamed field).
2. Edit `helpers.ts` (consumes renamed field).
3. Edit `claude-code-agent/src/index.ts` (uses renamed field).
4. Edit `pi-coding-agent/src/materializer.ts` (independent — adds new behavior).
5. Update tests for both packages.
