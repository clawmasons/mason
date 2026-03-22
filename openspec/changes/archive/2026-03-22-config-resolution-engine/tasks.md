## 1. Pure Resolution Logic — resolve-config.ts

- [x] 1.1 Create `packages/cli/src/config/resolve-config.ts`
- [x] 1.2 Define `ResolveResult` type: `{ resolved: Record<string, string>, missing: ConfigField[] }`
- [x] 1.3 Implement `resolveConfig(schema: AgentConfigSchema, storedConfig: Record<string, Record<string, string>>): ResolveResult`
  - Walk each group in order, then each field in declaration order
  - Check `storedConfig[group.key][field.key]` first
  - If not found and field has `default`, use default
  - If not found and field is required (default true), add to `missing`
  - Build `resolved` as flat map with `"group.field"` keys
  - Pass intra-group resolved values (bare field keys) to `optionsFn` when present
- [x] 1.4 Export `resolveConfig`, `computeFieldOptions`, and `ResolveResult` from the module

## 2. Interactive Prompting — prompt-config.ts

- [x] 2.1 Create `packages/cli/src/config/prompt-config.ts`
- [x] 2.2 Define `PromptFn` type: `(field: ConfigField, options: ConfigOption[]) => Promise<string>`
- [x] 2.3 Implement `promptConfig(schema, storedConfig, agentName, promptFn?, isTTY?)`:
  - Call `resolveConfig` to get resolved and missing
  - If no missing fields, return `{ resolved, newValues: {} }`
  - If missing and non-interactive (`!process.stdout.isTTY`), throw `ConfigResolutionError` with structured message (PRD 6.3)
  - If missing and interactive, iterate missing fields in declaration order:
    - Compute options: `optionsFn(intraGroupResolved)` if present, else `field.options`, else `[]`
    - Call `promptFn(field, options)` to get user answer
    - Update both flat resolved map and intra-group map with the answer
  - Return `{ resolved, newValues }` where `newValues` is nested `Record<string, Record<string, string>>` for `saveAgentConfig`
- [x] 2.4 Implement default `createReadlinePromptFn()` using `node:readline`:
  - For select-list (options.length > 0): display numbered list, read number input
  - For free-text: display label and hint, read text input
- [x] 2.5 Define `ConfigResolutionError` class with `agentName`, `missingFields` properties
- [x] 2.6 Export `promptConfig`, `PromptFn`, `ConfigResolutionError`, `PromptConfigResult`

## 3. Wire into run-agent.ts

- [x] 3.1 In `createRunAction()`, after `resolvedAgentType` is determined and before `runAgent()`:
  - Get `AgentPackage` from registry
  - If `agentPkg.configSchema` exists:
    - Load stored config via `getAgentConfig(projectDir, agentPkg.name)`
    - Call `promptConfig(agentPkg.configSchema, storedConfig, agentPkg.name)`
    - If `newValues` is non-empty, call `saveAgentConfig(projectDir, agentPkg.name, newValues)`
- [x] 3.2 Catch `ConfigResolutionError` in `createRunAction()`, display structured error message, and exit with code 1

## 4. Tests — resolve-config.test.ts

- [x] 4.1 Create `packages/cli/tests/config/resolve-config.test.ts`
- [x] 4.2 Test: all fields stored — full resolved map, empty missing
- [x] 4.3 Test: no fields stored — all required fields in missing
- [x] 4.4 Test: partial stored — stored values resolved, rest missing
- [x] 4.5 Test: optional field missing — not in missing array
- [x] 4.6 Test: default value used when no stored value
- [x] 4.7 Test: optionsFn takes precedence over static options
- [x] 4.8 Test: optionsFn receives prior resolved values
- [x] 4.9 Test: multiple groups resolved correctly
- [x] 4.10 Test: empty schema — empty resolved and missing

## 5. Tests — prompt-config.test.ts

- [x] 5.1 Create `packages/cli/tests/config/prompt-config.test.ts`
- [x] 5.2 Test: all fields stored — no promptFn calls, returns resolved
- [x] 5.3 Test: missing fields — promptFn called for each missing field
- [x] 5.4 Test: promptFn receives computed options from optionsFn
- [x] 5.5 Test: non-interactive mode — throws ConfigResolutionError with missing fields
- [x] 5.6 Test: newly prompted values returned as nested config
- [x] 5.7 Test: optional missing fields in non-interactive — no error
- [x] 5.8 Test: optionsFn in prompt receives prior prompted values (not just stored)

## 6. Verification

- [x] 6.1 `npx tsc --noEmit` passes
- [x] 6.2 `npx eslint src/ tests/` passes (from packages/cli/)
- [x] 6.3 `npx vitest run packages/cli/tests/` passes (695 tests, all green)
- [x] 6.4 `npx vitest run packages/agent-sdk/tests/` still passes (168 tests, no regressions)
