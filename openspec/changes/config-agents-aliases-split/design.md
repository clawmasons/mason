## Context

`.mason/config.json` today has a single `agents` top-level key. Each entry declares an agent by name and can carry both a registry concern (`package`) and runtime concerns (`mode`, `role`, `home`, `credentials`, `devContainerCustomizations`). This conflation means you cannot reference the same agent package under two different runtime profiles without duplicating the package declaration, and the semantics of `--agent <name>` are muddied (is the name an implementation or a preset?).

The change splits these into two clear layers:
- **`agents`**: a name→package registry, resolved when `--agent <name>` is passed
- **`aliases`**: named runnable presets that reference an agent and carry the full runtime profile

## Goals / Non-Goals

**Goals:**
- Make `agents` entries a pure registry — only `package` is valid
- Introduce `aliases` as first-class named presets with runtime config + `agent-args`
- `mason {alias}` dispatches an alias the same way `mason --agent <name>` dispatches an agent today
- Emit a deprecation warning (with migration hint) when runtime fields are found in an `agents` entry
- No change to existing `--agent`, `--mode`, `--role`, `--home` CLI flags

**Non-Goals:**
- Removing support for runtime fields in `agents` entries immediately (deprecation-only in this change)
- Nested or inherited aliases
- Aliases referencing other aliases

## Decisions

### 1. `agents` entries are narrowed to `{ package }` only

**Decision**: `AgentEntryConfig` loses all runtime fields. Only `package` is valid.

**Rationale**: The registry and runtime profile are orthogonal concerns. A registry entry says "this name resolves to this package." How to run it is not the registry's job. Keeping them separate makes it trivial to have multiple aliases pointing at the same agent with different profiles.

**Alternative considered**: Keep runtime fields in both `agents` and `aliases`, with aliases overriding. Rejected — dual definition of the same fields invites confusion about precedence and makes validation harder.

---

### 2. New `AliasEntryConfig` type with `agent` reference + full runtime fields

**Decision**: A new `AliasEntryConfig` interface carries:
- `agent` (string, required) — key in `agents` registry
- `mode` (`"terminal" | "acp" | "bash"`, optional)
- `role` (string, optional)
- `home` (string, optional)
- `credentials` (string[], optional)
- `devContainerCustomizations` (optional)
- `agent-args` (string[], optional) — extra args appended to the agent invocation

**Rationale**: Mirrors the current `AgentEntryConfig` runtime fields exactly, so migration is mechanical. `agent-args` is additive — it allows per-alias agent-level flags that have no CLI equivalent in mason itself (e.g., `--verbose`, `--max-turns`).

---

### 3. `mason {alias}` dispatch: aliases take precedence over agent names

**Decision**: When resolving `mason <name>`, aliases are checked first. If `<name>` matches an alias, the alias is used. If not, it falls back to the agents registry (existing behavior).

**Rationale**: Aliases are intentional user-defined presets. If a user defines an alias with the same name as an agent, they almost certainly want the alias behavior. Precedence order: alias → agent → error.

**Alternative considered**: Error on name collision. Rejected — too disruptive; users may not control agent names registered by packages.

---

### 4. `agent-args` are appended after resolved runtime args

**Decision**: `agent-args` string array is appended to the agent container entrypoint args, after all mason-resolved args (`--mode`, `--role`, etc.). CLI flags still take precedence over anything in `agent-args`.

**Rationale**: Agent-level flags that mason doesn't model (e.g., `--max-turns`, `--verbose`) need a passthrough mechanism. Appending last keeps mason's own arg resolution authoritative.

---

### 5. Deprecation warning (not hard error) for runtime fields in `agents`

**Decision**: If an `agents` entry contains any of `mode`, `role`, `home`, `credentials`, `devContainerCustomizations`, the CLI logs a warning at startup:
> `Agent "<name>" has runtime fields (mode, role) in the "agents" config. Move these to an "aliases" entry. Runtime fields in "agents" will be removed in a future version.`

The fields are still applied during the deprecation period.

**Rationale**: A hard error would break all existing configs immediately. A warning gives users a visible migration path without a breaking deployment.

## Risks / Trade-offs

- **Name collision between agents and aliases** → Mitigated by well-defined precedence (alias wins) and a startup warning if collision is detected.
- **`agent-args` order sensitivity** → Args appended at the end may conflict with positional args some agents expect. Mitigation: document that `agent-args` is for flags only; validate that entries start with `-`.
- **Deprecation period length** → Leaving runtime fields in `agents` working indefinitely accumulates tech debt. Mitigation: plan to hard-error in a follow-up change once usage of the new format is confirmed.

## Migration Plan

1. User adds an `aliases` section to `.mason/config.json` with entries that mirror existing `agents` runtime config.
2. User removes runtime fields from `agents` entries (leaving only `package`).
3. Existing `mason <agentName>` invocations continue to work; `mason <aliasName>` works identically.
4. No container rebuild required — change is config-only.

**Rollback**: Revert `.mason/config.json` to previous state. No code-level rollback needed during the deprecation period (old format still works).

## Open Questions

- Should `agent` field in an alias be required, or can an alias exist without an agent reference (acting as a pure arg preset applied on top of whatever `--agent` is passed)? For now: required.
- Should aliases support a `description` field for `mason list` output? Deferred to a follow-up.
