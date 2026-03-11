## 1. Consolidate CLI Command

- [x] 1.1 Refactor `run-agent.ts`: add `-acp` flag, `--role`, `--proxy-port`, `--chapter`, `--init-agent` options to the `agent` command
- [x] 1.2 Make `<agent>` and `<role>` arguments optional when `--acp` is set (auto-detect agent, allow `--role` as alternative)
- [x] 1.3 Extract shared startup routine covering: Docker check, role resolution, Dockerfile validation, gitignore, session/token generation, compose generation, proxy startup, in-process credential service startup
- [x] 1.4 Implement interactive mode path: start agent container with inherited stdio, teardown on exit
- [x] 1.5 Implement ACP mode path: create AcpSdkBridge, start on stdin/stdout, defer agent to session/new, await bridge.closed
- [x] 1.6 Merge `RunAgentDeps` and `RunAcpAgentDeps` into unified deps interface
- [x] 1.7 Port stdout protection, file logger, shutdown handler, and signal handling from `run-acp-agent.ts`

## 2. Remove Credential Service Container

- [x] 2.1 Update `generateComposeYml()` in `run-agent.ts`: remove credential-service service, update agent depends_on to proxy only
- [x] 2.2 Update `generateAcpComposeYml()` in `acp/session.ts`: remove any credential-service references (already absent, verified)
- [x] 2.3 Add in-process credential service startup: create CredentialService + CredentialWSClient, connect to proxy WebSocket
- [x] 2.4 Remove credential-service startup step from `runAgent()` interactive flow (replaced by in-process)
- [x] 2.5 Verify proxy's `/ws/credentials` relay still works with in-process client (no code changes needed — same WebSocket protocol)

## 3. Remove ACP Command

- [x] 3.1 Replace `run-acp-agent.ts` with backward-compatibility re-export stub
- [x] 3.2 Update `commands/index.ts`: remove `registerRunAcpAgentCommand` import and call
- [x] 3.3 Move reusable exports (collectEnvCredentials, resolveAgentName, bootstrapChapter, etc.) to `run-agent.ts`

## 4. Update Documentation

- [x] 4.1 Update `docs/cli.md`: replace `agent` and `acp` sections with unified `agent` command, document `--acp` flag and all options
- [x] 4.2 Update `docs/architecture.md`: change three-container diagram to two-container, update startup sequence, update ACP mode section
- [x] 4.3 Update `docs/component-credential-service.md`: remove Docker mode, document in-process as the only mode
- [x] 4.4 Update `docs/get-started.md`: update "Run Agent" step, update "What Just Happened" section
- [x] 4.5 Update ACP client configuration examples in help text, docs, build.ts, lodge-init.ts, README.md, chapter-agent.md to use `agent --acp --role`

## 5. Update Unit Tests

- [x] 5.1 Update `run-agent.test.ts`: remove credential-service container tests from compose generation, add in-process credential service tests
- [x] 5.2 Update `run-agent.test.ts`: add tests for `--acp` flag, ACP mode startup, bridge creation
- [x] 5.3 Migrate relevant tests from `run-acp-agent.test.ts` to `run-agent.test.ts` (resolveAgentName, collectEnvCredentials, bootstrapChapter, onSessionNew, help text)
- [x] 5.4 `run-acp-agent.test.ts` imports re-exported symbols from backward-compat stub
- [x] 5.5 AcpSession tests unchanged (compose generation already correct)

## 6. Update E2E Tests

- [x] 6.1 Update `e2e/acp-client-spawn.test.ts`: change command from `acp --role` to `agent --acp --role`
- [x] 6.2 Run full e2e test suite — all 61 tests pass (11 skipped)
