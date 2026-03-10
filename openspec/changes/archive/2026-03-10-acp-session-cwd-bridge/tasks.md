# Tasks: ACP Session CWD Support -- Bridge Intercepts `session/new`

- [x] Add `onSessionNew` callback and body buffering to `AcpBridge`
- [x] Add `resetForNewSession()` to `AcpBridge` for multi-session support
- [x] Add `startInfrastructure()` to `AcpSession` for proxy + cred-svc only
- [x] Add `startAgent(projectDir)` to `AcpSession` for per-session agent launch
- [x] Add `stopAgent()` to `AcpSession` for tearing down agent only
- [x] Generate separate compose files for infrastructure vs agent (`generateInfraComposeYml`, `generateAgentComposeYml`)
- [x] Export `extractCwdFromBody()` helper for parsing cwd from request bodies
- [x] Update `runAcpAgent` orchestration: infrastructure first, bridge, then wait for session/new
- [x] Wire `onSessionNew` in `runAcpAgent` with CWD extraction + `.clawmasons` + `.gitignore`
- [x] Wire `onClientDisconnect` to stop agent only (not exit)
- [x] Update bridge tests for `onSessionNew`, buffering, multi-session, `extractCwdFromBody`
- [x] Update session tests for split lifecycle (`startInfrastructure`, `startAgent`, `stopAgent`)
- [x] Update `run-acp-agent` tests for new deferred flow
- [x] Run type check, linter, tests — 1028 tests passing
