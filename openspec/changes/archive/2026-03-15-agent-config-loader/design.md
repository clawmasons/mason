## Context

`mason run` today requires `--role <name>` on every invocation and uses `--agent-type` to select an agent. The `.mason/config.json` already supports an `agents` field for declaring third-party packages (`{ package: string }`), loaded asynchronously via `createAgentRegistry` / `initRegistry`. The shorthand `mason <agent-type>` already works via `installAgentTypeShorthand` in `commands/index.ts`, which rewrites argv before Commander parses it — but it only recognises built-in agent types because `initRegistry` (which loads config agents) runs too late (inside `runAgent`, after parsing).

This change extends config entries with `home`, `mode`, and `role` launch-profile properties, renames `--agent-type` to `--agent`, and makes the shorthand aware of config-declared agent names.

## Goals / Non-Goals

**Goals:**
- Add `home`, `mode`, `role` optional properties to `.mason/config.json` agent entries
- Rename `--agent-type` to `--agent` on `mason run` (breaking)
- Make `mason <agent-name>` shorthand recognise config-declared agent names at parse time
- Apply config-declared launch defaults when running by agent name; let CLI flags override
- Auto-create `.mason/config.json` from a default template when it is missing
- Add `--home` and `--terminal` CLI flags

**Non-Goals:**
- Changing how `AgentPackage` itself is structured (home/mode/role are launch concerns, not package metadata)
- Supporting per-agent custom Docker base images or Dockerfiles via config
- Persisting the resolved config back to disk

## Decisions

### 1. Config entry shape: launch profile, not AgentPackage metadata

`home`, `mode`, and `role` are invocation-time concerns. They do not belong on `AgentPackage` (which is a package contract, not a project config). The `MasonConfig` interface in `discovery.ts` is extended to:

```ts
interface AgentEntryConfig {
  package: string;
  home?: string;           // host path to bind-mount over /home/mason/ in the container
  mode?: "terminal" | "acp" | "bash";  // default startup mode
  role?: string;           // default role name
}
interface MasonConfig {
  agents?: Record<string, AgentEntryConfig>;
}
```

A new `loadConfigAgentEntry(projectDir, agentName)` (sync, no dynamic import) returns the raw `AgentEntryConfig` for a named agent. This is used at launch time to extract defaults without needing the full registry.

**Alternative considered:** embed these fields into `AgentPackage`. Rejected — packages are published artefacts; per-project launch preferences must not leak into them.

### 2. Two-phase config reading for shorthand detection

The `installAgentTypeShorthand` hook runs synchronously before Commander parses. `initRegistry` is async and does dynamic `import()` — unsuitable here.

**Solution:** add a lightweight sync helper `readConfigAgentNames(projectDir): string[]` that does only `fs.readFileSync` + `JSON.parse` on `.mason/config.json` and returns the agent *key names*. No dynamic imports. The shorthand check becomes:

```
isKnownAgentType(firstArg) || configAgentNames.has(firstArg)
```

`configAgentNames` is populated once at startup by reading the config synchronously before `program.parse()` is called.

**Alternative considered:** call `initRegistry` eagerly at top of `run()` before `program.parse()`. Rejected — `initRegistry` is async and does dynamic imports for all config agents; calling it unconditionally on every CLI invocation (including `mason chapter list`) is wasteful.

### 3. `--agent-type` renamed to `--agent` (breaking)

The flag, the positional argument, and all internal references are renamed. Resolution order for the `--agent` value:

1. Look up name in config entries (sync via `loadConfigAgentEntry`) → if found, extract `home`/`mode`/`role` defaults
2. Resolve the package via the registry (either as a config-declared package name or a built-in agent type / alias)
3. If not found in either, error with the list of known agent names

The existing positional `[agent-type]` argument is also renamed to `[agent]` for consistency, but its behaviour is unchanged.

**Why not keep `--agent-type` as an alias?** The codebase is internal tooling with no published CLI contract; a clean rename is preferable to a compatibility shim.

### 4. `role` default: makes `--role` optional when agent config provides it

When an agent is resolved from config and its entry has a `role` field, that value is used as the role default. `--role` still overrides it. If neither config nor `--role` provides a role, the error message is updated to indicate the agent config can supply one.

### 5. `home` mount: bind-mount over the agent container's home

The `home` value (after `~` expansion) is added as a Docker volume entry in `generateComposeYml`:

```yaml
- "<expanded-home>:/home/mason/"
```

This overlays the host directory on top of the container's home, making per-project agent configs (e.g. OpenClaw's `.claude/` settings) available inside the container. The CLI `--home` flag overrides this per-invocation. `~` is expanded to `os.homedir()` at runtime.

**Risk:** if the host path does not exist, Docker will create an empty directory, silently ignoring the intended config. Mitigation: warn at startup if `home` is set but the path does not exist on the host.

### 6. `mode` default with `--terminal` override

Config `mode` maps directly to the existing `--acp` and `--bash` flag logic:

| config `mode` | equivalent flag |
|---|---|
| `terminal` (default) | _(no flag)_ |
| `acp` | `--acp` |
| `bash` | `--bash` |

`--acp`, `--bash`, and new `--terminal` flags always override the config `mode`. `--acp` and `--bash` remain mutually exclusive. `--terminal` is a no-op when mode is already `terminal` but allows explicit override of a config-declared `acp` or `bash` mode.

### 7. Config auto-init: template written on first agent-name invocation

When `mason <agent-name>` or `mason run --agent <name>` is invoked and `.mason/config.json` does not exist, the CLI writes the default template before proceeding:

```json
{
  "agents": {
    "claude": { "package": "@clawmasons/claude-code" },
    "pi-mono-agent": { "package": "@clawmasons/pi-mono-agent" },
    "mcp": { "package": "@clawmasons/mcp-agent" }
  }
}
```

Auto-init only triggers on agent-name invocations, not `mason run --role <name>` without `--agent`, to avoid creating unexpected files during role-only workflows.

## Risks / Trade-offs

- **`--agent-type` rename is breaking** → any scripts using `mason run --agent-type` will fail. Mitigation: document in release notes; the codebase has no external consumers today.
- **Sync config read at startup adds a file I/O call on every invocation** → negligible (~1ms). The alternative (skipping the read) means config-declared agent shorthands don't work until after parse.
- **`home` bind-mount can shadow container files** → intentional, but a misconfigured path silently becomes an empty mount. Mitigated by the startup warning.
- **`role` from config makes `--role` optional** → the run command currently enforces `--role` as required. Making it conditionally optional requires checking config before Commander validation fires, which adds coupling. Mitigation: validate after config defaults are merged, exiting with a clear error if role is still unset.

## Migration Plan

1. Rename `--agent-type` → `--agent` in `registerRunCommand` and `createRunAction`
2. Extend `MasonConfig` / `AgentEntryConfig` in `discovery.ts`; add `loadConfigAgentEntry` and `readConfigAgentNames` helpers
3. Update `installAgentTypeShorthand` to accept a pre-read set of config agent names
4. Update `runAgent` / `runAgentInteractiveMode` / `runAgentAcpMode` to consume `home`, `mode`, `role` defaults from config entry
5. Update `generateComposeYml` to accept an optional `homeOverride` volume
6. Add config template auto-init logic (sync write, guarded by `!fs.existsSync`)
7. Update tests; add tests for new flags and config properties

Rollback: revert the rename and config schema extension — no data migration required.

## Open Questions

- Should `home` support multiple paths (e.g. an array) for composing configs from multiple sources, or keep it a single path for now? → single path for now, can extend later.
- Should auto-init emit a visible notice (`Created .mason/config.json`) or be silent? → emit a notice so users are aware.
