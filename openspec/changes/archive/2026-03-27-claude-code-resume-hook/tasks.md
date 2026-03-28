## Tasks

### 1. Add `resume` field to `mockClaudeCodeAgent`
- [ ] Add `resume: { flag: "--resume", sessionIdField: "agentSessionId" }` to `mockClaudeCodeAgent` in `packages/cli/tests/helpers/mock-agent-packages.ts`

### 2. Update materializer to include SessionStart hook in settings.json
- [ ] Update `mockClaudeCodeMaterializer.materializeWorkspace()` to produce `.claude/settings.json` with both `permissions` and `hooks.SessionStart`
- [ ] Verify the hook command reads `/home/mason/.mason/session/meta.json`
- [ ] Verify the hook command sets `agentSessionId` from `process.env.CLAUDE_SESSION_ID`

### 3. Add unit tests
- [ ] Create `packages/cli/tests/helpers/mock-agent-packages.test.ts`
- [ ] Test: `mockClaudeCodeAgent.resume` has correct `flag` and `sessionIdField`
- [ ] Test: materializer output `.claude/settings.json` contains `SessionStart` hook
- [ ] Test: hook command references `/home/mason/.mason/session/meta.json`
- [ ] Test: hook command reads `CLAUDE_SESSION_ID` env var
- [ ] Test: permissions preserved alongside hooks in settings.json

### 4. Verify existing tests still pass
- [ ] Run `npx vitest run packages/cli/tests/` -- ensure no regressions
- [ ] Run `npx tsc --noEmit` -- ensure TypeScript compiles
- [ ] Run `npx eslint src/ tests/` -- ensure linting passes
