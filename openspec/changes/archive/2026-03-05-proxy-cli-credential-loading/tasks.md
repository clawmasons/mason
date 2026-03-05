## 1. Credential Loading Module

- [ ] 1.1 Create `src/proxy/credentials.ts` with `loadEnvFile(filePath: string): Record<string, string>` — parse `.env` file (KEY=VALUE lines, skip comments/blanks, handle quoted values)
- [ ] 1.2 Add `resolveEnvVars(env: Record<string, string>, loaded: Record<string, string>): Record<string, string>` — replace `${VAR}` references with values from loaded env (process.env takes precedence)
- [ ] 1.3 Create `tests/proxy/credentials.test.ts` — test .env parsing (basic, comments, quotes, empty lines), var resolution (found, missing, process.env override, no refs)

## 2. Proxy CLI Command

- [ ] 2.1 Create `src/cli/commands/proxy.ts` with `registerProxyCommand(program)` — register `forge proxy` command with `--port`, `--startup-timeout`, `--agent` options
- [ ] 2.2 Implement `startProxy(rootDir, options)` — the main startup orchestrator following PRD §6.2 steps 1-10:
  - Discover packages → resolve agent → compute tool filters → load .env → open SQLite → start upstream → build routers → start server
- [ ] 2.3 Add graceful shutdown on SIGINT/SIGTERM — close proxy server, shut down upstream manager, close database
- [ ] 2.4 Register command in `src/cli/commands/index.ts`

## 3. Tests

- [ ] 3.1 Create `tests/proxy/credentials.test.ts` — unit tests for .env parsing and variable resolution
- [ ] 3.2 Create `tests/cli/proxy.test.ts` — unit tests for the proxy command startup logic with mocked dependencies (discover, resolve, upstream, server)

## 4. Delta Spec

- [ ] 4.1 Create delta spec documenting the new proxy-cli and credential-loading capabilities
