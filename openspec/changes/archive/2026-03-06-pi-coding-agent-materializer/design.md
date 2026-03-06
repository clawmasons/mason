## Architecture

This change introduces one new module (`common.ts`), one new materializer (`pi-coding-agent.ts`), and refactors the existing claude-code materializer to use shared helpers. No new npm dependencies.

### Shared Helpers (`src/materializer/common.ts`)

Six functions are extracted from `claude-code.ts` into a shared module. These functions are runtime-agnostic -- they operate on `ResolvedMember`, `ResolvedRole`, `ResolvedTask`, and `ResolvedSkill` types and produce string content that both Claude Code and pi-coding-agent consume identically.

```typescript
// Extracted helpers (public exports):
export function formatPermittedTools(permissions): string;
export function findRolesForTask(taskName, roles): ResolvedRole[];
export function collectAllSkills(roles): Map<string, ResolvedSkill>;
export function collectAllTasks(roles): Array<[ResolvedTask, ResolvedRole[]]>;
export function generateAgentsMd(member): string;
export function generateSkillReadme(skill): string;
```

The claude-code materializer is updated to import these from `common.ts`. Its behavior is unchanged -- this is a pure refactor.

### Pi Coding Agent Materializer (`src/materializer/pi-coding-agent.ts`)

Implements the `RuntimeMaterializer` interface with three methods:

#### `materializeWorkspace(member, proxyEndpoint, proxyToken?)`

Returns a `MaterializationResult` (Map of relative paths to file content) with these entries:

1. **`AGENTS.md`** -- Reuses `generateAgentsMd()` from common. Identical format to claude-code. Pi reads `AGENTS.md` from the working directory automatically.

2. **`.pi/settings.json`** -- Pi project settings declaring the active model:
   ```json
   {
     "model": "openrouter/anthropic/claude-sonnet-4"
   }
   ```
   The model ID is constructed as `{provider}/{model}` from `member.llm`. If `member.llm` is undefined, the materializer throws an error (CHANGE 2 validation should catch this earlier, but defense-in-depth).

3. **`.pi/extensions/chapter-mcp/package.json`** -- Extension package metadata:
   ```json
   {
     "name": "chapter-mcp",
     "version": "1.0.0",
     "type": "module",
     "main": "index.ts"
   }
   ```

4. **`.pi/extensions/chapter-mcp/index.ts`** -- The bridge extension. Generated dynamically from the resolved member's dependency graph:
   ```typescript
   export default (pi) => {
     pi.registerMcpServer({
       name: "chapter",
       transport: "sse",
       url: `${proxyEndpoint}/sse`,
       headers: { Authorization: `Bearer ${proxyToken || "${CHAPTER_PROXY_TOKEN}"}` }
     });

     pi.registerCommand({
       name: "triage-issue",
       description: "...",
       prompt: "...",
     });
     // ... one registerCommand per task
   };
   ```

   Each `registerCommand()` call includes:
   - `name`: task short name (via `getAppShortName()`)
   - `description`: task description or generated from task name
   - `prompt`: full prompt content including role context, permitted tools, skill references, and task prompt

5. **`skills/{name}/README.md`** -- Reuses `generateSkillReadme()` from common. Same format as claude-code.

#### `generateDockerfile(member)`

Returns a minimal Dockerfile string. This is a placeholder for CHANGE 4 which will flesh it out:
```dockerfile
FROM node:22-slim
RUN npm install -g @mariozechner/pi-coding-agent
USER node
WORKDIR /home/node/workspace
COPY --chown=node:node workspace/ /home/node/workspace/
CMD ["pi", "--no-session", "--mode", "print"]
```

#### `generateComposeService(member)`

Returns a `ComposeServiceDef`. This is a placeholder for CHANGE 4 which will add LLM provider env vars:
```typescript
{
  build: "./pi-coding-agent",
  restart: "no",
  volumes: ["./pi-coding-agent/workspace:/home/node/workspace"],
  working_dir: "/home/node/workspace",
  environment: [`CHAPTER_ROLES=${roleNames}`],
  depends_on: ["mcp-proxy"],
  stdin_open: true,
  tty: true,
  init: true,
  networks: ["chapter-net"],
}
```

### Command Prompt Generation

The `generateCommandPrompt()` function (internal to pi-coding-agent.ts) produces the prompt string for each `registerCommand()` call. It follows the same structure as claude-code's slash commands:

```
## Role Context
You are operating as role: {roleShortName}
Permitted tools for this role:
  - {appShortName}: tool1, tool2, tool3
Do NOT use tools outside this list even if they appear available.

## Required Skills
See skills/{skillShortName}/ for {skill description}.

## Task
[contents of {task.prompt}]
```

This reuses `formatPermittedTools()` from common.ts for the tools list.

### Registration

The materializer is NOT registered in the materializer registry in this change. That's CHANGE 5 (Materializer Registry & Install Pipeline Integration). This change only creates the materializer and exports it from `src/materializer/index.ts`.

## Decisions

1. **Defense-in-depth for missing `llm`**: The materializer throws if `member.llm` is undefined, even though CHANGE 2's validator should catch this. Belt and suspenders.

2. **Placeholder Dockerfile and ComposeService**: These are implemented with minimal correct content. CHANGE 4 will add LLM provider env vars, credential binding, and any pi-specific Docker configuration. This allows CHANGE 3 to be tested independently.

3. **Extension uses `index.ts` not `index.js`**: Pi extensions are TypeScript modules that pi compiles on-the-fly. Using `.ts` is correct per pi's extension API.

4. **Proxy type defaults to SSE**: Like claude-code, the pi materializer defaults to SSE transport when `member.proxy.type` is not specified.

5. **Model ID format**: `{provider}/{model}` (e.g., `openrouter/anthropic/claude-sonnet-4`). This matches pi-coding-agent's model ID convention.
