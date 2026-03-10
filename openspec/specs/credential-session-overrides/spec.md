# Credential Session Overrides

**Status:** Implemented
**PRD:** [acp-proxy](../../prds/acp-proxy/PRD.md)
**PRD Refs:** REQ-007 (Credential Flow Preservation)
**Branch:** `credential-session-overrides`

---

## 1. Problem

The ACP proxy extracts credentials from the client's `mcpServers` env fields (e.g., `GITHUB_TOKEN=ghp_abc123`). These client-provided credentials need to take precedence over host-resolved credentials for the duration of the session. The credential-service had no mechanism for session-scoped overrides -- it always resolved from env, keychain, or dotenv.

## 2. Solution

Add session-scoped credential overrides as the highest-priority resolution source in the `CredentialResolver`. The resolution chain becomes: session overrides -> env -> keychain -> dotenv. Session overrides are set once at startup via `setSessionOverrides()` and apply until cleared.

## 3. Design

### 3.1 CredentialResolver Changes (`resolver.ts`)

The resolver gains a `sessionOverrides` field and two public methods:

```typescript
setSessionOverrides(overrides: Record<string, string>): void
clearSessionOverrides(): void
```

The `resolve()` method checks session overrides first. If the key is found, it returns immediately with `source: "session"`. If not found, it falls through to the existing env -> keychain -> dotenv chain unchanged.

Session overrides are not included in `sourcesAttempted` when they miss, keeping the existing NOT_FOUND error messages unchanged.

### 3.2 Schema Changes (`schemas.ts`)

The `credentialSuccessSchema` source enum gains `"session"`:

```typescript
source: z.enum(["env", "keychain", "dotenv", "session"])
```

### 3.3 CredentialService Changes (`service.ts`)

Two delegating methods added:

```typescript
setSessionOverrides(overrides: Record<string, string>): void
clearSessionOverrides(): void
```

Both delegate directly to the underlying `CredentialResolver`.

### 3.4 CLI Changes (`cli.ts`)

Reads `CREDENTIAL_SESSION_OVERRIDES` environment variable at startup. If present, parses it as JSON `Record<string, string>` and calls `service.setSessionOverrides()`. Invalid JSON causes a fatal exit.

This env var is set by the ACP proxy's Docker session orchestrator (CHANGE 8) when generating the docker-compose.yml for the credential-service container.

## 4. Requirements

### Requirement: Session override takes highest priority

Session overrides SHALL be checked before all other credential sources (env, keychain, dotenv).

#### Scenario: Override beats env var
- **GIVEN** `process.env.API_KEY = "from-env"` and session override `{ API_KEY: "from-session" }`
- **WHEN** `resolve("API_KEY")` is called
- **THEN** returns `{ value: "from-session", source: "session" }`

#### Scenario: Non-overridden key falls through
- **GIVEN** session override `{ OTHER_KEY: "value" }` and `process.env.MY_KEY = "env-value"`
- **WHEN** `resolve("MY_KEY")` is called
- **THEN** returns `{ value: "env-value", source: "env" }`

### Requirement: clearSessionOverrides removes all overrides

#### Scenario: After clearing, resolution falls back to normal sources
- **GIVEN** session override `{ API_KEY: "session-value" }` and `process.env.API_KEY = "env-value"`
- **WHEN** `clearSessionOverrides()` is called, then `resolve("API_KEY")`
- **THEN** returns `{ value: "env-value", source: "env" }`

### Requirement: Empty overrides are transparent

#### Scenario: Empty overrides behave like no overrides
- **GIVEN** `setSessionOverrides({})` called
- **WHEN** `resolve("MY_KEY")` is called
- **THEN** resolution proceeds through env/keychain/dotenv as normal

### Requirement: Access validation still applies

#### Scenario: Override exists but key not declared
- **GIVEN** session override `{ SECRET: "value" }` and `declaredCredentials: ["OTHER"]`
- **WHEN** `handleRequest({ key: "SECRET", ... })` is called
- **THEN** returns `ACCESS_DENIED` (access validation runs before resolution)

### Requirement: CLI reads CREDENTIAL_SESSION_OVERRIDES

#### Scenario: Valid JSON overrides
- **GIVEN** `CREDENTIAL_SESSION_OVERRIDES='{"GITHUB_TOKEN":"ghp_abc"}'`
- **WHEN** the credential-service CLI starts
- **THEN** `service.setSessionOverrides({ GITHUB_TOKEN: "ghp_abc" })` is called

#### Scenario: Invalid JSON exits with error
- **GIVEN** `CREDENTIAL_SESSION_OVERRIDES='not-json'`
- **WHEN** the credential-service CLI starts
- **THEN** process exits with code 1 and error message

## 5. Files

| File | Action | Description |
|------|--------|-------------|
| `packages/credential-service/src/resolver.ts` | Modified | Added `sessionOverrides` field, `setSessionOverrides()`, `clearSessionOverrides()`, `"session"` source type, priority check in `resolve()` |
| `packages/credential-service/src/schemas.ts` | Modified | Added `"session"` to source enum |
| `packages/credential-service/src/service.ts` | Modified | Added delegating `setSessionOverrides()` and `clearSessionOverrides()` methods |
| `packages/credential-service/src/cli.ts` | Modified | Reads `CREDENTIAL_SESSION_OVERRIDES` env var and applies overrides at startup |
| `packages/credential-service/tests/session-overrides.test.ts` | New | 12 tests covering resolver and service session override behavior |
