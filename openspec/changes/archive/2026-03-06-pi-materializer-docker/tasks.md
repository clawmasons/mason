## 1. Add PROVIDER_ENV_VARS constant to pi materializer

- [x] 1.1 Define and export `PROVIDER_ENV_VARS: Record<string, string>` in `src/materializer/pi-coding-agent.ts`
- [x] 1.2 Include all 8 providers from PRD section 3.3: openrouter, anthropic, openai, google, mistral, groq, xai, azure-openai

## 2. Update generateComposeService() with environment variables

- [x] 2.1 Add dynamic LLM provider API key env var based on `member.llm.provider` lookup in `PROVIDER_ENV_VARS`
- [x] 2.2 Add `CHAPTER_PROXY_TOKEN=${CHAPTER_PROXY_TOKEN}` to environment
- [x] 2.3 Add `CHAPTER_PROXY_ENDPOINT=http://mcp-proxy:${port}` to environment (uses `member.proxy?.port ?? 9090`)
- [x] 2.4 Handle case where `member.llm` is undefined (no LLM env var added)
- [x] 2.5 Handle case where `member.llm.provider` is not in `PROVIDER_ENV_VARS` (unknown provider, no env var added)

## 3. Update env template generation

- [x] 3.1 Import `PROVIDER_ENV_VARS` from pi materializer in `src/compose/env.ts`
- [x] 3.2 Add LLM provider env var to "Runtime Auth" section when member has `llm` field
- [x] 3.3 Avoid duplicating env vars already added by `RUNTIME_API_KEYS` (via `addedAuthVars` Set)

## 4. Add pi materializer Compose service tests

- [x] 4.1 Test: Compose service includes `OPENROUTER_API_KEY` for openrouter provider
- [x] 4.2 Test: Compose service includes `ANTHROPIC_API_KEY` for anthropic provider
- [x] 4.3 Test: Compose service includes `CHAPTER_PROXY_TOKEN` env var
- [x] 4.4 Test: Compose service includes `CHAPTER_PROXY_ENDPOINT` env var
- [x] 4.5 Test: Compose service with unknown provider omits LLM env var gracefully
- [x] 4.6 Test: PROVIDER_ENV_VARS contains all 8 expected providers
- [x] 4.7 Test: Compose service includes `OPENAI_API_KEY` for openai provider
- [x] 4.8 Test: Compose service includes `GEMINI_API_KEY` for google provider
- [x] 4.9 Test: Compose service includes `AZURE_OPENAI_API_KEY` for azure-openai provider
- [x] 4.10 Test: Compose service omits LLM env var when member has no llm config
- [x] 4.11 Test: CHAPTER_PROXY_ENDPOINT uses custom port
- [x] 4.12 Test: CHAPTER_PROXY_ENDPOINT defaults to 9090 when no proxy config

## 5. Add env template tests

- [x] 5.1 Test: env template includes OPENROUTER_API_KEY for pi-coding-agent member with openrouter llm
- [x] 5.2 Test: env template includes ANTHROPIC_API_KEY for pi-coding-agent member with anthropic llm
- [x] 5.3 Test: env template deduplicates when runtime and llm provider map to same env var
- [x] 5.4 Test: env template does not include LLM env var when member has no llm config
- [x] 5.5 Test: env template skips LLM env var for unknown provider

## 6. Verify

- [x] 6.1 `npx tsc --noEmit` passes
- [x] 6.2 `npx eslint src/ tests/` passes
- [x] 6.3 `npx vitest run` passes -- 722 tests, 41 test files, 0 failures
