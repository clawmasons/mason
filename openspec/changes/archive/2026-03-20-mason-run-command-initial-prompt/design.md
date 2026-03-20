## Context

Both `claude` and `pi` support positional args as an initial user message at launch (`claude "do this"`, `pi "do this"`). Mason has no mechanism to thread such a prompt from the CLI through to `agent-launch.json`. The `configure` command currently launches with an empty session, forcing the user to manually type the starting task.

Current call chain for prompt-related data:
```
CLI → runAgent(..., acpOptions) → runAgentInteractiveMode → materializeWorkspace(agent, ..., options: MaterializeOptions)
      → generateAgentLaunchJson(agentPkg, creds, acpMode, instructions?, agentArgs?)
                                                                 ↑ only system prompt instructions today
```

`MaterializeOptions` currently carries `agentArgs` and `agentConfigCredentials` but not an `initialPrompt`. The `generateAgentLaunchJson` function writes `agent-launch.json` which `agent-entry` reads to spawn the agent process.

## Goals / Non-Goals

**Goals:**
- Thread an `initialPrompt` string from the CLI down to `agent-launch.json` as a final bare positional arg
- Handle positional arg disambiguation in the run command (agent vs. prompt)
- Make `mason configure` launch with `"create and implement role plan"` by default
- Work for both `claude` and `pi` agents (both accept positional args as first message)

**Non-Goals:**
- No new agent protocol or file-based prompt delivery (use existing positional arg mechanism)
- No changes to ACP mode behavior
- No multi-prompt or streaming input support
- No changes to `--append-system-prompt` / role instructions flow

## Decisions

### Decision 1: Two positional arguments on the `run` command

**Chosen:** Add `[prompt]` as a second optional positional alongside the existing `[agent]` positional. Additionally, when `--agent` is provided as a flag AND a positional arg is present, treat the positional as the prompt (not the agent).

```
mason run claude "do this"         → agent=claude (pos), prompt="do this" (pos2)
mason run --agent claude "do this" → agent=claude (flag), prompt="do this" (pos1 re-interpreted)
```

**Why not `--prompt` flag:** The user explicitly requested positional-style invocation matching `claude <prompt>` / `pi <prompt>`. A flag would be inconsistent with how the underlying agents work.

**Why not variadic args:** Multiple bare strings are hard to distinguish from mis-typed commands. A single quoted string is cleaner and matches how users invoke claude/pi directly.

**Disambiguation rule** in `createRunAction`:
- If `options.agent` is set AND `positionalAgent` is also set → `positionalAgent` is the prompt, `options.agent` is the agent
- Otherwise: `positionalAgent` is the agent (existing behavior), `positionalPrompt` (second positional) is the prompt

### Decision 2: `createRunAction` accepts an `overridePrompt` alongside `overrideRole`

Extend `createRunAction(overrideRole?, overridePrompt?)`. The `configure` command passes `"create and implement role plan"` as `overridePrompt`. User-supplied positional takes precedence over the override (so `mason configure "custom task"` works).

**Why not hardcode inside configure's action:** Keeps the pattern symmetric — `configure` is just `run` with two hardcoded defaults (role and prompt).

### Decision 3: `initialPrompt` propagated via `MaterializeOptions`

Add `initialPrompt?: string` to `MaterializeOptions` in `packages/agent-sdk/src/types.ts`. This keeps the materialization interface self-contained and avoids adding yet another parameter to `runAgent`.

The field flows:
```
createRunAction → runAgent(options: { ..., initialPrompt })
  → runAgentInteractiveMode → materializeWorkspace(..., { ..., initialPrompt })
  → generateAgentLaunchJson(..., initialPrompt)
```

**Why not a new `runAgent` top-level param:** `runAgent` already takes a flat options object. Adding `initialPrompt` to that object is a smaller diff than adding a new positional param and updating all three mode functions.

### Decision 4: `generateAgentLaunchJson` appends `initialPrompt` as final positional

Add `initialPrompt?: string` as the sixth parameter. When non-empty and not ACP mode, append as a bare string at the end of `args`.

Final arg ordering: `[...baseArgs, "--append-system-prompt", instructions?, ...agentArgs?, "initialPrompt?"]`

**Why last:** Both `claude` and `pi` treat the first non-flag positional arg as the initial prompt, regardless of position relative to flags. Placing it last avoids any ambiguity with flag parsing.

**Why not a new `agentLaunchConfig` field:** The prompt is a runtime argument, not configuration metadata. It belongs in `args`, not as a new JSON key in `agent-launch.json`.

### Decision 5: `initialPrompt` not forwarded in ACP mode

ACP sessions are driven by the editor — no initial prompt makes sense in that context. Guard in `generateAgentLaunchJson` mirrors the existing `acpMode` guard for `--append-system-prompt`.

## Risks / Trade-offs

- **Positional disambiguation edge case**: `mason run "do something"` with no `--agent` will interpret `"do something"` as an agent name and fail. Users must always pair a positional prompt with either `--agent` flag or a valid positional agent name. → Mitigation: error message already tells the user what agents are available; no additional confusion.

- **configure override behavior**: The hardcoded `"create and implement role plan"` is always sent unless the user provides their own positional. If the role's own instructions already contain a task description, this could be redundant. → Accepted: it's the intended UX; the role instructions set context, the initial prompt triggers action.

- **pi prompt vs. system prompt ordering**: Pi reads `.pi/APPEND_SYSTEM.md` for system prompt and positional arg for first message. These are orthogonal. The materializer writes both independently — no conflict.

## Migration Plan

All changes are additive. No existing `mason run` or `mason configure` invocations break:
- Existing `mason run claude --role x` → no second positional, `initialPrompt = undefined`, behavior unchanged
- Existing `mason configure` → now also sends initial prompt to agent; the role's configure-project instructions remain the system context

No rollback needed — feature is purely opt-in except for `mason configure` which gains the hardcoded prompt.

## Open Questions

None. Both `claude` and `pi` positional arg behavior is confirmed from source inspection.
