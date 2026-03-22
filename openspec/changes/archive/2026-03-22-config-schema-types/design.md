## Context

The agent-config PRD (Change #1) requires foundational type definitions before any runtime behavior can be built. The `AgentPackage` interface in `packages/agent-sdk/src/types.ts` is the primary contract for agent packages. It currently has no mechanism for agents to declare configuration requirements, credential metadata, dialect registration, or self-validation.

The `CredentialConfig` in `packages/agent-entry/src/index.ts` has `key`, `type`, and `path` but lacks human-readable fields for guiding users through credential setup.

## Goals / Non-Goals

**Goals:**
- Define `AgentConfigSchema`, `ConfigGroup`, `ConfigField`, `ConfigOption` types per PRD §4.2
- Extend `AgentPackage` with `configSchema`, `credentialsFn`, `dialect`, `validate` per PRD §4.1
- Extend `CredentialConfig` with `label`, `obtainUrl`, `hint` per PRD §5.1
- Define lightweight `AgentValidationError` and `AgentValidationWarning` types in agent-sdk for the `validate` return type (since the existing `ValidationError`/`ValidationWarning` live in the CLI package and agent-sdk cannot depend on CLI)
- All new fields are optional — zero breaking changes
- Export all new types from agent-sdk's public API

**Non-Goals:**
- Config resolution runtime logic (Change #3)
- Interactive prompting UX (Change #3)
- Populating config on any agent package (Change #4)
- Dialect self-registration runtime logic (Change #5)
- Validation delegation runtime logic (Change #6)

## Decisions

### 1. Config schema types in a new file `packages/agent-sdk/src/config-schema.ts`

Keeps the type surface organized. The existing `types.ts` is already 155 lines and covers materializer and package types. A separate file prevents bloat and makes the config schema independently importable.

**Alternative:** Add to `types.ts`. Rejected because it mixes concerns and the config schema is a distinct concept that will grow (future versioning, etc.).

### 2. Validation types defined in agent-sdk, not imported from CLI

The `validate` function on `AgentPackage` returns `{ errors: AgentValidationError[]; warnings: AgentValidationWarning[] }`. These types must live in agent-sdk (or shared) since agent-sdk cannot depend on CLI. We define lightweight versions:

```typescript
export interface AgentValidationError {
  category: string;
  message: string;
  context: Record<string, string | undefined>;
}

export interface AgentValidationWarning {
  category: string;
  message: string;
  context: Record<string, string | undefined>;
}
```

These are structurally compatible with the CLI's `ValidationError`/`ValidationWarning` types (which use string union categories and a fixed context shape). The CLI validator (Change #6) can accept the agent-sdk types without casting since the agent types are wider (string vs union).

**Alternative:** Move CLI validation types to `@clawmasons/shared`. Rejected for this change because it would require refactoring CLI imports and is outside the scope of Change #1 (types-only, no runtime changes).

### 3. `credentialsFn` references agent-sdk's own `CredentialConfig` type

The PRD shows `credentialsFn` returning `CredentialConfig[]`, but `CredentialConfig` currently lives in `packages/agent-entry/src/index.ts`. To avoid agent-sdk depending on agent-entry, we define a `AgentCredentialRequirement` type in agent-sdk that mirrors the relevant fields:

```typescript
export interface AgentCredentialRequirement {
  key: string;
  type: "env" | "file";
  path?: string;
  label?: string;
  obtainUrl?: string;
  hint?: string;
}
```

This is the type returned by `credentialsFn`. The CLI (Change #3) will map these to the runtime `CredentialConfig` type.

**Alternative:** Make agent-sdk depend on agent-entry. Rejected because it inverts the dependency direction (agent-entry is a runtime package, agent-sdk is a build-time SDK).

### 4. `validate` receives `ResolvedAgent` from `@clawmasons/shared`

`ResolvedAgent` is already re-exported from agent-sdk via `@clawmasons/shared`. The `validate` function signature uses it directly: `validate?: (agent: ResolvedAgent) => AgentValidationResult`. No new dependency needed.

### 5. `configSchema.groups[].fields[]` uses `optionsFn` with `Record<string, string>`

Per PRD §4.2, `optionsFn` receives `resolved: Record<string, string>` — a flat map of previously resolved field values keyed by field key (not `group.field`). This keeps the API simple within a group context.

## Test Coverage

- **Type compilation test:** A test file creates an `AgentPackage` with all new fields populated (configSchema, credentialsFn, dialect, validate) and verifies `tsc --noEmit` passes.
- **Optional field test:** A test file creates a minimal `AgentPackage` (name + materializer only) and verifies it still compiles — proving all new fields are optional.
- **ConfigSchema structure test:** Unit test creating an `AgentConfigSchema` with groups, fields, static options, and dynamic optionsFn — verifies the type shapes are correct at runtime (object creation without type errors).
- **CredentialConfig extension test:** Verify `CredentialConfig` in agent-entry accepts `label`, `obtainUrl`, `hint` without errors while still working without them.

## Risks / Trade-offs

- **[Parallel validation type definitions]** Agent-sdk defines `AgentValidationError`/`AgentValidationWarning` separately from CLI's `ValidationError`/`ValidationWarning`. They are structurally compatible but not the same types. Mitigation: Change #6 (delegated validation) will handle the mapping. If they drift, a future change can consolidate into `@clawmasons/shared`.
- **[Parallel credential type definitions]** `AgentCredentialRequirement` in agent-sdk mirrors fields from `CredentialConfig` in agent-entry. Mitigation: Change #3 (config resolution) will map between them. Could consolidate later.
