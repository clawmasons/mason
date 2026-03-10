## 1. Credential Display

- [x] 1.1 Add `resolveRequiredCredentials()` function to `run-agent.ts` that collects credentials from agent and role apps
- [x] 1.2 Add `displayCredentials()` function that prints credential keys, declaring packages, and risk level
- [x] 1.3 Functions exported and tested, ready for integration when `runAgent` receives resolved data

## 2. Token Generation

- [x] 2.1 Generate `CREDENTIAL_PROXY_TOKEN` (32-byte hex) alongside existing `CHAPTER_PROXY_TOKEN`
- [x] 2.2 Pass `credentialProxyToken` to `generateComposeYml`

## 3. Compose Generation

- [x] 3.1 Add `credentialProxyToken` parameter to `generateComposeYml` opts
- [x] 3.2 Add `credential-service` service to compose YAML with proper build context, CREDENTIAL_PROXY_TOKEN env, depends_on proxy
- [x] 3.3 Add CREDENTIAL_PROXY_TOKEN to proxy service environment
- [x] 3.4 Update agent service to depend on credential-service instead of proxy
- [x] 3.5 Remove API key env vars (PROVIDER_ENV_VARS) from agent service
- [x] 3.6 Rename CHAPTER_PROXY_TOKEN to MCP_PROXY_TOKEN in agent service

## 4. Credential Service Dockerfile Validation

- [x] 4.1 Add credential service Dockerfile existence check in `validateDockerfiles`

## 5. Tests

- [x] 5.1 Test credential display output includes credential keys and risk level
- [x] 5.2 Test CREDENTIAL_PROXY_TOKEN is generated as 64-char hex string
- [x] 5.3 Test compose YAML includes credential-service service with correct config
- [x] 5.4 Test agent service has no API keys in environment
- [x] 5.5 Test agent service depends on credential-service
- [x] 5.6 Test proxy service has CREDENTIAL_PROXY_TOKEN
- [x] 5.7 Test both tokens are unique random hex strings

## 6. Verification

- [x] 6.1 `npx tsc --noEmit` compiles
- [x] 6.2 `npx eslint packages/cli/src/ packages/cli/tests/` passes (pre-existing docker-init.ts issue only)
- [x] 6.3 `npx vitest run` passes (717 tests, 44 files)
