## Why

The pi-coding-agent materializer (CHANGE 3) generates workspace files -- AGENTS.md, .pi/settings.json, extension code, and skills -- but the `generateDockerfile()` and `generateComposeService()` methods are incomplete stubs. The Dockerfile is present but the Compose service is missing critical environment variables: the LLM provider API key (e.g., `OPENROUTER_API_KEY`), `CHAPTER_PROXY_TOKEN`, and `CHAPTER_PROXY_ENDPOINT`. Without these, Docker Compose cannot start a functional pi-coding-agent container that authenticates with the LLM provider or connects to the chapter proxy.

This change completes the Docker integration for the pi materializer by adding a `PROVIDER_ENV_VARS` mapping that translates `llm.provider` values to their corresponding environment variable names, and wiring those into the Compose service definition.

## What Changes

- **Pi materializer** (`src/materializer/pi-coding-agent.ts`):
  - Add exported `PROVIDER_ENV_VARS` constant mapping provider IDs to env var names (openrouter -> OPENROUTER_API_KEY, anthropic -> ANTHROPIC_API_KEY, etc.)
  - Update `generateComposeService()` to include the LLM provider env var dynamically based on `member.llm.provider`
  - Update `generateComposeService()` to include `CHAPTER_PROXY_TOKEN` and `CHAPTER_PROXY_ENDPOINT` env vars

- **Env template** (`src/compose/env.ts`):
  - Update `generateEnvTemplate()` to add the LLM provider env var from `member.llm.provider` using the `PROVIDER_ENV_VARS` mapping

- **Tests** (`tests/materializer/pi-coding-agent.test.ts`):
  - Add tests for `PROVIDER_ENV_VARS` mapping correctness
  - Add tests for dynamic env var selection in Compose service based on `llm.provider`
  - Add tests for `CHAPTER_PROXY_TOKEN` and `CHAPTER_PROXY_ENDPOINT` in Compose service
  - Add tests for different providers (openrouter, anthropic, openai, etc.)

- **Tests** (`tests/compose/env.test.ts`):
  - Add test for LLM provider env var appearing in the env template

## Capabilities

### New Capabilities
- `provider-env-vars-mapping`: Exported constant mapping LLM provider IDs to environment variable names, usable by materializers and env generation

### Modified Capabilities
- `pi-coding-agent-compose-service`: Compose service now includes LLM provider API key, proxy token, and proxy endpoint environment variables
- `env-template-generation`: .env.example template now includes LLM provider API key for pi-coding-agent members

## Impact

- **Modified:** `src/materializer/pi-coding-agent.ts` -- Add PROVIDER_ENV_VARS, update generateComposeService()
- **Modified:** `src/materializer/index.ts` -- Re-export PROVIDER_ENV_VARS
- **Modified:** `src/compose/env.ts` -- Import PROVIDER_ENV_VARS, add LLM provider env var to template with deduplication
- **Modified:** `tests/materializer/pi-coding-agent.test.ts` -- Add 21 new tests: Compose service env vars (LLM provider, proxy), PROVIDER_ENV_VARS constant
- **Modified:** `tests/compose/env.test.ts` -- Add 5 new tests: LLM env var in template, deduplication, edge cases
- **No new dependencies**
