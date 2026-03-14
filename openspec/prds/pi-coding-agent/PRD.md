# Pi Coding Agent — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** Clawmasons, Inc.

---

## 1. Executive Summary

This PRD introduces two interrelated capabilities to Clawmasons Chapter:

- **Pi Coding Agent Materializer:** A new `RuntimeMaterializer` implementation that targets [pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) (`@mariozechner/pi-coding-agent`) — a minimal, extensible terminal-based coding harness. This allows agent members to run on pi instead of (or alongside) Claude Code, giving chapters access to any LLM provider that pi supports (OpenRouter, Anthropic, OpenAI, Google, Mistral, etc.).
- **E2E Testing Framework:** A standalone `e2e/` package at the project root that provides scripts and tests for creating real chapters, installing members, and validating agent behavior against live LLM providers. The first test exercises the note-taker member running on pi-coding-agent with an OpenRouter key.

### Why Pi?

Pi-coding-agent is provider-agnostic. Claude Code is locked to Anthropic's API. By adding pi as a runtime, chapters gain the ability to:

1. Use **any LLM provider** — OpenRouter, OpenAI, Google, Mistral, Groq, xAI, and more.
2. Use **any model** available through those providers — including models not available through Anthropic.
3. **Mix runtimes** — one member on Claude Code (Anthropic), another on pi (OpenRouter), in the same chapter.
4. **Control costs** — route through OpenRouter to choose cost-effective models per member.

### Why E2E Tests?

The existing test suite validates the chapter framework's internals (schema parsing, graph resolution, materialization, Docker Compose generation). What's missing is validation that a materialized chapter **actually works** — that an agent can start, connect to the proxy, receive tools, and execute tasks against a live LLM. The E2E framework fills this gap.

---

## 2. Design Principles

- **Provider agnostic:** Members declare _what_ LLM they need (provider + model), not _how_ the runtime configures it. The materializer handles translation.
- **Runtime parity:** Pi-materialized workspaces must have the same governance guarantees as Claude Code workspaces — role-bounded tools, proxy-enforced permissions, skill documentation.
- **OpenRouter first:** OpenRouter is the initial target because it's a single API key that gives access to hundreds of models. Other providers follow the same pattern.
- **Testable end-to-end:** Every materializer must be provably correct via E2E tests, not just unit tests of generated files.
- **Manual-friendly:** E2E setup/teardown scripts are usable both in automated tests and by developers working interactively.

---

## 3. LLM Configuration in Member Package.json

### 3.1 New `llm` Field

Agent members gain an optional `llm` field in the `chapter` metadata that declares the LLM provider and model for that member. This field is runtime-agnostic — any materializer can consume it.

```json
{
  "name": "@acme/member-coder",
  "version": "1.0.0",
  "chapter": {
    "type": "member",
    "memberType": "agent",
    "name": "Coder",
    "slug": "coder",
    "email": "coder@chapter.local",
    "runtimes": ["pi-coding-agent"],
    "roles": ["@acme/role-developer"],
    "llm": {
      "provider": "openrouter",
      "model": "anthropic/claude-sonnet-4"
    }
  }
}
```

### 3.2 Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `llm` | object | No | LLM provider and model configuration. If omitted, the runtime's default is used (e.g., Claude Code defaults to Anthropic Claude). |
| `llm.provider` | string | Yes (if `llm` present) | The LLM provider identifier. Must match a pi-coding-agent provider key (see §3.3). |
| `llm.model` | string | Yes (if `llm` present) | The model identifier as understood by the provider. For OpenRouter, this is the OpenRouter model ID (e.g., `anthropic/claude-sonnet-4`). |

### 3.3 Supported Providers

These correspond to pi-coding-agent's API-key providers. The `provider` value maps to a pi auth key and environment variable:

| Provider Value | Pi Auth Key | Environment Variable | Notes |
|---------------|-------------|---------------------|-------|
| `openrouter` | `openrouter` | `OPENROUTER_API_KEY` | **Primary target.** Routes to 200+ models. |
| `anthropic` | `anthropic` | `ANTHROPIC_API_KEY` | Direct Anthropic access. |
| `openai` | `openai` | `OPENAI_API_KEY` | OpenAI models. |
| `google` | `google` | `GEMINI_API_KEY` | Google Gemini models. |
| `mistral` | `mistral` | `MISTRAL_API_KEY` | Mistral models. |
| `groq` | `groq` | `GROQ_API_KEY` | Groq inference. |
| `xai` | `xai` | `XAI_API_KEY` | xAI Grok models. |
| `azure-openai` | `azure-openai-responses` | `AZURE_OPENAI_API_KEY` | Azure-hosted OpenAI. |

Additional providers (Cerebras, Hugging Face, Bedrock, Vertex, etc.) follow the same pattern and can be added without schema changes.

### 3.4 Provider Credential Binding

Each provider maps to an environment variable that must be set at runtime. The materializer:

1. Reads `llm.provider` from the resolved member.
2. Adds the corresponding environment variable to the Docker Compose service's `environment` list and the `.env.example` template.
3. At runtime, pi-coding-agent reads the env var and authenticates with the provider.

For OpenRouter specifically:
```
OPENROUTER_API_KEY=sk-or-v1-...
```

### 3.5 Default Behavior

- If `llm` is omitted and the runtime is `claude-code`, the member uses Anthropic Claude (existing behavior, no change).
- If `llm` is omitted and the runtime is `pi-coding-agent`, the materializer raises a validation error — pi requires explicit provider configuration because it has no default.
- If `llm` is present and the runtime is `claude-code`, the `llm` field is ignored with a warning — Claude Code only supports Anthropic.

---

## 4. Pi Coding Agent Materializer

### 4.1 Overview

The pi-coding-agent materializer implements the `RuntimeMaterializer` interface (same as claude-code). It translates the resolved member dependency graph into pi's native configuration format.

### 4.2 Generated Workspace Structure

```
.chapter/members/<slug>/pi-coding-agent/
├── Dockerfile
└── workspace/
    ├── AGENTS.md                      # Agent identity + role docs (pi reads this)
    ├── .pi/
    │   ├── settings.json              # Pi project settings (model config)
    │   └── extensions/
    │       └── chapter-mcp/           # Extension: MCP proxy + task commands
    │           ├── package.json
    │           └── index.ts           # registerMcpServer() + registerCommand() per task
    └── skills/
        └── {skill-short-name}/
            └── README.md              # Skill artifact manifests
```

### 4.3 File Generation Details

#### 4.3.1 `AGENTS.md`

Same structure as claude-code's `AGENTS.md` — agent identity, roles, permitted tools, and constraints. Pi reads `AGENTS.md` from the working directory automatically.

#### 4.3.2 `.pi/settings.json`

Project-level pi settings declaring the active model:

```json
{
  "model": "openrouter/anthropic/claude-sonnet-4"
}
```

The model ID is constructed from the provider and model fields: `{provider}/{model}` for non-default providers. For OpenRouter specifically, the pi model ID format is: `openrouter/{openrouter-model-id}`.

#### 4.3.3 `.pi/extensions/chapter-mcp/`

A pi extension that serves as the bridge between chapter and pi. Pi extensions are TypeScript modules that receive the `pi` object and register capabilities. This extension:

1. Registers the chapter MCP proxy as a tool provider via `pi.registerMcpServer()`.
2. Registers each chapter task as a pi command via `pi.registerCommand()`.
3. Passes the `CHAPTER_PROXY_TOKEN` for authentication.

```typescript
// Generated by the pi-coding-agent materializer
export default (pi) => {
  // Connect to chapter proxy for tools
  pi.registerMcpServer({
    name: "chapter",
    transport: "sse",
    url: `${process.env.CHAPTER_PROXY_ENDPOINT}/sse`,
    headers: {
      Authorization: `Bearer ${process.env.CHAPTER_PROXY_TOKEN}`
    }
  });

  // Register tasks as pi commands
  pi.registerCommand({
    name: "take-notes",
    description: "Take notes using markdown conventions (role: writer)",
    prompt: [
      "## Role Context",
      "You are operating as role: writer",
      "Permitted tools for this role:",
      "  - filesystem: read_file, write_file, ...",
      "Do NOT use tools outside this list even if they appear available.",
      "",
      "## Required Skills",
      "See skills/markdown-conventions/ for Markdown conventions and formatting rules.",
      "",
      "## Task",
      "[task prompt content]"
    ].join("\n"),
  });
};
```

The materializer generates this extension dynamically from the resolved member's dependency graph — one `registerCommand()` call per task, with role context and skill references embedded.

#### 4.3.4 Task Registration via `pi.registerCommand()`

Pi registers tasks as commands via its extension API using `pi.registerCommand()`. Instead of slash command files (Claude Code) or prompt templates, the chapter-mcp extension registers each task as a pi command:

```typescript
// Inside the chapter-mcp extension
export default (pi) => {
  // Register MCP server for chapter proxy
  pi.registerMcpServer({
    name: "chapter",
    transport: "sse",
    url: `${process.env.CHAPTER_PROXY_ENDPOINT}/sse`,
    headers: { Authorization: `Bearer ${process.env.CHAPTER_PROXY_TOKEN}` }
  });

  // Register each task as a pi command
  pi.registerCommand({
    name: "take-notes",
    description: "Take notes using markdown conventions",
    prompt: `You are operating as role: writer\n...task prompt content...`,
  });
};
```

The materializer generates the extension code with all tasks pre-registered, including:
- Role context (active role, permitted tools)
- Skill references
- Task prompt content

This is equivalent to claude-code's `.claude/commands/*.md` but uses pi's native command registration API.

#### 4.3.5 `skills/{skill-short-name}/README.md`

Identical to claude-code's skill READMEs. Pi also reads skill documentation from a skills directory.

### 4.4 Dockerfile

```dockerfile
FROM node:22-slim

RUN npm install -g @mariozechner/pi-coding-agent

USER node
WORKDIR /home/node/workspace
COPY --chown=node:node workspace/ /home/node/workspace/

CMD ["pi", "--no-session", "--mode", "print"]
```

Key differences from claude-code:
- Installs `@mariozechner/pi-coding-agent` instead of `@anthropic-ai/claude-code`.
- Uses `pi --no-session --mode print` for non-interactive execution.
- No `DISABLE_AUTOUPDATER` needed (pi doesn't auto-update).

### 4.5 Docker Compose Service

```yaml
pi-coding-agent:
  build: ./pi-coding-agent
  restart: "no"
  volumes:
    - ./pi-coding-agent/workspace:/home/node/workspace
  working_dir: /home/node/workspace
  environment:
    - CHAPTER_ROLES=writer
    - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
    - CHAPTER_PROXY_TOKEN=${CHAPTER_PROXY_TOKEN}
    - CHAPTER_PROXY_ENDPOINT=http://mcp-proxy:9090
  depends_on:
    - mcp-proxy
  stdin_open: true
  tty: true
  init: true
  networks:
    - chapter-net
```

The LLM provider's API key env var is dynamically selected based on `llm.provider`.

### 4.6 Materializer Registration

The new materializer is registered alongside claude-code in the materializer registry:

```typescript
// src/materializer/index.ts
import { claudeCodeMaterializer } from "./claude-code.js";
import { piCodingAgentMaterializer } from "./pi-coding-agent.js";

export const materializers: Record<string, RuntimeMaterializer> = {
  "claude-code": claudeCodeMaterializer,
  "pi-coding-agent": piCodingAgentMaterializer,
};
```

---

## 5. E2E Testing Framework

### 5.1 Overview

A new `e2e/` directory at the project root. It's a standalone TypeScript package with its own `package.json`, `tsconfig.json`, and test runner. It exercises the full chapter lifecycle against real infrastructure.

### 5.2 Package Structure

```
e2e/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example                       # Template for required API keys
├── .env                               # Gitignored — actual keys
├── scripts/
│   ├── setup-chapter.ts               # Create + install a test chapter
│   └── teardown-chapter.ts            # Clean up a test chapter
├── fixtures/
│   └── test-chapter/                  # Fixture packages for testing
│       ├── package.json               # Workspace root
│       ├── members/
│       │   └── test-note-taker/
│       │       └── package.json       # Agent member using pi-coding-agent + openrouter
│       ├── apps/
│       ├── tasks/
│       ├── skills/
│       └── roles/
└── tests/
    └── build-pi-runtime.test.ts       # E2E test: note-taker on pi w/ OpenRouter
```

### 5.3 `package.json`

```json
{
  "name": "@clawmasons/e2e",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "setup": "tsx scripts/setup-chapter.ts",
    "teardown": "tsx scripts/teardown-chapter.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@clawmasons/mason": "workspace:*",
    "typescript": "^5.8.0",
    "vitest": "^3.0.0",
    "tsx": "^4.0.0",
    "dotenv": "^16.4.0"
  }
}
```

### 5.4 Setup Script (`scripts/setup-chapter.ts`)

Creates a temporary chapter workspace and installs members:

1. Create a temp directory (or use a configurable path).
2. Copy fixture packages into the workspace.
3. Run `chapter init` programmatically (using the chapter package's exported API).
4. Run `chapter install @test-note-taker` to scaffold the member.
5. Write `.env` with API keys from the environment or `.env` file.
6. Print the workspace path for manual inspection.

The script is usable standalone:
```bash
cd e2e
npm run setup
# → Created test chapter at /tmp/chapter-e2e-abc123
# → Installed @test/member-test-note-taker (pi-coding-agent, openrouter)
# → Ready for testing. Set OPENROUTER_API_KEY in .env
```

### 5.5 Teardown Script (`scripts/teardown-chapter.ts`)

Cleans up the test chapter:

1. Stop any running Docker Compose stacks.
2. Remove the temporary workspace directory.
3. Clean up any Docker resources (images, networks).

Usable standalone:
```bash
cd e2e
npm run teardown
# → Stopped chapter stack
# → Removed /tmp/chapter-e2e-abc123
```

### 5.6 Test Fixture: `test-note-taker`

The fixture member uses pi-coding-agent with OpenRouter:

```json
{
  "name": "@test/member-test-note-taker",
  "version": "1.0.0",
  "chapter": {
    "type": "member",
    "memberType": "agent",
    "name": "Test Note Taker",
    "slug": "test-note-taker",
    "email": "test-note-taker@chapter.local",
    "authProviders": [],
    "runtimes": ["pi-coding-agent"],
    "roles": ["@clawmasons/role-writer"],
    "llm": {
      "provider": "openrouter",
      "model": "anthropic/claude-sonnet-4"
    }
  },
  "dependencies": {
    "@clawmasons/chapter-core": "*"
  }
}
```

This reuses the existing `@clawmasons/role-writer` from chapter-core, giving the test member the same role/task/skill stack as the standard note-taker, but running on pi with OpenRouter instead of Claude Code with Anthropic.

### 5.7 E2E Test: Note-Taker on Pi with OpenRouter

`tests/build-pi-runtime.test.ts` (formerly `note-taker-pi.test.ts`):

```typescript
describe("note-taker on pi-coding-agent with OpenRouter", () => {
  // Setup: create chapter, install member
  // Requires: OPENROUTER_API_KEY in environment

  it("materializes a valid pi workspace", () => {
    // Verify generated files exist:
    // - AGENTS.md
    // - .pi/settings.json with correct model
    // - .pi/extensions/chapter-mcp/
    // - .pi/prompts/take-notes.md
    // - skills/markdown-conventions/README.md
  });

  it("generates correct Docker Compose with OpenRouter env", () => {
    // Verify docker-compose.yml includes:
    // - OPENROUTER_API_KEY environment variable
    // - pi-coding-agent service
    // - depends_on mcp-proxy
  });

  it("pi agent can connect to chapter proxy", () => {
    // Start the Docker Compose stack
    // Verify pi connects to the MCP proxy
    // Verify tools are available (filesystem_read_file, etc.)
  });

  it("pi agent can execute a note-taking task", () => {
    // Send a note-taking prompt to pi via SDK or RPC
    // Verify the agent creates a markdown file
    // Verify the file follows markdown conventions
  });
});
```

Tests that require live API calls are gated behind `OPENROUTER_API_KEY` presence — they skip gracefully when the key is missing (CI can set it as a secret).

---

## 6. Requirements

### P0 — Must-Have

**REQ-001: Pi Coding Agent Materializer**

Implement a `RuntimeMaterializer` for pi-coding-agent that generates a valid workspace from the resolved member dependency graph.

Acceptance criteria:
- Given a member with `runtimes: ["pi-coding-agent"]`, when materialized, then the workspace contains `AGENTS.md`, `.pi/settings.json`, `.pi/extensions/chapter-mcp/`, `.pi/prompts/`, and `skills/`.
- Given a member with `llm.provider: "openrouter"` and `llm.model: "anthropic/claude-sonnet-4"`, when materialized, then `.pi/settings.json` contains the correct model configuration.
- Given the materializer, when `generateDockerfile()` is called, then the Dockerfile installs `@mariozechner/pi-coding-agent` and uses `pi --no-session` as the entrypoint.
- Given the materializer, when `generateComposeService()` is called, then the service includes the correct LLM provider env var (e.g., `OPENROUTER_API_KEY`).

**REQ-002: LLM Configuration Schema**

Add an optional `llm` field to the agent member schema for declaring the LLM provider and model.

Acceptance criteria:
- Given a member with `llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" }`, when validated by the schema, then it passes.
- Given a member without `llm`, when validated, then it passes (field is optional).
- Given a member with `llm: { provider: "openrouter" }` (missing model), when validated, then it fails.
- Given a member with `llm: { model: "..." }` (missing provider), when validated, then it fails.
- Given a member with `runtimes: ["pi-coding-agent"]` and no `llm`, when validated during install, then a validation error is raised.
- Given a member with `runtimes: ["claude-code"]` and `llm` present, when validated during install, then a warning is emitted but install proceeds.

**REQ-003: Materializer Registry**

Register pi-coding-agent alongside claude-code in the materializer registry so the install pipeline can look up materializers by runtime name.

Acceptance criteria:
- Given the materializer registry, when looked up by `"pi-coding-agent"`, then the pi materializer is returned.
- Given a member with `runtimes: ["pi-coding-agent"]`, when `chapter install` runs, then the pi materializer is invoked.

**REQ-004: E2E Testing Package**

Create an `e2e/` package with TypeScript, vitest, and scripts for setup/teardown of test chapters.

Acceptance criteria:
- Given the `e2e/` directory, when `npm install` is run, then dependencies install successfully.
- Given `npm run setup`, then a test chapter is created with the fixture note-taker member installed.
- Given `npm run teardown`, then the test chapter is completely removed.
- Given `npm test`, then tests run (skipping live API tests when keys are missing).

**REQ-005: E2E Test — Note-Taker on Pi with OpenRouter**

Write an E2E test that validates the note-taker member materialized for pi-coding-agent with OpenRouter.

Acceptance criteria:
- Given the test chapter is set up, when the materialized workspace is inspected, then all expected pi workspace files exist with correct content.
- Given the test chapter is set up, when Docker Compose is generated, then the pi-coding-agent service has `OPENROUTER_API_KEY` in its environment.
- Given `OPENROUTER_API_KEY` is set, when the Docker Compose stack is started, then the pi agent connects to the MCP proxy successfully.
- Given the stack is running, when a note-taking task is sent to pi, then the agent creates a markdown note via the filesystem app's tools.

### P1 — Nice-to-Have

**REQ-006: Pi Extension for MCP Proxy**

Package the chapter-mcp extension as a reusable pi extension that can be installed via `pi install` independently of the materializer.

Acceptance criteria:
- Given the extension is published, when `pi install npm:@clawmasons/pi-chapter-mcp` is run, then pi gains chapter proxy connectivity.

**REQ-007: Model Override at Runtime**

Allow the model to be overridden at runtime via environment variable without changing the member package.json.

Acceptance criteria:
- Given `CHAPTER_LLM_MODEL=anthropic/claude-opus-4` is set, when pi starts, then it uses the override model instead of the package.json default.

**REQ-008: Multiple LLM Configurations per Member**

Support declaring multiple LLM configurations (e.g., a primary and fallback) in the member schema.

Acceptance criteria:
- (Design deferred to future PRD.)

### P2 — Future Consideration

**REQ-009: CI Integration for E2E Tests**

Integrate E2E tests into the CI pipeline with secrets management for API keys.

**REQ-010: Additional Runtime Materializers**

Use the pi materializer as a template for adding more runtimes: Codex, Aider, Continue, etc.

---

## 7. Architecture

### 7.1 Schema Change

The agent member schema gains an optional `llm` field:

```typescript
const llmSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

const agentMemberSchema = z.object({
  type: z.literal("member"),
  memberType: z.literal("agent"),
  name: z.string(),
  slug: z.string(),
  email: z.string().email(),
  authProviders: z.array(z.string()).optional().default([]),
  description: z.string().optional(),
  runtimes: z.array(z.string()).min(1),
  roles: z.array(z.string()).min(1),
  resources: z.array(resourceSchema).optional().default([]),
  proxy: proxySchema.optional(),
  llm: llmSchema.optional(),  // NEW
});
```

The `ResolvedMember` type gains a corresponding field:

```typescript
interface ResolvedMember {
  // ... existing fields ...
  llm?: {
    provider: string;
    model: string;
  };
}
```

### 7.2 Provider → Environment Variable Mapping

The materializer maintains a mapping from provider identifiers to environment variable names:

```typescript
const PROVIDER_ENV_VARS: Record<string, string> = {
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

### 7.3 Install Flow (Updated for Pi)

The existing install flow handles pi-coding-agent transparently:

```
chapter install @<member>
  │
  ├─1─ npm install
  ├─2─ Graph resolution → ResolvedMember (now includes llm field)
  ├─3─ Validation (NEW: validate llm required for pi-coding-agent)
  ├─4─ Compute toolFilters
  ├─5─ Scaffold per-member directory
  ├─6─ Materialize runtimes
  │      ├── claude-code materializer (existing)
  │      └── pi-coding-agent materializer (NEW)
  ├─7─ Generate docker-compose.yml (NEW: pi service + provider env vars)
  ├─8─ Write chapter.lock.json
  ├─9─ Update .chapter/members.json
  └─10─ Credential prompting (NEW: prompt for provider API key)
```

### 7.4 E2E Test Architecture

```
e2e/
  tests/
    build-pi-runtime.test.ts
        │
        ├── beforeAll:
        │     ├── copyFixtureWorkspace() (shared helper)
        │     └── chapter build @test/agent-test-note-taker (CLI only)
        │
        ├── test: workspace materialization
        │     └── Assert file existence + content
        │
        ├── test: Docker Compose generation
        │     └── Assert service def + env vars
        │
        ├── test: proxy connectivity (requires Docker)
        │     ├── docker compose up
        │     ├── Assert pi ↔ proxy connection
        │     └── docker compose down
        │
        ├── test: task execution (requires OPENROUTER_API_KEY)
        │     ├── docker compose up
        │     ├── Send task via pi SDK/RPC
        │     ├── Assert note file created
        │     └── docker compose down
        │
        └── afterAll:
              └── teardown workspace
```

Tests are layered by infrastructure requirements:
1. **No deps:** Workspace materialization tests (always run).
2. **Docker required:** Proxy connectivity tests (skip if Docker unavailable).
3. **Docker + API key:** Task execution tests (skip if `OPENROUTER_API_KEY` missing).

---

## 8. Open Questions

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| Q1 | What is the exact pi extension API for registering MCP servers? The pi docs mention extensions can add MCP support but the specific contract needs investigation. | Engineering | Yes — blocks REQ-001 |
| Q2 | Should the `llm` field support provider-specific options (e.g., OpenRouter routing preferences, Azure deployment names)? | Product | No |
| Q3 | Should the E2E package be added to the root workspace's `workspaces` array, or kept fully standalone? | Engineering | No |
| Q4 | For the pi Dockerfile, should we pin `@mariozechner/pi-coding-agent` to a specific version or use latest? | Engineering | No |
| Q5 | Should the `llm.provider` field be an enum of known providers or a free-form string (to support custom/self-hosted providers)? | Engineering | No |
| Q6 | Should pi's `models.json` config be generated by the materializer for custom model definitions, or rely on pi's built-in model registry? | Engineering | No |

---

## 9. Timeline Considerations

### Phase 1: Schema + Materializer Core
- Add `llm` field to agent member schema
- Implement `piCodingAgentMaterializer` with workspace generation
- Register in materializer registry
- Unit tests for all generated files

### Phase 2: Docker Integration
- Dockerfile generation
- Docker Compose service generation with provider env vars
- Credential prompting for LLM provider keys
- Update `.env.example` generation

### Phase 3: E2E Framework
- Create `e2e/` package structure
- Setup/teardown scripts
- Test fixtures (note-taker on pi + OpenRouter)
- Workspace materialization tests (no Docker needed)

### Phase 4: Live E2E Tests
- Docker-based proxy connectivity tests
- OpenRouter-based task execution tests
- CI integration guidance

---

## Appendix A: Pi Coding Agent Quick Reference

| Feature | Pi | Claude Code |
|---------|-----|-------------|
| Provider | Any (OpenRouter, Anthropic, OpenAI, etc.) | Anthropic only |
| MCP Support | Via extensions | Built-in (.mcp.json) |
| Project Instructions | AGENTS.md (or CLAUDE.md) | AGENTS.md |
| Task Registration | `pi.registerCommand()` via extension | `.claude/commands/*.md` |
| Skills | `.pi/skills/` or `skills/` | `skills/` |
| Settings | `.pi/settings.json` | `.claude/settings.json` |
| Non-interactive Mode | `pi --no-session --mode print` | `claude --dangerously-skip-permissions` |
| Package Install | `npm install -g @mariozechner/pi-coding-agent` | `npm install -g @anthropic-ai/claude-code` |

## Appendix B: OpenRouter Model IDs (Examples)

| Model | OpenRouter ID |
|-------|--------------|
| Claude Sonnet 4 | `anthropic/claude-sonnet-4` |
| Claude Opus 4 | `anthropic/claude-opus-4` |
| GPT-4o | `openai/gpt-4o` |
| Gemini 2.5 Pro | `google/gemini-2.5-pro-preview` |
| Llama 4 Maverick | `meta-llama/llama-4-maverick` |
| DeepSeek R1 | `deepseek/deepseek-r1` |
| Mistral Large | `mistralai/mistral-large` |
