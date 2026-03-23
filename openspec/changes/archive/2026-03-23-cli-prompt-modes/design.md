## Context

`mason run` accepts a positional `[prompt]` argument that flows through `createRunAction()` → `runAgent()` → `ensureDockerBuild()` → `generateRoleDockerBuildDir()` → materializer → `generateAgentLaunchJson()`, where it is appended as a bare positional arg in `agent-launch.json`. The `agent-entry` process inside Docker reads this JSON and spawns the agent with those exact args.

Currently broken: `ensureDockerBuild` (run-agent.ts:389-398) accepts `initialPrompt` in its deps but never forwards it to `generateRoleDockerBuildDir`, so the prompt never reaches the agent.

For non-interactive use, there is no way to run `mason run` in a scripting-friendly mode where only the agent's response appears on stdout. ACP mode redirects logs but serves a different purpose (editor integration). A new "print mode" is needed.

Key architectural constraint: the agent runs inside a Docker container. Stdout flows from agent → agent-entry (stdio: inherit) → Docker container → `docker compose run` → host CLI process. To capture JSON streaming output, the host must pipe stdout from `docker compose run` instead of inheriting it.

## Goals / Non-Goals

**Goals:**
- Fix bare positional prompt forwarding for both claude and pi agents
- Add `-p`/`--print` flag to `mason run` for non-interactive prompt execution
- Use agent-specific JSON streaming output to capture all agent activity to session logs
- Output only the final result text to the terminal in print mode
- Provide SDK interfaces so any agent can opt into print mode
- Unify log filenames across modes (`session.log`)

**Non-Goals:**
- Changing how ACP mode works (beyond the log rename)
- Adding `-p` to `mason configure` (inherently interactive)
- Modifying `agent-entry` or Docker container behavior (all changes on host side)
- Streaming partial results to terminal (only final result)

## Decisions

### 1. Print mode config lives on `AgentPackage`, not `RuntimeConfig`

The `printMode` field is added directly to `AgentPackage` as an optional object containing `jsonStreamArgs: string[]` and `parseJsonStreamFinalResult(line: string): string | null`.

**Why not on `RuntimeConfig`?** `RuntimeConfig` holds simple command/args data. Print mode includes a method (`parseJsonStreamFinalResult`) for result extraction logic that varies per agent. Keeping it as a top-level `AgentPackage` field follows the pattern of `acp`, `tasks`, `skills`, and `validate` — all of which are top-level optional capabilities.

### 2. JSON streaming + host-side parsing (not agent `-p` flag alone)

Rather than passing `-p` to the agent and inheriting stdout, we pass `-p` AND the agent's JSON stream args (`--output-format stream-json` for claude, `--mode json` for pi), then capture stdout on the host.

**Why?** This gives mason full visibility into agent activity (every stream event logged to `session.log`) while still extracting only the final result for terminal output. Using agent `-p` alone would give us the result but no visibility into what happened during execution.

**Alternative considered:** Agent `-p` with inherited stdout — simpler but no logging, no error detail, and inconsistent output formats across agents.

### 3. New `execComposeRunWithStreamCapture()` helper

A new function alongside `execComposeRunWithStderr()` that spawns `docker compose run` with `stdio: ["inherit", "pipe", "pipe"]` — stdin inherited (agent is non-interactive but inheriting is harmless), stdout piped for line-by-line reading, stderr piped for OCI detection.

**Why not modify `execComposeRunWithStderr`?** It's used by `runAgentWithOciRestart` for interactive mode and relies on stdout being inherited. Adding conditional stdout piping would complicate a function that works well as-is. A separate function keeps each mode's IO handling clean.

The callback `onLine: (line: string) => void` is called for each stdout line, allowing the caller to log and parse simultaneously.

### 4. `runAgentPrintMode()` as a separate function (not extending interactive mode)

Print mode gets its own `runAgentPrintMode()` function, following the pattern of `runAgentAcpMode()` and `runAgentInteractiveMode()`.

**Why?** The differences are substantial:
- Log redirection (ACP-style early buffer + file logger)
- Stdout capture instead of inherit
- Final result extraction and output
- Exit code propagation
- No OCI restart loop (non-interactive, just fail)

Sharing code with interactive mode would require extensive conditional branching. A separate function with the same lifecycle steps is clearer.

### 5. `-p` is a string option, mutually exclusive with other modes

`-p <prompt>` / `--print <prompt>` is a Commander.js string option. When present, its value becomes the `initialPrompt` (overriding any positional prompt). It is mutually exclusive with `--acp`, `--bash`, `--dev-container`, `--proxy-only`.

**Why string, not boolean?** Matches the ergonomic pattern of the underlying agent CLIs where `-p "message"` is standard. One flag carries both the intent (print mode) and the data (the prompt).

### 6. Log file unified to `session.log`

Both ACP and print modes write to `.mason/logs/session.log` instead of mode-specific filenames. The `createFileLogger` function in `logger.ts` is updated to use `session.log` — a simple rename, no parameterization.

**Why?** One canonical log location simplifies debugging. The log is append-mode with timestamps, so interleaved usage is safe. There's no scenario where ACP and print mode run simultaneously for the same project.

## Risks / Trade-offs

**Docker build caching may serve stale `agent-launch.json`** → `ensureDockerBuild` only regenerates when the Dockerfile is missing or packages hash changes. Changing just the prompt between runs won't trigger a rebuild. This is a pre-existing issue (not introduced by this change). Mitigation: users can pass `--build` to force regeneration. A proper fix (content-hash-based invalidation) is out of scope.

**Agent JSON stream format may change** → `parseJsonStreamFinalResult` is per-agent and may break if upstream agents change their streaming JSON schema. Mitigation: try/catch around every parse call; failures are logged and treated as "no result yet." The agent package maintainer owns keeping the parser current.

**No partial/streaming output** → Print mode waits for the final result and outputs it all at once. Long-running prompts show nothing on terminal until completion. Mitigation: all activity is logged to `session.log` for debugging. Streaming partial output is a future enhancement.

**`-p` flag letter collision risk** → `-p` is a common short flag. If a future mason feature needs `-p` for something else, we'd have a conflict. Mitigation: `-p` for "print" is well-established (claude CLI uses it), and `--print` is always available as the long form.
