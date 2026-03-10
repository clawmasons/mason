## 1. Package Scaffold

- [x] 1.1 Create `packages/agent-entry/package.json` with name `@clawmasons/agent-entry`, esbuild build script
- [x] 1.2 Create `packages/agent-entry/tsconfig.json` and `tsconfig.build.json`
- [x] 1.3 esbuild and tsx added as devDependencies in agent-entry package.json (per-package, not root)
- [x] 1.4 Update root `tsconfig.json` to include agent-entry paths
- [x] 1.5 Update `vitest.config.ts` to include agent-entry alias

## 2. MCP Client

- [x] 2.1 Create `packages/agent-entry/src/mcp-client.ts` — lightweight MCP client using fetch + Streamable HTTP
- [x] 2.2 Implement `initializeMcpSession` and `callTool` functions

## 3. Bootstrap Entrypoint

- [x] 3.1 Create `packages/agent-entry/src/index.ts` with `bootstrap()` function
- [x] 3.2 Implement `connectToProxy(proxyUrl, token)` — POST to `/connect-agent`, return `{ sessionToken, sessionId }`
- [x] 3.3 Implement `requestCredentials(proxyUrl, proxyToken, sessionToken, keys)` — initialize MCP session, call `credential_request` tool for each key
- [x] 3.4 Implement `launchRuntime(command, args, env)` — spawn child with credential env, stdio inherit, return exit code
- [x] 3.5 Wire bootstrap flow: read env vars → connect → request → launch → exit

## 4. esbuild Configuration

- [x] 4.1 Create `packages/agent-entry/esbuild.config.ts` — bundle to single ESM file targeting node22

## 5. Tests

- [x] 5.1 Create `packages/agent-entry/tests/index.test.ts` — mock proxy endpoints, test bootstrap flow (7 tests)
- [x] 5.2 Create `packages/agent-entry/tests/launch.test.ts` — test child process isolation and stdio (7 tests)
- [x] 5.3 Test error cases: proxy unreachable (retry 3x), invalid token, credential not found, invalid session

## 6. Verification

- [x] 6.1 `npx tsc --noEmit` compiles
- [x] 6.2 `npx eslint packages/agent-entry/src/ packages/agent-entry/tests/` passes
- [x] 6.3 `npx vitest run` passes (688 tests, 43 test files)
- [x] 6.4 `npm run build` in agent-entry produces single bundled file (dist/agent-entry.js, 8KB)
