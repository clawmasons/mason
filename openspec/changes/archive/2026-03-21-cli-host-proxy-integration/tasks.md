## Tasks: CLI Integration — Start Host Proxy Instead of Credential Service

### Implementation Tasks

- [x] 1. Add `envCredentials` support to `HostProxyConfig` and `HostProxy.start()` in `packages/proxy/src/host-proxy.ts`
- [x] 2. Update `packages/cli/src/cli/commands/run-agent.ts`:
  - [x] 2a. Replace `CredentialService, CredentialWSClient` import with `HostProxy`
  - [x] 2b. Rename `startCredentialServiceFn` to `startHostProxyFn` in `RunAgentDeps`
  - [x] 2c. Replace `defaultStartCredentialService()` with `defaultStartHostProxy()`
  - [x] 2d. Update `runAgent()` call site (interactive mode)
  - [x] 2e. Update `runDevContainer()` call site
  - [x] 2f. Update `runAcpAgent()` call site — remove `credentialWsClient`/`credentialService` variables
  - [x] 2g. Update log messages from "credential service" to "host proxy"
- [x] 3. Update `packages/cli/src/acp/session.ts`:
  - [x] 3a. Rename `credentialProxyToken` to `relayToken` in `InfrastructureInfo`
  - [x] 3b. Update `generateAcpComposeYml` to use `RELAY_TOKEN`
  - [x] 3c. Rename param/variable in `startInfrastructure()` and `start()`
- [x] 4. Update `packages/cli/src/materializer/docker-generator.ts`:
  - [x] 4a. Rename `credentialProxyToken` to `relayToken` in `SessionComposeOptions`
  - [x] 4b. Rename `credentialProxyToken` to `relayToken` in `SessionResult`
  - [x] 4c. Update `generateSessionComposeYml()` to emit `RELAY_TOKEN`
  - [x] 4d. Update `createSessionDirectory()` variable names
- [x] 5. Update tests:
  - [x] 5a. `packages/cli/tests/cli/run-agent.test.ts` — rename deps and assertions
  - [x] 5b. `packages/cli/tests/acp/session.test.ts` — rename token assertions
  - [x] 5c. `packages/cli/tests/materializer/docker-generator.test.ts` — rename token assertions

### Verification Tasks

- [x] 6. `npx tsc --noEmit` compiles cleanly (pre-existing unrelated error in package.test.ts only)
- [x] 7. `npx vitest run packages/cli/tests/` passes (629/629)
- [x] 8. `npx vitest run packages/proxy/tests/` passes (351/351, no regressions)
