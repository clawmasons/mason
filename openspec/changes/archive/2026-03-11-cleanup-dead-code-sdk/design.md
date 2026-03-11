# Design: Cleanup — Remove dead code and update materializer

## Overview

This is a pure deletion/simplification change. No new behavior is introduced. The goal is to remove all dead HTTP relay vestiges from the codebase after the ACP SDK migration (Changes 1-5).

## Changes

### 1. `AcpSessionConfig.acpPort` removal (session.ts)

Remove the `acpPort?: number` field and its deprecation JSDoc from `AcpSessionConfig`. No callers pass this field (verified in Change 4).

### 2. `generateAcpConfigJson` simplification (common.ts)

Before:
```ts
export function generateAcpConfigJson(acpPort: number, acpCommand: string): string {
  return JSON.stringify({ port: acpPort, command: acpCommand }, null, 2);
}
```

After:
```ts
export function generateAcpConfigJson(acpCommand: string): string {
  return JSON.stringify({ command: acpCommand }, null, 2);
}
```

The JSDoc is also updated to remove port references.

### 3. Materializer updates (mcp-agent.ts, claude-code.ts, pi-coding-agent.ts)

Each materializer has the same pattern:
```ts
const acpPort = agent.acp?.port ?? 3002;
const acpCommand = ...;
result.set(".chapter/acp.json", generateAcpConfigJson(acpPort, acpCommand));
```

Simplified to:
```ts
const acpCommand = ...;
result.set(".chapter/acp.json", generateAcpConfigJson(acpCommand));
```

### 4. `ResolvedAgent.acp` type removal (shared/types.ts)

Remove the `acp?: { port: number }` field from the `ResolvedAgent` interface. No code reads this field after the materializer cleanup.

### 5. Test updates

For each materializer test (mcp-agent.test.ts, claude-code.test.ts, pi-coding-agent.test.ts):
- Update "generates .chapter/acp.json" assertions: expect only `{ command }`, not `{ port, command }`
- Remove "uses agent acp.port when specified" test entirely
- Remove any remaining port-related assertions

### 6. Spec cleanup

- Delete `openspec/specs/acp-bridge/spec.md` (describes old HTTP bridge)
- Review `openspec/specs/acp-session/spec.md` for `acpPort` references and update

## Files Modified

| File | Change |
|------|--------|
| `packages/cli/src/acp/session.ts` | Remove `acpPort` from `AcpSessionConfig` |
| `packages/cli/src/materializer/common.ts` | Remove `acpPort` param from `generateAcpConfigJson` |
| `packages/cli/src/materializer/mcp-agent.ts` | Remove `acpPort` computation |
| `packages/cli/src/materializer/claude-code.ts` | Remove `acpPort` computation |
| `packages/cli/src/materializer/pi-coding-agent.ts` | Remove `acpPort` computation |
| `packages/shared/src/types.ts` | Remove `acp` field from `ResolvedAgent` |
| `packages/cli/tests/materializer/mcp-agent.test.ts` | Update ACP assertions |
| `packages/cli/tests/materializer/claude-code.test.ts` | Update ACP assertions |
| `packages/cli/tests/materializer/pi-coding-agent.test.ts` | Update ACP assertions |
| `openspec/specs/acp-bridge/spec.md` | Delete |
| `openspec/specs/acp-session/spec.md` | Update (remove acpPort refs) |
