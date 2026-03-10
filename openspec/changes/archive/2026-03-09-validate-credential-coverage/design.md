## Context

The `validateAgent()` function in `packages/cli/src/validator/validate.ts` already performs four categories of checks: requirement coverage, tool existence, skill availability, and app launch config. It also checks LLM config (with warnings). The credential coverage check follows the same pattern -- iterate over the agent's roles, collect app credentials, compare against agent credentials.

Credential coverage is a **warning** not an error. The agent can still run without declaring all app credentials (the credential service will deny individual requests at runtime). But it signals likely misconfiguration that the author should fix.

## Goals / Non-Goals

**Goals:**
- Add `checkCredentialCoverage()` function that emits warnings for each app credential not declared by the agent
- Warning message format: `Agent "<agentName>" does not declare credential "<key>" required by app "<appName>"`
- Warnings do not affect the `valid` flag
- Handle edge cases: empty credentials on both sides, duplicate credentials across apps

**Non-Goals:**
- Checking credential resolution (whether the credential value actually exists) -- that's the credential service's job at runtime
- Checking credentials against roles -- credentials are declared at app and agent level only
- Making missing credentials an error

## Decisions

### Decision 1: Warnings not errors

**Choice**: Credential coverage mismatches emit `ValidationWarning` with category `"credential-coverage"`, not `ValidationError`.

**Rationale**: The PRD (REQ-023) says "Emit a warning for any app credential not declared by the agent -- this isn't an error (the agent can still run) but signals a likely misconfiguration." The existing `ValidationWarning` infrastructure already supports this pattern (used by llm-config).

### Decision 2: Check all apps across all roles

**Choice**: Collect the union of all app credentials across all roles the agent uses, then check the agent's credentials against that union.

**Rationale**: An agent declares a flat list of credentials that covers all its use cases. Each app in each role contributes to the required set. If an app appears in multiple roles, its credentials are only counted once (deduplication via the credential key).

### Decision 3: Report per-app, not per-union

**Choice**: Each warning names the specific app that requires the credential, not just that "some app" needs it.

**Rationale**: The user story says "Agent 'researcher' does not declare credential 'SERP_API_KEY' required by app 'web-search'". Knowing which app needs the credential helps the author fix the issue. If the same credential is required by multiple apps, we emit one warning per app-credential pair.

### Decision 4: Use existing `collectAllApps()` function

**Choice**: Reuse the existing `collectAllApps()` helper that already traverses roles and tasks to collect unique apps.

**Rationale**: This function already exists and handles deduplication. However, for credential coverage warnings we want to report the specific app name, so we'll iterate through roles directly rather than using the deduplicated list, to emit specific warnings per app.

## Risks / Trade-offs

- [Trade-off] Emitting one warning per app-credential pair could be noisy if many apps share the same credential. Accepted because specificity is more useful than aggregation for fixing issues.
- [Risk] None -- this is a pure additive change to validation logic with no runtime impact.
