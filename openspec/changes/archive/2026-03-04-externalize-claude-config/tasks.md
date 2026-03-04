## 1. Simplify Dockerfile Generation

- [ ] 1.1 Remove `.claude.json` heredoc creation from `generateDockerfile()` in `src/materializer/claude-code.ts`
- [ ] 1.2 Remove `.claude/` directory creation and `chown` from `generateDockerfile()`
- [ ] 1.3 Remove entrypoint script creation from `generateDockerfile()`
- [ ] 1.4 Remove `ENTRYPOINT` directive — use CMD directly
- [ ] 1.5 Add `generateClaudeJson()` method to the materializer

## 2. Update Compose Service

- [ ] 2.1 Add `.claude:/home/node/.claude` volume mount in `generateComposeService()`
- [ ] 2.2 Add `.claude.json:/home/node/.claude.json` volume mount in `generateComposeService()`
- [ ] 2.3 Remove `CLAUDE_AUTH_TOKEN` from compose service environment

## 3. Update Env Template

- [ ] 3.1 Remove `claude-code` from `RUNTIME_API_KEYS` in `src/compose/env.ts`

## 4. Update Install Command

- [ ] 4.1 Call `generateClaudeJson()` and write result to `{runtime}/.claude.json` in `src/cli/commands/install.ts`
- [ ] 4.2 Create empty `{runtime}/.claude/` directory in the install output
- [ ] 4.3 Update next-steps messaging to mention `claude /login` instead of CLAUDE_AUTH_TOKEN

## 5. Update Tests

- [ ] 5.1 Update Dockerfile tests: remove entrypoint/credentials assertions, add assertions for simplified Dockerfile
- [ ] 5.2 Update compose service tests: add volume mount assertions, remove CLAUDE_AUTH_TOKEN assertions
- [ ] 5.3 Add tests for `generateClaudeJson()` method
- [ ] 5.4 Update env template tests: claude-code should not produce CLAUDE_AUTH_TOKEN
- [ ] 5.5 Run all tests and fix any regressions
