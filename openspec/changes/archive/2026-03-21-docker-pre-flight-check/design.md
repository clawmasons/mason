## Context

PRD Section 5.3 requires Docker pre-flight checking before any role resolution, scanning, or materialization. Currently `checkDockerCompose()` is called in three separate mode functions (interactive at line 831, dev-container at line 1012, proxy-only at line 1223) and is missing entirely from ACP mode (line 1287). The `runAgent()` orchestrator function at line 733 dispatches to these modes — this is the natural place to hoist the check.

## Goals / Non-Goals

**Goals:**
- Single Docker check at the top of `runAgent()`, before mode dispatch
- All four modes (interactive, dev-container, ACP, proxy-only) covered by the same check
- Remove duplicate checks from individual mode functions
- Preserve testability via `RunAgentDeps.checkDockerComposeFn`
- Verify with unit tests that Docker check runs before role resolution

**Non-Goals:**
- Changing the error message format beyond adding installation links (the existing message structure is adequate, but the PRD requires install links)
- Adding network timeout logic (the existing `execSync` approach is sufficient)
- Modifying `checkDockerCompose()` logic in `docker-utils.ts` (only updating the error message text)

## Decisions

### D1: Hoist into `runAgent()`, not `createRunAction()`

**Choice:** Place the check at the top of `runAgent()` rather than in `createRunAction()`.

**Rationale:** `runAgent()` is the single dispatch point that all modes flow through. It already receives `deps` (including `checkDockerComposeFn`), making it the cleanest injection point. `createRunAction()` handles CLI parsing and argument resolution — mixing Docker checks there would blur responsibilities. The PRD says "before role resolution" and `runAgent()` runs before any role resolution in any mode.

### D2: Fail with process.exit(1) on Docker check failure

**Choice:** Catch the error from `checkDockerCompose()`, print it to stderr, and call `process.exit(1)`.

**Rationale:** This matches the existing error-handling pattern in the mode functions. The check throws an Error with a descriptive message; we catch it, log it, and exit. This is consistent with how other pre-flight failures (missing role, unknown agent) are handled in the same file.

### D3: Keep `checkDockerComposeFn` in RunAgentDeps

**Choice:** The `checkDockerComposeFn` field stays in `RunAgentDeps` and is consumed in `runAgent()`.

**Rationale:** Tests already inject a no-op via this field. Moving consumption to `runAgent()` changes where it's called, not whether it's injectable. All existing tests that set `checkDockerComposeFn: () => {}` continue to work — they just bypass the check earlier in the flow.

## Implementation

### Code Changes

**`docker-utils.ts` — Update error message to include install links (per PRD Section 5.3):**
```typescript
throw new Error(
  "Docker Compose v2 is required but not found.\n" +
  "  Install Docker Desktop: https://docs.docker.com/get-docker/\n" +
  "  Or install Docker Compose: https://docs.docker.com/compose/install/",
);
```

**`runAgent()` (line ~752, after `initRegistry()`):**
```typescript
// Pre-flight: check Docker Compose is available before any mode-specific work
const checkDocker = deps?.checkDockerComposeFn ?? checkDockerCompose;
try {
  checkDocker();
} catch (err) {
  console.error(`\n  ${(err as Error).message}\n`);
  process.exit(1);
  return;
}
```

**Remove from each mode function:**
- `runAgentInteractiveMode`: Remove lines 823 and 831 (`const checkDocker = ...` and `checkDocker()`)
- `runAgentDevContainerMode`: Remove lines 1003 and 1012
- `runProxyOnly`: Remove lines 1213 and 1223
- `runAgentAcpMode`: No check to remove (it never had one), but now covered by the hoisted check

### Test Coverage

1. **Existing test updated**: "exits 1 when docker compose is not available" — verify it still works with the hoisted check. The check now happens before role resolution, so the error output should contain the Docker message but not any role-resolution output.

2. **New test**: "docker check runs before role resolution" — provide a `checkDockerComposeFn` that throws and a `resolveRoleFn` that sets a flag. Assert the flag is never set (role resolution never called).

3. **New test**: "ACP mode fails fast when docker is unavailable" — call `runAgent()` with `acp: true` and a throwing `checkDockerComposeFn`. Assert `process.exit(1)` is called.

4. **Existing tests unaffected**: All tests that set `checkDockerComposeFn: () => {}` continue to bypass the check — they just bypass it in `runAgent()` instead of in the mode function.
