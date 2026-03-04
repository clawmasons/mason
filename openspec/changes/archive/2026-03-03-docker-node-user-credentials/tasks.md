## 1. Update Dockerfile Generation

- [ ] 1.1 Modify `generateDockerfile()` in `src/materializer/claude-code.ts` to run as `node` user with entrypoint script for credential injection
- [ ] 1.2 Update `generateComposeService()` to use `/home/node/workspace` paths and `CLAUDE_AUTH_TOKEN` env var

## 2. Update Env Template

- [ ] 2.1 Change `RUNTIME_API_KEYS["claude-code"]` from `"ANTHROPIC_API_KEY"` to `"CLAUDE_AUTH_TOKEN"` in `src/compose/env.ts`
- [ ] 2.2 Update section header from `"# Runtime API Keys"` to `"# Runtime Auth"`

## 3. Update Tests

- [ ] 3.1 Update Dockerfile tests in `tests/materializer/claude-code.test.ts` for node user, new paths, entrypoint
- [ ] 3.2 Update compose service tests for new workspace path, CLAUDE_AUTH_TOKEN, no ANTHROPIC_API_KEY
- [ ] 3.3 Update env template tests if any reference ANTHROPIC_API_KEY
