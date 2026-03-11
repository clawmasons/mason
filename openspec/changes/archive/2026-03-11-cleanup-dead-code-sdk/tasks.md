# Tasks: Cleanup — Remove dead code and update materializer

## 1. Remove `acpPort` from session types
- [x] 1.1 Remove `acpPort?: number` field and JSDoc from `AcpSessionConfig` in `session.ts`

## 2. Update `generateAcpConfigJson` in common.ts
- [x] 2.1 Remove `acpPort` parameter from function signature
- [x] 2.2 Update JSON output to only contain `{ command }`
- [x] 2.3 Update JSDoc to remove port references

## 3. Update materializers
- [x] 3.1 `mcp-agent.ts`: Remove `acpPort` variable, update `generateAcpConfigJson` call
- [x] 3.2 `claude-code.ts`: Remove `acpPort` variable, update `generateAcpConfigJson` call
- [x] 3.3 `pi-coding-agent.ts`: Remove `acpPort` variable, update `generateAcpConfigJson` call

## 4. Remove `acp` from agent schema and types
- [x] 4.1 Remove `acp?: { port: number }` from `ResolvedAgent` in `shared/types.ts`
- [x] 4.2 Remove `acpSchema` and its usage from `shared/schemas/agent.ts`
- [x] 4.3 Remove `acp: chapter.acp` from `resolver/resolve.ts`
- [x] 4.4 Remove `"acp": { "port": 3002 }` from template package.json files

## 5. Update tests
- [x] 5.1 `mcp-agent.test.ts`: Update ACP assertions (no port), remove port-specific test
- [x] 5.2 `claude-code.test.ts`: Update ACP assertions (no port), remove port-specific test
- [x] 5.3 `pi-coding-agent.test.ts`: Update ACP assertions (no port), remove port-specific test
- [x] 5.4 `run-acp-agent.test.ts`: Remove "does not pass acpPort to session config" test
- [x] 5.5 `session.test.ts`: Fix pre-existing TS error (read-only `pid` assignment)

## 6. Delete old specs and update remaining
- [x] 6.1 Delete `openspec/specs/acp-bridge/spec.md` (old HTTP bridge spec)
- [x] 6.2 Update `openspec/specs/acp-session/spec.md` (remove acpPort requirements, update to reflect no port exposure)

## 7. Fix scripts
- [x] 7.1 Remove `--transport stdio` from `scripts/launch-acp.sh`

## 8. Verification
- [x] 8.1 `npx tsc --noEmit` passes (0 new errors; pre-existing session.test.ts error fixed)
- [x] 8.2 `npx eslint` — no new lint errors (all existing are pre-existing)
- [x] 8.3 `npx vitest run` — all 1115 tests pass across 60 test files
- [x] 8.4 No remaining source references to dead code patterns (`StdioBridge`, `AcpBridge`, `acp-server`, `containerPort`, `containerHost`, `acpPort`, `extractCwdFromBody`, `parseRequestBody`)
