# Credential Resolver

**Status:** Implemented
**PRD:** [credential-service](../../prds/credential-service/PRD.md)
**PRD Refs:** REQ-002, REQ-003, REQ-004
**Branch:** `credential-resolver`

---

## 1. Problem

The credential service needs a resolution engine that resolves credential values from multiple sources in priority order. No such module exists yet — there is no way to look up a credential key and get back its value along with which source it came from.

## 2. Solution

Build a standalone, testable `CredentialResolver` class at `packages/credential-service/src/resolver.ts` that resolves credential keys from three sources in priority order:

1. **Environment variables** — `process.env[KEY]`
2. **macOS Keychain** — `security find-generic-password -s <service> -a <key> -w`
3. **`.env` file** — parsed using the `loadEnvFile` utility (copied from `@clawmasons/proxy` to avoid cross-package dependency)

Each resolution returns both the value and the source. If no source has the credential, a structured error is returned listing all sources attempted. The Keychain source is silently skipped on non-macOS systems.

## 3. Design

### 3.1 Package Scaffold

New package `packages/credential-service/` with:
- `package.json` — `@clawmasons/credential-service`, depends on `zod`
- `tsconfig.json` — mirrors other packages (composite, Node16)
- `tsconfig.build.json` — extends tsconfig.json

### 3.2 `CredentialResolver` Class

```typescript
// packages/credential-service/src/resolver.ts

type ResolveSuccess = { value: string; source: "env" | "keychain" | "dotenv" };
type ResolveError = { error: string; code: "NOT_FOUND"; sourcesAttempted: string[] };
type ResolveResult = ResolveSuccess | ResolveError;

interface CredentialResolverConfig {
  envFilePath?: string;
  keychainService?: string;
}

class CredentialResolver {
  constructor(config: CredentialResolverConfig = {})
  resolve(key: string): Promise<ResolveResult>
  // Private:
  private resolveFromEnv(key: string): string | undefined
  private resolveFromKeychain(key: string): Promise<string | undefined>
  private resolveFromDotenv(key: string): string | undefined
}
```

### 3.3 Resolution Logic

- `resolveFromEnv`: Direct `process.env[key]` lookup
- `resolveFromKeychain`: Spawns `security find-generic-password -s <service> -a <key> -w`. Skipped entirely when `process.platform !== "darwin"`. Uses `child_process.execFile` with a timeout. Returns `undefined` on any error (not found, command failure, etc.)
- `resolveFromDotenv`: Uses `loadEnvFile` (copied locally) to parse the `.env` file, caches the parsed result, returns the value for the key

### 3.4 `loadEnvFile` Utility

Copied from `packages/proxy/src/credentials.ts` into `packages/credential-service/src/env-file.ts` to avoid cross-package dependency. Only `loadEnvFile` is copied (not `resolveEnvVars`).

## 4. Test Plan

- Resolve from env returns `{ value, source: "env" }`
- Resolve from dotenv (not in env) returns `{ value, source: "dotenv" }`
- Env takes priority over dotenv
- Missing key returns error with `sourcesAttempted`
- Keychain is skipped on non-macOS (mocked platform check)
- Keychain resolution works when platform is darwin (mocked execFile)
- Keychain errors are silently swallowed
- `npx tsc --noEmit` compiles
- `npx vitest run` passes

## 5. Files

| File | Action | Description |
|------|--------|-------------|
| `packages/credential-service/package.json` | New | Package scaffold |
| `packages/credential-service/tsconfig.json` | New | TypeScript config |
| `packages/credential-service/tsconfig.build.json` | New | Build config |
| `packages/credential-service/src/resolver.ts` | New | CredentialResolver class |
| `packages/credential-service/src/env-file.ts` | New | loadEnvFile utility (copied from proxy) |
| `packages/credential-service/src/index.ts` | New | Barrel export |
| `packages/credential-service/tests/resolver.test.ts` | New | Unit tests |
