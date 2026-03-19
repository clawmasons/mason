## Context

Standard `claude-code-agent` currently produces three single-file mounts:
1. `.mcp.json` — MCP server config placed at workspace root (`/home/node/workspace/.mcp.json`)
2. `AGENTS.md` — role documentation, also at workspace root
3. `.claude.json` — OOBE bypass + (after this change) MCP config at home root

When Docker stacks bind mounts, named volumes, and Docker Compose `configs` on overlapping paths, child mounts can land before parent mounts complete, producing masking/overlay failures. Each single-file mount on an overlapping path is another opportunity for this race.

The supervisor role already writes MCP config into `.claude.json` (home-dir merge), avoiding `.mcp.json` entirely. The pattern exists; we apply it consistently.

Additionally, the generated compose file currently uses `restart: "on-failure:3"` for the agent service, which restarts unconditionally on any failure. OCI runtime errors (mount race) are the only transient failures worth retrying; all others are configuration errors that should not be retried silently.

## Goals / Non-Goals

**Goals:**
- Eliminate `.mcp.json` single-file mount from claude-code-agent (standard and supervisor paths)
- Remove `AGENTS.md` generation from claude-code-agent materializer and `agent-sdk`
- Gate docker compose restart on OCI runtime error strings only
- Add 2s cooldown between restarts
- Surface single-file volume mounts to the user when an OCI restart triggers, with a recommendation to convert to directories

**Non-Goals:**
- Eliminating the `.claude.json` single-file mount (it already exists for OOBE bypass and is the target for MCP config)
- Changing how `.env` masking works (users may still need to mask `.env` as a single file)
- Changing restart behavior for the proxy (`mcp-proxy`) service
- Adding directory-based alternatives for `.env` automatically — only surfacing a recommendation

## Decisions

### Decision 1: Merge MCP config into `.claude.json` (home dir), remove `.mcp.json`

**Chosen approach**: In `materializeWorkspace`, call the same merge logic already in `materializeSupervisor` — write MCP server config into the `mcpServers` key of `.claude.json`, leave `.claude/settings.json` for permissions only.

**Why over alternatives**:
- Alternative A: Move `.mcp.json` inside the `.claude/` directory (e.g., `.claude/mcp.json`) — Claude Code does not read MCP config from `.claude/mcp.json`; it reads from `.mcp.json` at project root or `~/.claude.json`.
- Alternative B: Keep `.mcp.json` and add a directory wrapper — more indirection with no gain; the supervisor approach already works and is tested.

**Result**: `materializeWorkspace` no longer emits `.mcp.json`. MCP config lives in `.claude.json` alongside the existing OOBE bypass fields. The `.claude.json` single-file mount already exists and serves two purposes; it is not eliminated by this change, only consolidated.

### Decision 2: Remove `AGENTS.md` generation entirely

**Chosen approach**: Delete `result.set("AGENTS.md", ...)` from both `materializeWorkspace` and `materializeSupervisor` in `claude-code-agent/src/materializer.ts`. Remove (or mark removed) `generateAgentsMd` from `agent-sdk/src/helpers.ts` and its export from `agent-sdk/src/index.ts`. Check `pi-coding-agent` and `mcp-agent` for calls.

**Why**: `AGENTS.md` at workspace root is a single-file mount that contributes to mount ordering risk. Runtime agent behaviour is controlled by `agent-launch.json` and role configurations; `AGENTS.md` is documentation only and is not read by any runtime path.

**Impact on SDK**: Remove the `generateAgentsMd` export. Add to the `REMOVED Requirements` section of the `agent-sdk` spec.

### Decision 3: Replace compose `restart: "on-failure:3"` with CLI-level OCI restart loop

**Chosen approach**: Set `restart: "no"` in the generated compose YAML for the agent service (matching the proxy service). Add a restart loop in the CLI run command (`run-agent.ts`) that:
1. Captures stderr from `docker compose run --rm <runtime>`
2. If exit code is non-zero and output contains the substring `"OCI runtime"`: log warning, display all single-file volume mounts, print recommendation, wait 2s, re-run (up to a max of 3 attempts)
3. Any other non-zero exit: propagate immediately without restart

**Why over compose restart policy**:
- Compose `on-failure:3` restarts on ANY non-zero exit. OCI runtime errors are the only transient ones; credential errors, permission errors, config bugs should not be silently retried.
- Compose restart runs inside the daemon with no ability to surface user-facing guidance.
- CLI-level restart allows inspecting output content and printing actionable recommendations.

**Single-file mount detection**: The CLI already builds the volume list before running compose. Before the run loop, collect all volume entries that are single-file mounts (entries where the host path resolves to a file, not a directory, via `fs.statSync`). Display these on OCI restart.

## Risks / Trade-offs

- **`.claude.json` still a single-file mount** → Not a concern: it mounts on the home directory path, which has no overlapping config mounts. The mount ordering race only affects paths where bind mounts, named volumes, and configs stack — the home root is not one of those paths.
- **Removing `generateAgentsMd` from SDK is a breaking change** → Any external agent packages importing this function will break at compile time. This is acceptable; the function is internal to chapter's agent packages and there are no external consumers known.
- **OCI restart max=3 heuristic** → If a host has persistent mount ordering issues, 3 retries may not be enough. The recommendation to move files to directories is the lasting fix; retries are a temporary workaround.
- **`restart: "no"` removes non-OCI retry path** → Some users may rely on compose-level restart for non-OCI failures. This is the desired behaviour change; silent retries on misconfiguration obscure root causes.

## Migration Plan

1. Change `materializeWorkspace` in `claude-code-agent/src/materializer.ts`: remove `.mcp.json` emit, add MCP config merge into `.claude.json`.
2. Remove `AGENTS.md` emit from both `materializeWorkspace` and `materializeSupervisor`.
3. Remove `generateAgentsMd` from `agent-sdk/src/helpers.ts` and its re-export; update spec REMOVED section.
4. Update `docker-generator.ts`: change agent service `restart` from `"on-failure:3"` to `"no"`.
5. Add OCI-gated restart loop in `run-agent.ts`: capture stderr, check for `"OCI runtime"`, pause 2s, print single-file mount list and recommendation, retry (max 3).
6. Update `claude-code-materializer` spec delta: remove `.mcp.json` requirement, update `generateComposeService` restart, remove `AGENTS.md` requirement.
7. Update `agent-sdk` spec delta: add `generateAgentsMd` to REMOVED.
8. Update tests: `claude-code-agent/tests/materializer.test.ts`, `cli/tests/materializer/claude-code.test.ts`, `cli/tests/cli/run-agent.test.ts`.

Rollback: revert to previous compose file and materializer. No data migration needed.

## Open Questions

- Should `generateAgentsMd` be deprecated (kept but warn) or hard-removed? → Recommend hard-remove since it has no external consumers and keeping it invites accidental use.
- Should the OCI restart max count (3) be configurable via CLI flag? → No for now; keep it simple. Add `--max-restarts` only if users request it.
