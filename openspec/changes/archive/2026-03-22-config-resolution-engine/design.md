## Context

Changes #1 and #2 established the `AgentConfigSchema` types and the `getAgentConfig`/`saveAgentConfig` storage layer. This change implements the runtime config resolution engine that connects schema declarations to stored config and interactive prompting.

The engine runs during `mason run`, after agent type resolution but before materialization. It reads the agent's `configSchema`, loads stored config, determines what's missing, prompts the user (or reports errors in CI), persists answers, and populates `ResolvedAgent.llm`.

## Goals / Non-Goals

**Goals:**
- Pure `resolveConfig(schema, storedConfig)` function returning `{ resolved, missing }` with no side effects
- Interactive prompting for missing fields using `node:readline` with injectable `PromptFn` for testability (PRD 10.3)
- Support for static `options` (select list) and dynamic `optionsFn` (dependent on prior field values)
- Field resolution in declaration order within each group so `optionsFn` can reference prior answers
- Non-interactive mode: structured error message listing all missing required fields (PRD 6.3)
- Persist newly prompted values via `saveAgentConfig` (Change #2)
- Wire into `createRunAction()` to run resolution and set `agent.llm` before materialization
- No-op when `configSchema` is absent (backward compatible)

**Non-Goals:**
- Populating `configSchema` on any agent package (Change #4)
- Credential resolution via `credentialsFn` (Change #4 wires this)
- Dialect self-registration (Change #5)
- Delegated validation (Change #6)

## Decisions

### 1. Two-file architecture: resolve-config.ts + prompt-config.ts

**resolve-config.ts** is the pure core: given a schema and stored config, it returns resolved values and missing fields. Zero I/O, zero prompting. This makes it trivially unit-testable.

**prompt-config.ts** is the I/O wrapper: it calls `resolveConfig`, then prompts for each missing field using an injectable `PromptFn`. This separation follows the PRD 10.3 testability requirement.

**Alternative:** Single file combining both. Rejected because it couples pure logic with I/O, making tests harder and violating the "pure function" principle from the PRD.

### 2. Injectable PromptFn type

```typescript
type PromptFn = (field: ConfigField, options: ConfigOption[]) => Promise<string>;
```

The prompt function receives the field metadata and the computed options list (from `options` or `optionsFn`). It returns the user's answer. Tests supply a mock; production uses `node:readline`.

**Alternative:** Use `inquirer` package. Rejected because it's not installed and `node:readline` is already used in the codebase (see `run-agent.ts:1405`). Adding a dependency for simple prompts is unnecessary.

### 3. Resolved config keyed as flat `Record<string, string>` with `group.field` keys

The `resolveConfig` function returns `resolved: Record<string, string>` with keys formatted as `"group.field"` (e.g., `"llm.provider"`). This matches the `credentialsFn` contract from PRD 4.3, which receives `config["llm.provider"]`.

For storage, the values are converted back to nested `Record<string, Record<string, string>>` before calling `saveAgentConfig`.

### 4. `optionsFn` receives only intra-group resolved values

Per PRD 4.2, `optionsFn` receives `resolved: Record<string, string>` for fields resolved so far within the same group. Keys are bare field keys (e.g., `"provider"`), not dotted. This keeps the API simple and matches the schema declaration.

### 5. Non-interactive detection via `process.stdout.isTTY`

Per PRD 6.3, when `process.stdout.isTTY` is falsy and fields are missing, the engine returns a structured error. The `promptConfig` function checks TTY status and either prompts or collects errors.

### 6. Wiring location: `createRunAction()` after agent type resolution

The config resolution runs in `createRunAction()` after `resolveAgentType()` succeeds (so we have the `AgentPackage`) and before `runAgent()` (so resolved config can influence materialization). The wiring:

1. Get `AgentPackage` from registry via `getAgentFromRegistry(resolvedAgentType)`
2. If `agentPkg.configSchema` exists:
   a. Load stored config via `getAgentConfig(projectDir, agentPkg.name)`
   b. Call `promptConfig(agentPkg.configSchema, storedConfig, agentPkg.name)`
   c. If new values were prompted, call `saveAgentConfig(projectDir, agentPkg.name, newValues)`
   d. The resolved flat config is available for future `credentialsFn` calls (Change #4)

## Test Coverage

### resolve-config.test.ts
- All fields stored: returns full `resolved` map, empty `missing` array
- No fields stored: returns empty `resolved` map, all required fields in `missing`
- Partial stored: returns stored values in `resolved`, missing fields in `missing`
- Optional fields: missing optional fields not in `missing` array
- Default values: fields with `default` and no stored value use the default in `resolved`
- `optionsFn` precedence: when both `options` and `optionsFn` exist, `optionsFn` wins
- `optionsFn` receives prior resolved values: verifying declaration-order dependency works
- Multiple groups: fields from different groups are all resolved
- Empty schema (no groups): returns empty `resolved` and `missing`

### prompt-config.test.ts
- All fields stored: no calls to `PromptFn`, returns resolved config
- Missing fields: `PromptFn` called for each missing field in declaration order
- Select list: `PromptFn` receives computed options from `options` or `optionsFn`
- Non-interactive mode: missing required fields produce error (no `PromptFn` calls)
- Newly prompted values returned as nested config for `saveAgentConfig`
- Optional missing fields in non-interactive mode: no error (they're optional)

## Risks / Trade-offs

- **[readline vs inquirer]** Using `node:readline` means select lists require manual rendering (number-based selection). This is functional but less polished than `inquirer`'s arrow-key navigation. Acceptable for v1; can upgrade later.
- **[No config migration]** Per PRD NG-4, existing stored config is not validated against the schema. If a schema changes and stored values become invalid, the user must manually delete the config section. Mitigation: out of scope per PRD.
