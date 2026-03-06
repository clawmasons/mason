## Architecture

No new modules. This change adds an exported constant, modifies one method in the pi materializer, and extends the env template generation.

### Provider Environment Variable Mapping (`src/materializer/pi-coding-agent.ts`)

A new exported constant maps LLM provider identifiers to their environment variable names:

```typescript
export const PROVIDER_ENV_VARS: Record<string, string> = {
  "openrouter": "OPENROUTER_API_KEY",
  "anthropic": "ANTHROPIC_API_KEY",
  "openai": "OPENAI_API_KEY",
  "google": "GEMINI_API_KEY",
  "mistral": "MISTRAL_API_KEY",
  "groq": "GROQ_API_KEY",
  "xai": "XAI_API_KEY",
  "azure-openai": "AZURE_OPENAI_API_KEY",
};
```

This mapping is used in two places:
1. `generateComposeService()` to inject the correct API key env var
2. `generateEnvTemplate()` in `src/compose/env.ts` to include the key in `.env.example`

The constant is exported so it can be imported by `env.ts` and potentially by future materializers or the install pipeline.

### Compose Service Update (`generateComposeService()`)

The current implementation only includes `CHAPTER_ROLES`. The PRD (section 4.5) specifies these additional environment variables:

- `${PROVIDER_API_KEY}=${${PROVIDER_API_KEY}}` -- dynamic based on `member.llm.provider`
- `CHAPTER_PROXY_TOKEN=${CHAPTER_PROXY_TOKEN}` -- for proxy authentication
- `CHAPTER_PROXY_ENDPOINT=http://mcp-proxy:9090` -- for proxy connection

The updated method:

```typescript
generateComposeService(member: ResolvedMember): ComposeServiceDef {
  const roleNames = member.roles.map(r => getAppShortName(r.name)).join(",");
  const environment = [`CHAPTER_ROLES=${roleNames}`];

  // Add LLM provider API key env var
  if (member.llm) {
    const envVar = PROVIDER_ENV_VARS[member.llm.provider];
    if (envVar) {
      environment.push(`${envVar}=\${${envVar}}`);
    }
  }

  // Add proxy connection env vars
  const port = member.proxy?.port ?? 9090;
  environment.push("CHAPTER_PROXY_TOKEN=${CHAPTER_PROXY_TOKEN}");
  environment.push(`CHAPTER_PROXY_ENDPOINT=http://mcp-proxy:${port}`);

  return {
    build: "./pi-coding-agent",
    restart: "no",
    volumes: ["./pi-coding-agent/workspace:/home/node/workspace"],
    working_dir: "/home/node/workspace",
    environment,
    depends_on: ["mcp-proxy"],
    stdin_open: true,
    tty: true,
    init: true,
    networks: ["chapter-net"],
  };
}
```

### Env Template Update (`src/compose/env.ts`)

The `generateEnvTemplate()` function gains a new section that inspects `member.llm.provider`, looks up the env var name in `PROVIDER_ENV_VARS`, and adds it to the "Runtime Auth" section of the `.env.example` template. The existing `RUNTIME_API_KEYS` map for runtime-level keys (e.g., `codex -> OPENAI_API_KEY`) continues to work alongside the new LLM provider keys.

## Decisions

1. **`PROVIDER_ENV_VARS` is exported from the materializer, not from a shared location**: The mapping is specific to pi-coding-agent's supported providers. If other materializers need it, it can be moved to `common.ts` later. For now, keeping it co-located with the materializer that uses it reduces coupling.

2. **Unknown providers are silently skipped**: If `member.llm.provider` is not in `PROVIDER_ENV_VARS`, no env var is added. This is intentional -- custom/self-hosted providers may not have a standard API key env var. The validator (CHANGE 2) already handles the "known provider" validation.

3. **Proxy endpoint uses `member.proxy.port` with fallback to 9090**: The endpoint is constructed as `http://mcp-proxy:${port}` where `port` comes from `member.proxy?.port ?? 9090`. This matches the Docker Compose network topology where the proxy service is named `mcp-proxy`. The PRD example shows port 9090, which is the default.

4. **Compose env vars use `${VAR}` interpolation**: The values like `${OPENROUTER_API_KEY}` are Docker Compose variable interpolation syntax, resolved from the `.env` file at `docker compose up` time. This is consistent with how claude-code's env vars work.
