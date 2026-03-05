## 1. Types

- [x] 1.1 Create `src/compose/types.ts` with `LockFile`, `LockFileRole`, and related types
- [x] 1.2 Create `src/compose/index.ts` exporting all types and generator functions

## 2. Docker Compose Generator

- [x] 2.1 Create `src/compose/docker-compose.ts` implementing `generateDockerCompose(agent, runtimeServices)`
- [x] 2.2 Implement mcp-proxy service generation with image, ports, volumes, env, logging, networks
- [x] 2.3 Implement runtime service rendering from ComposeServiceDef entries
- [x] 2.4 Implement agent-net network declaration

## 3. Environment Template Generator

- [x] 3.1 Create `src/compose/env.ts` implementing `generateEnvTemplate(agent)`
- [x] 3.2 Implement proxy variable collection (FORGE_PROXY_TOKEN, FORGE_PROXY_PORT)
- [x] 3.3 Implement app credential collection with deduplication and `${VAR}` interpolation extraction
- [x] 3.4 Implement runtime API key mapping (claude-code → ANTHROPIC_API_KEY, codex → OPENAI_API_KEY)

## 4. Lock File Generator

- [x] 4.1 Create `src/compose/lock.ts` implementing `generateLockFile(agent, generatedFiles)`
- [x] 4.2 Implement agent metadata serialization
- [x] 4.3 Implement role/task/app/skill dependency tree serialization
- [x] 4.4 Implement deterministic JSON output with sorted keys

## 5. Public API

- [x] 5.1 Update `src/index.ts` to re-export compose types and functions

## 6. Tests

- [x] 6.1 Create `tests/compose/docker-compose.test.ts` with tests for compose generation (single runtime, multi-runtime, custom proxy config, env var collection, logging config)
- [x] 6.2 Create `tests/compose/env.test.ts` with tests for env template (proxy vars, app credentials, dedup, runtime keys, section comments)
- [x] 6.3 Create `tests/compose/lock.test.ts` with tests for lock file (metadata, roles, generated files, determinism)
