## Tasks

- [x] Add `resume` field to `AgentPackage` interface in `packages/agent-sdk/src/types.ts`
- [x] Add `resumeId` parameter to `generateAgentLaunchJson()` in `packages/agent-sdk/src/helpers.ts`
- [x] Add resume arg injection logic to `generateAgentLaunchJson()`
- [x] Add test: resumeId with resume config appends [flag, resumeId] to args
- [x] Add test: resumeId without resume config is silently ignored
- [x] Add test: no resumeId produces same output as before (backward compat)
- [x] Add test: resume args placed after other args (agentArgs, initialPrompt)
- [x] Verify TypeScript compilation (`npx tsc --noEmit`)
- [x] Verify linting (`npx eslint src/ tests/` from agent-sdk package)
- [x] Verify all agent-sdk tests pass (265 tests, 8 files)
