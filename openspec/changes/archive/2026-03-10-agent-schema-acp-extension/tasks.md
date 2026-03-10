## Tasks

- [x] Add `acp` field to `agentChapterFieldSchema` in `packages/shared/src/schemas/agent.ts`
- [x] Add `acp` to `ResolvedAgent` interface in `packages/shared/src/types.ts`
- [x] Pass through `acp` field in resolver at `packages/cli/src/resolver/resolve.ts`
- [x] Add `MaterializeOptions` and update `RuntimeMaterializer` interface in `packages/cli/src/materializer/types.ts`
- [x] Add `ACP_RUNTIME_COMMANDS` constant to `packages/cli/src/materializer/common.ts`
- [x] Extend Claude Code materializer with ACP mode in `packages/cli/src/materializer/claude-code.ts`
- [x] Extend pi-coding-agent materializer with ACP mode in `packages/cli/src/materializer/pi-coding-agent.ts`
- [x] Create mcp-agent materializer at `packages/cli/src/materializer/mcp-agent.ts`
- [x] Export mcp-agent materializer from `packages/cli/src/materializer/index.ts`
- [x] Add ACP mode tests to `packages/cli/tests/materializer/claude-code.test.ts`
- [x] Add ACP mode tests to `packages/cli/tests/materializer/pi-coding-agent.test.ts`
- [x] Create `packages/cli/tests/materializer/mcp-agent.test.ts`
- [x] Verify TypeScript compilation passes
- [x] Verify all tests pass
