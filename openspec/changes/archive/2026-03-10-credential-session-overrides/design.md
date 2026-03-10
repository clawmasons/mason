## Context

The credential-service (PRD: `openspec/prds/acp-proxy/`) resolves credentials from three sources in priority order: env -> keychain -> dotenv. The ACP proxy (CHANGE 2, rewriter) extracts credentials from ACP client `mcpServers` env fields. These extracted credentials need to be injected as session-scoped overrides that take highest priority, so client-provided tokens flow through the governed pipeline without touching agent containers.

## Goals / Non-Goals

**Goals:**
- Add session-scoped credential overrides as the highest-priority resolution source
- Session overrides are set once per session and apply until cleared
- The `source` field in credential responses identifies session overrides as `"session"`
- The credential-service CLI reads session overrides from an environment variable at startup
- Existing resolution behavior is completely unchanged when no overrides are set

**Non-Goals:**
- Dynamic override updates mid-session (set once at startup)
- Per-key override expiration or TTL
- Override validation (trusted input from ACP proxy)
- Credential-relay or proxy-side changes (the relay already forwards requests transparently)

## Decisions

### D1: Session overrides live in the CredentialResolver

**Choice:** Add the session override map directly to `CredentialResolver` rather than adding a wrapper or interceptor.

**Rationale:** The resolver is the single resolution engine. Adding session overrides as the first source in its priority chain is the simplest approach -- one method call (`setSessionOverrides`), one check at the top of `resolve()`. No architectural changes needed.

### D2: Source enum value is `"session"`

**Choice:** Add `"session"` to the `source` enum alongside `"env"`, `"keychain"`, `"dotenv"`.

**Rationale:** Audit logs and credential responses need to distinguish session overrides from other sources. `"session"` is descriptive and consistent with the existing source naming pattern.

### D3: Overrides passed via JSON-encoded env var

**Choice:** The credential-service CLI reads `CREDENTIAL_SESSION_OVERRIDES` as a JSON-encoded `Record<string, string>`.

**Rationale:** The credential-service runs in a Docker container, configured via environment variables. JSON encoding is the simplest way to pass a key-value map through a single env var. The ACP proxy (CHANGE 8, session orchestrator) will set this env var in the docker-compose.yml.

### D4: No changes to the credential relay or proxy

**Choice:** The credential-relay (`packages/proxy/src/handlers/credential-relay.ts`) is not modified. Session overrides are injected at the credential-service level, not the proxy level.

**Rationale:** The relay is a transparent message forwarder. The credential-service is where resolution happens, so that's where overrides belong. The relay doesn't need to know about session overrides.

## Design

### CredentialResolver Changes (`resolver.ts`)

```typescript
// New private field
private sessionOverrides: Record<string, string> = {};

// New public methods
setSessionOverrides(overrides: Record<string, string>): void {
  this.sessionOverrides = { ...overrides };
}

clearSessionOverrides(): void {
  this.sessionOverrides = {};
}
```

Updated `resolve()` method -- insert session override check before env:

```typescript
async resolve(key: string): Promise<ResolveResult> {
  const sourcesAttempted: string[] = [];

  // 0. Session overrides (highest priority)
  const sessionValue = this.sessionOverrides[key];
  if (sessionValue !== undefined) {
    return { value: sessionValue, source: "session" };
  }

  // 1. Environment variables (existing)
  sourcesAttempted.push("env");
  // ... rest unchanged
}
```

Note: Session overrides are NOT included in `sourcesAttempted` when they miss, because they are a transparent overlay -- the user should not see "session" in the attempted sources list for non-overridden keys.

### Schema Changes (`schemas.ts`)

```typescript
// Update source enum in credentialSuccessSchema
source: z.enum(["env", "keychain", "dotenv", "session"]),
```

### ResolveSuccess Type Changes (`resolver.ts`)

```typescript
export interface ResolveSuccess {
  value: string;
  source: "env" | "keychain" | "dotenv" | "session";
}
```

### CredentialService Changes (`service.ts`)

```typescript
// New public methods
setSessionOverrides(overrides: Record<string, string>): void {
  this.resolver.setSessionOverrides(overrides);
}

clearSessionOverrides(): void {
  this.resolver.clearSessionOverrides();
}
```

### CLI Changes (`cli.ts`)

```typescript
// After creating service, before connecting:
const sessionOverridesJson = process.env.CREDENTIAL_SESSION_OVERRIDES;
if (sessionOverridesJson) {
  try {
    const overrides = JSON.parse(sessionOverridesJson) as Record<string, string>;
    service.setSessionOverrides(overrides);
    console.log(
      `[credential-service] Loaded ${Object.keys(overrides).length} session credential override(s).`
    );
  } catch (err) {
    console.error("[credential-service] Invalid CREDENTIAL_SESSION_OVERRIDES JSON:", err);
    process.exit(1);
  }
}
```

### File Locations

- `packages/credential-service/src/resolver.ts` -- session override methods + resolve priority update
- `packages/credential-service/src/schemas.ts` -- `"session"` source enum
- `packages/credential-service/src/service.ts` -- delegating override methods
- `packages/credential-service/src/cli.ts` -- env var parsing
- `packages/credential-service/tests/session-overrides.test.ts` -- comprehensive tests

### Dependencies

- No new external dependencies
- Types from existing `resolver.ts` are updated in-place
