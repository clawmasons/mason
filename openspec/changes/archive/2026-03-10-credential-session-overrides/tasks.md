## 1. Schema Update

- [x] 1.1 Add `"session"` to the `source` enum in `credentialSuccessSchema` in `schemas.ts`

## 2. Resolver Changes

- [x] 2.1 Add `"session"` to the `ResolveSuccess.source` type union in `resolver.ts`
- [x] 2.2 Add `sessionOverrides` private field (initialized to `{}`) in `CredentialResolver`
- [x] 2.3 Add `setSessionOverrides(overrides: Record<string, string>): void` method
- [x] 2.4 Add `clearSessionOverrides(): void` method
- [x] 2.5 Update `resolve()` to check session overrides first (before env), returning `source: "session"` on hit

## 3. Service Changes

- [x] 3.1 Add `setSessionOverrides(overrides: Record<string, string>): void` method to `CredentialService` (delegates to resolver)
- [x] 3.2 Add `clearSessionOverrides(): void` method to `CredentialService` (delegates to resolver)

## 4. CLI Changes

- [x] 4.1 Read `CREDENTIAL_SESSION_OVERRIDES` env var, parse as JSON, call `service.setSessionOverrides()` before connecting

## 5. Tests

- [x] 5.1 Create `packages/credential-service/tests/session-overrides.test.ts`
- [x] 5.2 Test: session override returns override value instead of env var
- [x] 5.3 Test: session override returns `source: "session"`
- [x] 5.4 Test: non-overridden credentials still resolve from env/keychain/dotenv
- [x] 5.5 Test: clearSessionOverrides removes all overrides, falls back to normal resolution
- [x] 5.6 Test: empty overrides behave identically to current behavior
- [x] 5.7 Test: session override takes priority over env, keychain, and dotenv
- [x] 5.8 Test: service-level setSessionOverrides/clearSessionOverrides delegates correctly

## 6. Verification

- [x] 6.1 `npx tsc --noEmit` passes
- [x] 6.2 `npx eslint src/ tests/` passes (in credential-service package)
- [x] 6.3 `npx vitest run` passes (all existing + new tests)
