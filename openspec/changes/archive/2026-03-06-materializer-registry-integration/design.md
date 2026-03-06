## Architecture

This change is minimal. The pi-coding-agent materializer already exists and implements the full `RuntimeMaterializer` interface. The only missing piece is wiring it into the install pipeline's materializer registry.

### Registry Registration (`src/cli/commands/install.ts`)

The `materializerRegistry` Map is a lookup table from runtime name to materializer implementation. Adding pi-coding-agent is a single Map entry:

```typescript
import { piCodingAgentMaterializer } from "../../materializer/pi-coding-agent.js";

const materializerRegistry = new Map<string, RuntimeMaterializer>([
  ["claude-code", claudeCodeMaterializer],
  ["pi-coding-agent", piCodingAgentMaterializer],  // NEW
]);
```

Once registered, the existing install flow handles pi-coding-agent transparently:
1. `member.runtimes` includes `"pi-coding-agent"`
2. `materializerRegistry.get("pi-coding-agent")` returns the materializer
3. `materializeWorkspace()`, `generateDockerfile()`, and `generateComposeService()` are called
4. Files are written to `<outputDir>/pi-coding-agent/workspace/`, `<outputDir>/pi-coding-agent/Dockerfile`
5. The compose service is added to `docker-compose.yml`
6. `.env` already includes the LLM provider key (via `generateEnvTemplate()` which reads `member.llm`)

### Key Behaviors to Verify

1. **Pi workspace directory**: Files land at `pi-coding-agent/workspace/` (not `claude-code/workspace/`)
2. **No `.claude.json`**: Pi materializer does not define `generateConfigJson()`, so no `.claude.json` is generated and no `.claude/` directory is created for pi-coding-agent
3. **No `.claude/` directory**: The install command only creates `.claude/` directories for runtimes whose materializer defines `generateConfigJson` -- pi does not
4. **Compose service**: The pi-coding-agent service appears in `docker-compose.yml` alongside mcp-proxy
5. **LLM env var**: `.env` contains the provider API key (e.g., `OPENROUTER_API_KEY=`)
6. **Multi-runtime**: A member with `runtimes: ["claude-code", "pi-coding-agent"]` gets both workspaces

### Test Strategy

Tests use the existing `runInstall()` function with a temporary directory containing fixture packages. A new `setupPiMember()` helper creates a member with `runtimes: ["pi-coding-agent"]` and `llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" }`.

The pi member reuses the same app/skill/task/role fixtures as the existing `setupValidMember()` helper to minimize duplication. Only the member package itself differs (runtime and llm fields).

## Decisions

1. **Import from pi-coding-agent.ts directly**: The install command imports from the concrete materializer file (same pattern as claude-code import), not from the barrel `index.ts`. This is consistent with the existing pattern and avoids circular dependencies.

2. **No docker-compose test changes**: The `generateDockerCompose` function is already generic -- it renders whatever services are in the `runtimeServices` Map. The pi-coding-agent tests in `tests/materializer/pi-coding-agent.test.ts` already validate the ComposeServiceDef shape. The install test validates end-to-end integration.

3. **No integration test changes needed**: The existing E2E install-flow test uses claude-code. Adding a pi-coding-agent variant would require the E2E fixture and is deferred to Changes 6-8.
