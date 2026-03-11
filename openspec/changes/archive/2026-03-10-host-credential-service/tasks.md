## 1. Add Failing E2E Test

- [ ] 1.1 Add `TEST_LLM_TOKEN` to the mcp agent's credentials array in `packages/cli/templates/initiate/agents/mcp/package.json`
- [ ] 1.2 Set `TEST_LLM_TOKEN` env var in the e2e test process spawn (`acp-client-spawn.test.ts`)
- [ ] 1.3 Add a new test case in `acp-client-spawn.test.ts` (after tool listing, before shutdown) that sends a `credential_request` command for `TEST_LLM_TOKEN` and asserts the value is returned
- [ ] 1.4 Run e2e test and confirm it fails (credential service in Docker can't resolve host env vars)

## 2. Remove Credential Service from Docker Compose

- [ ] 2.1 Remove `credential-service` service block from `generateAcpComposeYml()` in `packages/cli/src/acp/session.ts`
- [ ] 2.2 Remove credential-service Dockerfile path variable and related env line generation
- [ ] 2.3 Change agent `depends_on` from `credential-service` to `proxy-<role>`
- [ ] 2.4 Update unit tests for `generateAcpComposeYml()` to expect two services instead of three

## 3. Start Credential Service In-Process

- [ ] 3.1 In `runAcpAgent()` (`packages/cli/src/cli/commands/run-acp-agent.ts`), after `startInfrastructure()`, create a `CredentialService` instance and `CredentialWSClient` connecting to `ws://localhost:<proxy-port>`
- [ ] 3.2 Pass collected env credentials as session overrides to the in-process `CredentialService`
- [ ] 3.3 Wire credential service cleanup into the SIGTERM/shutdown handler

## 4. Verify

- [ ] 4.1 Run `npx tsc --noEmit` to verify compilation
- [ ] 4.2 Run `npx eslint src/ tests/` to verify linting
- [ ] 4.3 Run unit tests (`npx vitest run`)
- [ ] 4.4 Run e2e test (`npx vitest run e2e/tests/acp-client-spawn.test.ts`) and confirm credential request test passes
