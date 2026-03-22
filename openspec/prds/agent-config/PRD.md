# Agent Configuration Framework — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** ClawForge, Inc.

---

## 1. Problem Statement

Running `mason run pi` today fails with a hard error:

> Pi-coding-agent materializer requires llm configuration on agent "…". Specify llm.provider and llm.model in the agent's package.json mason field.

The user has no way to supply this configuration interactively, and the error message points at a file format most users don't understand. This is one symptom of a broader architectural gap: the CLI has no framework for agents to declare their configuration needs and have the runtime satisfy them.

Specific friction points:

- **Hardcoded agent references.** Built-in agents are imported by name in `packages/cli/src/materializer/role-materializer.ts` (`BUILTIN_AGENTS` array) and mapped via a legacy alias table in `packages/cli/src/cli/commands/run-agent.ts` (`AGENT_TYPE_ALIASES`). Adding or removing an agent requires CLI code changes.
- **Hard errors on missing config.** The Pi materializer (`packages/pi-coding-agent/src/materializer.ts:27-31`) throws an unrecoverable error when `agent.llm` is undefined. There is no fallback, no prompt, and no guidance beyond a terse message referencing `package.json`.
- **No config schema on AgentPackage.** The `AgentPackage` interface (`packages/agent-sdk/src/types.ts:131-155`) has no mechanism for an agent to declare "I need these configuration values." Each agent silently assumes config is present and fails at materialization time when it is not.
- **LLM config is never populated.** `ResolvedAgent.llm` exists (`packages/shared/src/types.ts:123-126`) but `adaptRoleToResolvedAgent()` in `packages/shared/src/role/adapter.ts` never sets it. The field is always `undefined` for role-based flows, making Pi unusable through the standard pipeline.
- **Undiscoverable credentials.** `CredentialConfig` (`packages/agent-entry/src/index.ts:27-34`) declares `key`, `type`, and `path` but offers no human-readable label, no URL explaining where to obtain the credential, and no hint about expected format. Users must read agent source code to understand what credentials are needed and why.
- **Agent-specific validation logic.** The validator (`packages/cli/src/validator/validate.ts:119-145`) contains per-agent conditional branches (`hasPi`, `hasClaude`) instead of delegating validation to the agents themselves.

---

## 2. Goals

### User Goals

- **G-1 First-run guided setup.** When a user runs `mason run pi` for the first time and the Pi agent's LLM config is missing, the CLI interactively prompts for provider and model — then launches the agent.
- **G-2 Configure-once persistence.** Answered prompts are persisted to `.mason/config.json` so the user is never asked the same question twice.
- **G-3 Self-documenting credentials.** When a credential is missing, the CLI displays what it is, where to obtain it, and what format is expected — before asking the user to provide it.
- **G-4 New agents without CLI changes.** A third-party agent package can declare its config schema and credentials in its `AgentPackage` export. The CLI discovers, prompts, and persists config without any code changes.
- **G-5 Agent-agnostic CLI.** The CLI treats all agents uniformly through the `AgentPackage` contract. No agent-specific `if` branches remain in shared CLI code.

### Non-Goals

- **NG-1 GUI or web-based configuration.** Configuration is CLI-only (interactive TTY prompts).
- **NG-2 Secret management service.** Credentials are resolved via environment variables, `.env` files, or the existing credential service. This PRD does not introduce a new secrets backend.
- **NG-3 Runtime config hot-reload.** Config is read once at the start of `mason run`. Changes to `.mason/config.json` during a session are not picked up until the next run.
- **NG-4 Config migration tooling.** Users with existing `.mason/config.json` files are not automatically migrated. The new fields are additive and optional.
- **NG-5 Multi-project config sharing.** Config is per-project (`.mason/config.json`). Global or shared config across projects is out of scope.
- **NG-6 Config validation UI.** A `mason config validate` command is out of scope. Validation happens at run time.

---

## 3. Design Principles

- **Agent-SDK as the single contract.** Every agent capability — materialization, config requirements, credential needs, validation — is declared on `AgentPackage`. The CLI never needs agent-specific knowledge.
- **Declarative over imperative.** Agents declare *what* they need (schema), not *how* to get it. The CLI owns the prompting UX and persistence mechanics.
- **Progressive disclosure.** A simple agent (like Claude Code) that needs no extra config declares no `configSchema` and the user sees no prompts. A complex agent (like Pi) declares its fields and the user is guided through only what's missing.
- **Fail-forward with guidance.** When config is missing, the CLI does not crash. It either prompts interactively (TTY) or exits with a structured error message listing exactly what is needed (non-interactive/CI).

---

## 4. Config Schema Declaration

### 4.1 New Fields on AgentPackage

```typescript
export interface AgentPackage {
  // ... existing fields ...

  /**
   * Declarative configuration schema.
   * Groups of fields the CLI will prompt for when values are missing.
   * Fields are resolved in declaration order within each group.
   */
  configSchema?: AgentConfigSchema;

  /**
   * Dynamic credential requirements computed from resolved config.
   * Called after configSchema fields are resolved, allowing credentials
   * to depend on config values (e.g., different provider → different API key).
   */
  credentialsFn?: (config: Record<string, string>) => CredentialConfig[];

  /**
   * The agent's scanner dialect key for the dialect registry.
   * When set, the agent self-registers with the dialect registry
   * instead of requiring a hardcoded entry.
   */
  dialect?: string;

  /**
   * Agent-specific validation.
   * Called during the validation phase with the fully resolved agent.
   * Returns errors and warnings without requiring CLI-side conditionals.
   */
  validate?: (agent: ResolvedAgent) => {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  };
}
```

### 4.2 AgentConfigSchema

```typescript
/**
 * Top-level configuration schema declared by an agent package.
 */
export interface AgentConfigSchema {
  /** Ordered groups of related configuration fields. */
  groups: ConfigGroup[];
}

/**
 * A logical grouping of configuration fields (e.g., "LLM Settings").
 */
export interface ConfigGroup {
  /** Machine-readable key used as the storage namespace (e.g., "llm"). */
  key: string;
  /** Human-readable label shown during prompting (e.g., "LLM Settings"). */
  label: string;
  /** Ordered fields within this group. Resolved in declaration order. */
  fields: ConfigField[];
}

/**
 * A single configuration field the CLI prompts for.
 */
export interface ConfigField {
  /** Machine-readable key used for storage (e.g., "provider"). */
  key: string;
  /** Human-readable prompt label (e.g., "LLM Provider"). */
  label: string;
  /** Explanatory text shown below the prompt. */
  hint?: string;
  /** Whether this field must be provided. Defaults to true. */
  required?: boolean;
  /** Default value if the user presses Enter without typing. */
  default?: string;
  /**
   * Static list of options for a select prompt.
   * When present, the CLI renders a select list instead of free-text input.
   */
  options?: ConfigOption[];
  /**
   * Dynamic options computed from previously resolved fields in this group.
   * Receives a map of { fieldKey: resolvedValue } for all fields resolved
   * so far (declaration order). Returns options for this field.
   *
   * When both `options` and `optionsFn` are present, `optionsFn` takes precedence.
   */
  optionsFn?: (resolved: Record<string, string>) => ConfigOption[];
}

/**
 * A selectable option for a configuration field.
 */
export interface ConfigOption {
  /** Display label shown in the select list. */
  label: string;
  /** Stored value when selected. */
  value: string;
  /** Optional description shown alongside the label. */
  description?: string;
}
```

### 4.3 Example: Pi Coding Agent Config Schema

```typescript
const piCodingAgent: AgentPackage = {
  name: "pi-coding-agent",
  aliases: ["pi"],
  // ... materializer, dockerfile, etc. ...

  configSchema: {
    groups: [
      {
        key: "llm",
        label: "LLM Settings",
        fields: [
          {
            key: "provider",
            label: "LLM Provider",
            hint: "The inference provider Pi should use.",
            options: [
              { label: "OpenRouter", value: "openrouter", description: "Multi-model router" },
              { label: "OpenAI", value: "openai", description: "GPT models" },
              { label: "Together", value: "together", description: "Open-source models" },
            ],
          },
          {
            key: "model",
            label: "Model",
            hint: "The model identifier for the selected provider.",
            optionsFn: (resolved) => {
              if (resolved.provider === "openrouter") {
                return [
                  { label: "Claude Sonnet 4", value: "anthropic/claude-sonnet-4" },
                  { label: "GPT-4o", value: "openai/gpt-4o" },
                  { label: "Llama 3.1 405B", value: "meta-llama/llama-3.1-405b-instruct" },
                ];
              }
              if (resolved.provider === "openai") {
                return [
                  { label: "GPT-4o", value: "gpt-4o" },
                  { label: "GPT-4o mini", value: "gpt-4o-mini" },
                ];
              }
              return []; // Free-text input for unknown providers
            },
          },
        ],
      },
    ],
  },

  credentialsFn: (config) => {
    const providerKeyMap: Record<string, string> = {
      openrouter: "OPENROUTER_API_KEY",
      openai: "OPENAI_API_KEY",
      together: "TOGETHER_API_KEY",
    };
    const key = providerKeyMap[config["llm.provider"]] ?? `${config["llm.provider"]?.toUpperCase()}_API_KEY`;
    return [
      {
        key,
        type: "env",
        label: `${config["llm.provider"]} API Key`,
        hint: "Paste your API key. It will not be stored in config.json.",
        obtainUrl: config["llm.provider"] === "openrouter"
          ? "https://openrouter.ai/keys"
          : undefined,
      },
    ];
  },

  validate: (agent) => {
    const errors = [];
    if (!agent.llm) {
      errors.push({
        category: "llm-config",
        message: `Agent "${agent.agentName}" uses pi-coding-agent but has no LLM configuration.`,
        context: { agent: agent.name, runtime: "pi-coding-agent" },
      });
    }
    return { errors, warnings: [] };
  },
};
```

---

## 5. Credential Declaration

### 5.1 Enhanced CredentialConfig

The existing `CredentialConfig` is extended with human-readable fields:

```typescript
export interface CredentialConfig {
  /** Credential key to request from the credential service. */
  key: string;
  /** How to install the credential: "env" sets it as an env var, "file" writes to a path. */
  type: "env" | "file";
  /** File path to write the credential value to (required when type is "file"). */
  path?: string;

  // ── New fields ──

  /** Human-readable label displayed during prompting (e.g., "OpenRouter API Key"). */
  label?: string;
  /** URL where the user can obtain or manage this credential. */
  obtainUrl?: string;
  /** Hint text describing expected format (e.g., "Starts with sk-or-v1-..."). */
  hint?: string;
}
```

### 5.2 Static vs Dynamic Credentials

Credentials can be declared in two ways:

1. **Static** — on `AgentPackage.runtime.credentials`. These are always required regardless of config (e.g., the Anthropic API key for Claude Code).
2. **Dynamic** — via `AgentPackage.credentialsFn(config)`. These depend on resolved config values (e.g., the provider-specific API key for Pi). The function receives a flat map of resolved config values keyed as `"group.field"` (e.g., `"llm.provider": "openrouter"`).

The CLI merges both lists, deduplicates by `key`, and resolves them through the standard credential resolution chain.

### 5.3 Credential Resolution Chain

Credentials are resolved in order (first match wins):

1. Environment variable matching `key`
2. `.env` file in project root
3. Existing credential service (keychain / secure store)
4. Interactive prompt (TTY only) with `label`, `hint`, and `obtainUrl` displayed

In non-interactive mode (CI), missing credentials produce a structured error listing all unresolved keys.

---

## 6. Config Resolution Flow

### 6.1 Flow Overview

The config resolution flow runs at the start of `mason run`, after agent type resolution but before materialization:

```
1. Resolve agent type → get AgentPackage
2. Load stored config from .mason/config.json agentConfig.<agent-name>
3. For each configSchema group, for each field (in order):
   a. If value exists in stored config → use it
   b. If TTY → prompt user (select list or free-text)
   c. If not TTY → collect as "missing" for error report
4. Persist newly prompted values to .mason/config.json
5. If credentialsFn exists → call with resolved config
6. Merge static + dynamic credentials
7. Resolve credentials via credential chain (§5.3)
8. Set agent.llm from resolved config (if applicable)
9. Proceed to materialization
```

### 6.2 Storage Format

Resolved config values are stored in `.mason/config.json` under a new `agentConfig` key:

```json
{
  "project": "my-app",
  "agentConfig": {
    "pi-coding-agent": {
      "llm": {
        "provider": "openrouter",
        "model": "anthropic/claude-sonnet-4"
      }
    }
  },
  "aliases": { }
}
```

**Key format:** `agentConfig.<canonical-agent-name>.<group-key>.<field-key>`

Agents are always stored under their canonical `name` (e.g., `"pi-coding-agent"`), never under an alias.

### 6.3 Non-Interactive Mode (CI)

When `process.stdout.isTTY` is false and config values are missing, the CLI exits with a structured error:

```
Error: Agent "pi-coding-agent" requires configuration that is not set.

Missing values:
  llm.provider  — LLM Provider (The inference provider Pi should use.)
  llm.model     — Model (The model identifier for the selected provider.)

Set these values by running interactively:
  mason run pi

Or add them to .mason/config.json:
  {
    "agentConfig": {
      "pi-coding-agent": {
        "llm": { "provider": "...", "model": "..." }
      }
    }
  }
```

### 6.4 Reconfiguration

Users can re-trigger prompting for an agent by deleting its section from `.mason/config.json` or by running a future `mason config reset <agent>` command (out of scope for this PRD).

---

## 7. Agent Registry & Self-Registration

### 7.1 Self-Registration via `dialect`

Today, the dialect registry (`packages/shared/src/role/dialect-registry.ts`) hardcodes a table mapping agent names to directory names and field translations. With the new `dialect` field on `AgentPackage`, agents self-register:

```typescript
// In pi-coding-agent's AgentPackage export:
{
  name: "pi-coding-agent",
  dialect: "pi",          // ← registers as dialect "pi", scans ".pi/" directory
  aliases: ["pi"],
  // ...
}
```

The CLI populates the dialect registry from `AgentPackage.dialect` at init time, replacing the hardcoded table.

### 7.2 Self-Validation via `validate`

Today, `packages/cli/src/validator/validate.ts` contains agent-specific branches:

```typescript
// Current hardcoded logic (to be removed):
const hasPi = agent.runtimes.includes("pi-coding-agent");
if (hasPi && !hasLlm) { /* error */ }
const hasClaude = agent.runtimes.includes("claude-code-agent");
if (hasClaude && hasLlm) { /* warning */ }
```

With `AgentPackage.validate`, each agent owns its validation. The CLI validator iterates registered agents and delegates:

```typescript
for (const agentPkg of registeredAgents) {
  if (agentPkg.validate) {
    const result = agentPkg.validate(agent);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }
}
```

### 7.3 Removal of Hardcoded References

The following hardcoded structures become unnecessary and should be removed:

| Reference | File | Replacement |
|-----------|------|-------------|
| `BUILTIN_AGENTS` array | `cli/src/materializer/role-materializer.ts:15-21` | `createAgentRegistry()` with static imports (no alias logic in CLI) |
| `AGENT_TYPE_ALIASES` map | `cli/src/cli/commands/run-agent.ts:73-79` | `AgentPackage.aliases` (already partially migrated) |
| `inferAgentType()` default to `"claude-code-agent"` | `cli/src/cli/commands/run-agent.ts:51-56` | Configurable default agent in `.mason/config.json` or error if ambiguous |
| `checkLlmConfig()` agent-specific branches | `cli/src/validator/validate.ts:119-145` | `AgentPackage.validate()` |

---

## 8. Use Cases

### UC-1: Agent Declares Config Schema

**Actor:** Agent package author.
**Goal:** Declare that the agent requires LLM provider and model selection.

**Flow:**
1. Author adds a `configSchema` field to the agent's `AgentPackage` export with one group ("llm") containing two fields ("provider", "model").
2. Author adds `credentialsFn` that maps provider → API key name.
3. Author adds `validate` that checks `agent.llm` is set.
4. Author publishes the package. No CLI changes required.

**Acceptance Criteria:**
- The `AgentPackage` interface accepts all new fields without type errors.
- The CLI discovers the schema at runtime via the registry.

---

### UC-2: Interactive First-Run Prompting

**Actor:** Developer running `mason run pi` for the first time.
**Goal:** Configure Pi's LLM settings through guided prompts.

**Flow:**
1. Developer runs `mason run pi`.
2. CLI resolves agent type to `pi-coding-agent`, loads `AgentPackage`.
3. CLI checks `.mason/config.json` — no `agentConfig.pi-coding-agent` section exists.
4. CLI prompts: "LLM Provider" with options [OpenRouter, OpenAI, Together].
5. User selects "OpenRouter".
6. CLI calls `optionsFn` for "model" field with `{ provider: "openrouter" }`.
7. CLI prompts: "Model" with options [Claude Sonnet 4, GPT-4o, Llama 3.1 405B].
8. User selects "Claude Sonnet 4".
9. CLI persists `{ agentConfig: { "pi-coding-agent": { llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" } } } }`.
10. CLI calls `credentialsFn` → needs `OPENROUTER_API_KEY`.
11. CLI resolves credential via env/.env/keychain. If missing, prompts with label and `obtainUrl`.
12. Agent launches successfully.

**Acceptance Criteria:**
- All prompts are skipped on the second run (values are persisted).
- The `agent.llm` field is populated on `ResolvedAgent` before materialization.
- The materializer receives a valid `llm.provider`/`llm.model` and generates correct `.pi/settings.json`.

---

### UC-3: Credential Guidance

**Actor:** Developer who has never used OpenRouter.
**Goal:** Understand what credential is needed and where to get it.

**Flow:**
1. After config prompting, CLI determines `OPENROUTER_API_KEY` is needed.
2. Credential not found in env, `.env`, or keychain.
3. CLI displays:
   ```
   OpenRouter API Key
     Get one at: https://openrouter.ai/keys
     Hint: Paste your API key. It will not be stored in config.json.

   Enter value: ▊
   ```
4. User pastes key. CLI passes it to the credential service for the session.

**Acceptance Criteria:**
- `label`, `obtainUrl`, and `hint` are displayed when present.
- The credential is resolved for the session but not written to `config.json`.

---

### UC-4: Persistent Configuration

**Actor:** Developer running `mason run pi` a second time.
**Goal:** Start the agent immediately without re-entering config.

**Flow:**
1. Developer runs `mason run pi`.
2. CLI loads `agentConfig.pi-coding-agent` from `.mason/config.json`.
3. All `configSchema` fields have stored values. No prompts shown.
4. `credentialsFn` called → `OPENROUTER_API_KEY` resolved from env or keychain.
5. Agent launches.

**Acceptance Criteria:**
- No interactive prompts appear when all config values are stored.
- Stored values produce the same `ResolvedAgent.llm` as fresh prompting.

---

### UC-5: Third-Party Agent Registration

**Actor:** Author of a custom agent package `@acme/my-agent`.
**Goal:** Users can `mason run my-agent` without any CLI modifications.

**Flow:**
1. Author publishes `@acme/my-agent` with an `AgentPackage` export including `configSchema`, `credentialsFn`, `dialect`, and `validate`.
2. User adds to `.mason/config.json`:
   ```json
   {
     "agents": {
       "my-agent": { "package": "@acme/my-agent" }
     }
   }
   ```
3. User runs `mason run my-agent`.
4. CLI loads the package via `loadConfigAgents()`, discovers `configSchema`.
5. Config prompting and credential resolution proceed as with built-in agents.
6. Agent launches.

**Acceptance Criteria:**
- No changes to CLI source code are needed.
- The agent's `dialect` registers it in the dialect registry for scanner support.
- The agent's `validate` function runs during the validation phase.

---

## 9. Migration Path

### Phase 1: Add Framework (Non-Breaking)

- Add `configSchema`, `credentialsFn`, `dialect`, and `validate` as **optional** fields on `AgentPackage`.
- Implement config resolution flow in CLI (§6).
- Enhance `CredentialConfig` with optional `label`, `obtainUrl`, `hint` fields.
- Add `agentConfig` section support to `.mason/config.json` reader.
- All existing agent packages continue to work unchanged (no new fields populated yet).

### Phase 2: Populate Agent Config

- Add `configSchema` and `credentialsFn` to `pi-coding-agent`.
- Add `validate` to `pi-coding-agent` and `claude-code-agent`.
- Add `dialect` to all built-in agent packages.
- Wire `agentConfig` values into `ResolvedAgent.llm` during adaptation.
- Existing `.mason/config.json` files without `agentConfig` continue to work.

### Phase 3: Remove Hardcoding

- Remove `AGENT_TYPE_ALIASES` legacy map from `run-agent.ts`.
- Remove agent-specific branches from `checkLlmConfig()` in `validate.ts`.
- Remove hardcoded dialect registry entries (populated from `AgentPackage.dialect` instead).
- Remove `DEFAULT_MASON_CONFIG` hardcoded agent defaults.
- Remove `inferAgentType()` fallback to `"claude-code-agent"` (require explicit agent type or configurable default).

### Backward Compatibility

- Phase 1 is fully backward compatible — all new fields are optional.
- Phase 2 is backward compatible — agents without `configSchema` are unaffected.
- Phase 3 is a breaking change for users relying on `AGENT_TYPE_ALIASES` or `inferAgentType()` defaults. Mitigate by supporting a deprecation period where the legacy map emits warnings before removal.

---

## 10. Non-Functional Requirements

### 10.1 Performance

- **Config resolution latency:** Prompting overhead (excluding user think time) must be under 100ms. Schema evaluation and `optionsFn` calls are synchronous and trivial.
- **No disk I/O for cached config:** When all values are stored, config resolution is a single `readFileSync` of `.mason/config.json` (already performed for alias resolution).

### 10.2 Dependencies

- **No new runtime dependencies.** Interactive prompting uses the existing `inquirer` (or equivalent) dependency already in the CLI. Config persistence reuses the existing `.mason/config.json` read/write utilities.

### 10.3 Testability

- **Config resolution is pure.** Given a schema and a stored config map, the resolution function returns a list of missing fields or a complete config. No side effects.
- **Prompting is injectable.** The prompt function is passed as a parameter (or injected), allowing tests to supply canned answers without TTY interaction.
- **`optionsFn` and `credentialsFn` are unit-testable.** They are pure functions on the agent package with no CLI dependencies.

### 10.4 Idempotency

- **Running `mason run pi` twice with the same stored config produces identical `ResolvedAgent` state.** No config drift from repeated runs.
- **Prompting is idempotent.** If the user cancels mid-prompt (Ctrl-C), no partial config is written. Writes are atomic (write temp file → rename).

### 10.5 Forward Compatibility

- **Schema versioning.** `AgentConfigSchema` does not include a version field in v1. If the schema format changes in the future, a `version` field will be added and the CLI will migrate stored config on read.
- **Unknown fields in stored config are preserved.** The CLI only reads/writes keys it recognizes. Future agent schema additions do not invalidate existing stored config.

---

## Appendix A: Proposed AgentPackage Interface

Complete interface with all new fields:

```typescript
export interface AgentPackage {
  /** Primary agent type identifier used in `mason run --agent <name>`. */
  name: string;

  /** Alternative names for this agent (e.g., "claude" for "claude-code-agent"). */
  aliases?: string[];

  /** The workspace materialization implementation. */
  materializer: RuntimeMaterializer;

  /** Dockerfile generation hooks. */
  dockerfile?: DockerfileConfig;

  /** ACP mode configuration. */
  acp?: AcpConfig;

  /** Runtime command configuration for agent-launch.json. */
  runtime?: RuntimeConfig;

  /** Declarative task file layout config. Drives readTasks() and materializeTasks(). */
  tasks?: AgentTaskConfig;

  /** Declarative skill file layout config. Drives readSkills() and materializeSkills(). */
  skills?: AgentSkillConfig;

  // ── New fields (this PRD) ──

  /** Declarative configuration schema. Groups of fields the CLI prompts for when missing. */
  configSchema?: AgentConfigSchema;

  /** Dynamic credential requirements computed from resolved config values. */
  credentialsFn?: (config: Record<string, string>) => CredentialConfig[];

  /** Scanner dialect key for self-registration with the dialect registry. */
  dialect?: string;

  /** Agent-specific validation. Replaces hardcoded CLI-side checks. */
  validate?: (agent: ResolvedAgent) => {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  };
}
```

## Appendix B: Proposed `.mason/config.json` Schema

```json
{
  "project": "my-app",

  "agents": {
    "my-custom-agent": {
      "package": "@acme/my-agent"
    }
  },

  "agentConfig": {
    "pi-coding-agent": {
      "llm": {
        "provider": "openrouter",
        "model": "anthropic/claude-sonnet-4"
      }
    },
    "my-custom-agent": {
      "database": {
        "dialect": "postgres",
        "host": "localhost"
      }
    }
  },

  "aliases": {
    "dev": {
      "agent": "claude-code-agent",
      "role": "developer"
    },
    "pi-dev": {
      "agent": "pi-coding-agent",
      "role": "developer"
    }
  }
}
```

## Appendix C: Enhanced CredentialConfig Interface

```typescript
export interface CredentialConfig {
  /** Credential key to request from the credential service. */
  key: string;
  /** How to install the credential: "env" sets it as an env var, "file" writes to a path. */
  type: "env" | "file";
  /** File path to write the credential value to (required when type is "file"). */
  path?: string;

  // ── New fields (this PRD) ──

  /** Human-readable label displayed during prompting (e.g., "OpenRouter API Key"). */
  label?: string;
  /** URL where the user can obtain or manage this credential. */
  obtainUrl?: string;
  /** Hint text describing expected format or usage (e.g., "Starts with sk-or-v1-..."). */
  hint?: string;
}
```

## Appendix D: Hardcoded References to Remove

| Reference | Location | Current Behavior | Replacement |
|-----------|----------|-----------------|-------------|
| `BUILTIN_AGENTS` array | `packages/cli/src/materializer/role-materializer.ts:15-21` | Hardcoded imports of 3 agents | Static imports remain, but no alias/dialect logic in CLI |
| `AGENT_TYPE_ALIASES` map | `packages/cli/src/cli/commands/run-agent.ts:73-79` | Legacy alias table for 5 agents | `AgentPackage.aliases` (already partially migrated) |
| `inferAgentType()` claude default | `packages/cli/src/cli/commands/run-agent.ts:51-56` | Falls back to `"claude-code-agent"` | Configurable default or error when ambiguous |
| `checkLlmConfig()` branches | `packages/cli/src/validator/validate.ts:119-145` | `if (hasPi)` / `if (hasClaude)` conditionals | `AgentPackage.validate()` |
| Hardcoded dialect registry | `packages/shared/src/role/dialect-registry.ts` | Static table mapping 6 dialects | Populated from `AgentPackage.dialect` at registry init |
| `DEFAULT_MASON_CONFIG` | `packages/cli/src/cli/commands/run-agent.ts` | Hardcoded default agent config | Derived from `AgentPackage` defaults |
