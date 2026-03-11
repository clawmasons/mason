# Proposal: Cleanup — Remove dead code and update materializer

After the ACP SDK migration (Changes 1-5), several vestiges of the old HTTP relay architecture remain in the codebase. These are dead code paths that reference removed concepts (port exposure, HTTP bridge, container ports) and create confusion for maintainers.

## Changes Required

### 1. Remove `acpPort` from `AcpSessionConfig` (session.ts)
The deprecated `acpPort?: number` field in `AcpSessionConfig` is no longer used by any caller (Change 4 removed the orchestrator's usage). Remove the field and its JSDoc.

### 2. Remove `port` from `generateAcpConfigJson()` (materializer/common.ts)
The `generateAcpConfigJson(acpPort, acpCommand)` function generates `{ port, command }`. The `port` field is dead — the container agent uses stdin/stdout, not an HTTP port. Remove the `acpPort` parameter; generate only `{ command }`.

### 3. Update materializers to stop computing/passing `acpPort`
Three materializers (`mcp-agent.ts`, `claude-code.ts`, `pi-coding-agent.ts`) compute `const acpPort = agent.acp?.port ?? 3002` and pass it to `generateAcpConfigJson`. Remove the `acpPort` variable and update the call.

### 4. Update materializer tests
Tests assert `acpConfig.port === 3002` and test `agent.acp.port` override. Update to assert no `port` field and remove port-specific tests.

### 5. Remove `acp.port` from `ResolvedAgent` type (shared/types.ts)
The `acp?: { port: number }` field on `ResolvedAgent` is unused now. Remove it.

### 6. Delete old `acp-bridge` spec (openspec/specs/acp-bridge/spec.md)
This spec describes the old HTTP bridge (`AcpBridge.start()`, `connectToAgent()`, HTTP relay). It was superseded by the SDK bridge in Change 3. Delete it.

### 7. Verify no other dead references
Confirm no remaining source references to: `StdioBridge`, `AcpBridge` (old), `acp-server.ts`, `containerPort`, `containerHost`, `--service-ports` (in ACP context), `--transport` (in ACP context), `extractCwdFromBody`, `parseRequestBody`.

## Affected Specs
- `acp-bridge`: Spec deleted (superseded by SDK bridge)
- `acp-session`: The `acpPort` field mentioned in spec scenarios should be verified

## Impact Assessment
- `packages/cli/src/acp/session.ts` — remove deprecated field
- `packages/cli/src/materializer/common.ts` — simplify function signature
- `packages/cli/src/materializer/mcp-agent.ts` — remove acpPort computation
- `packages/cli/src/materializer/claude-code.ts` — remove acpPort computation
- `packages/cli/src/materializer/pi-coding-agent.ts` — remove acpPort computation
- `packages/shared/src/types.ts` — remove `acp` field from ResolvedAgent
- `packages/cli/tests/materializer/*.test.ts` — update ACP mode assertions
- `openspec/specs/acp-bridge/spec.md` — delete
- `openspec/specs/acp-session/spec.md` — update if needed
