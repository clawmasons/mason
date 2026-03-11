## Tasks

- [x] Remove `acpPort` from `generateAcpComposeYml()` opts and generated YAML (ports section)
- [x] Remove `acpPort` from `AcpSessionConfig` (deprecated, kept for backward compat with callers)
- [x] Remove `acpPort` from `SessionInfo`
- [x] Remove `acpPort` from `AgentSessionInfo`
- [x] Remove `--service-ports` from `startAgent()` run args
- [x] Add `spawnFn` to `AcpSessionDeps` for testability
- [x] Add `startAgentProcess(projectDir)` method using `child_process.spawn()`
- [x] Update `stopAgent()` to kill child process if one exists
- [x] Update `stop()` to kill child process if one exists
- [x] Update tests: port exposure tests should verify NO ports section
- [x] Update tests: `startAgent()` should not use `--service-ports`
- [x] Add tests for `startAgentProcess()` returning child process handle
- [x] Add tests for `stopAgent()` killing child process
- [x] Add tests for `stop()` killing child process and tearing down infrastructure
- [x] Update `run-acp-agent.test.ts` mock AgentSessionInfo (remove acpPort)
- [x] Verify compilation: `npx tsc --noEmit` -- PASS
- [x] Verify linting: `npx eslint src/ tests/` -- PASS
- [x] Verify tests pass: `npx vitest run` -- 1145 tests, 60 files, all pass
