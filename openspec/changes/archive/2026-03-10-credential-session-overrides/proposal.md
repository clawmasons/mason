## Why

The ACP proxy extracts credentials from the client's `mcpServers` env fields (e.g., `GITHUB_TOKEN=ghp_abc123`). These client-provided credentials need to override host-resolved credentials for the duration of the session. Currently, the credential-service has no mechanism for session-scoped overrides -- it always resolves from env, keychain, or dotenv. Without this, the ACP proxy cannot honor the client's credential preferences while maintaining the governed credential pipeline.

## What Changes

- Modify `packages/credential-service/src/resolver.ts` -- add a `sessionOverrides` map as the highest-priority resolution source, checked before env/keychain/dotenv. Add `setSessionOverrides()` and `clearSessionOverrides()` methods.
- Modify `packages/credential-service/src/schemas.ts` -- add `"session"` to the `source` enum in credential success responses.
- Modify `packages/credential-service/src/service.ts` -- expose `setSessionOverrides()` and `clearSessionOverrides()` methods that delegate to the resolver.
- Modify `packages/credential-service/src/cli.ts` -- read `CREDENTIAL_SESSION_OVERRIDES` env var (JSON-encoded `Record<string, string>`) at startup and apply to the service.
- New test: `packages/credential-service/tests/session-overrides.test.ts` -- tests for session override behavior.

## Capabilities

### New Capabilities
- `credential-session-overrides`: Session-scoped credential overrides that take highest priority during resolution, enabling ACP-extracted credentials to override host credentials.

### Modified Capabilities
- `credential-resolver`: Updated resolution priority chain to: session overrides -> env -> keychain -> dotenv.
- `credential-service-package`: Service exposes `setSessionOverrides()` / `clearSessionOverrides()` methods.

## Impact

- **Modified file:** `packages/credential-service/src/resolver.ts` -- adds session override source
- **Modified file:** `packages/credential-service/src/schemas.ts` -- adds `"session"` source enum value
- **Modified file:** `packages/credential-service/src/service.ts` -- exposes override methods
- **Modified file:** `packages/credential-service/src/cli.ts` -- reads session overrides from env
- **New test:** `packages/credential-service/tests/session-overrides.test.ts`
- **No breaking changes** -- existing resolution behavior is unchanged; session overrides default to empty
