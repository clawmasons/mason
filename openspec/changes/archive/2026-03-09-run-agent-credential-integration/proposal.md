## Why

The `run-agent` command currently passes all LLM provider API keys directly to agent containers via environment variables in the generated `docker-compose.yml`. This is insecure -- credentials are visible via `docker inspect`, compose files on disk, and process listings. The credential service (CHANGE 3) and proxy credential infrastructure (CHANGE 4) are now in place, but `run-agent` doesn't use them yet.

## What Changes

- Modify `run-agent.ts` to resolve and display required credentials before launch
- Generate `CREDENTIAL_PROXY_TOKEN` alongside the existing `CHAPTER_PROXY_TOKEN`
- Update docker-compose generation to include a `credential-service` container
- Remove all API key environment variables from the agent container -- only `MCP_PROXY_TOKEN` remains
- Update tests to verify all four changes

### New Capabilities
- `credential-display`: Before launching containers, display required credentials with declaring packages and role risk level
- `credential-service-compose`: Generate credential-service service in docker-compose with proper dependencies and token

### Modified Capabilities
- `compose-generation`: Agent container no longer receives API keys; depends on credential-service instead of just proxy
- `token-generation`: Two tokens generated (CHAPTER_PROXY_TOKEN + CREDENTIAL_PROXY_TOKEN)

## Impact

- Modified: `packages/cli/src/cli/commands/run-agent.ts`
- Modified: `packages/cli/tests/cli/run-agent.test.ts`
