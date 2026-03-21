## Design: CLI Integration — Start Host Proxy Instead of Credential Service

### Overview

Replace the CLI's credential service startup with `HostProxy` startup across three code paths:
1. `runAgent()` — interactive mode
2. `runDevContainer()` — dev-container mode
3. `runAcpAgent()` — ACP mode

All three currently call `defaultStartCredentialService()` which creates a `CredentialService` + `CredentialWSClient` connecting to `/ws/credentials`. The replacement `defaultStartHostProxy()` creates a `HostProxy` connecting to `/ws/relay`.

### Detailed Design

#### 1. run-agent.ts Changes

**Import change:**
```typescript
// Before
import { CredentialService, CredentialWSClient } from "@clawmasons/proxy";
// After
import { HostProxy } from "@clawmasons/proxy";
```

**Dependency injection type change:**
```typescript
// Before
startCredentialServiceFn?: (opts: {
  proxyPort: number;
  credentialProxyToken: string;
  envCredentials: Record<string, string>;
}) => Promise<{ disconnect: () => void; close: () => void }>;

// After
startHostProxyFn?: (opts: {
  proxyPort: number;
  relayToken: string;
  envCredentials: Record<string, string>;
}) => Promise<{ stop: () => Promise<void> }>;
```

**defaultStartHostProxy implementation:**
```typescript
async function defaultStartHostProxy(opts: {
  proxyPort: number;
  relayToken: string;
  envCredentials: Record<string, string>;
}): Promise<{ stop: () => Promise<void> }> {
  const hostProxy = new HostProxy({
    relayUrl: `ws://localhost:${opts.proxyPort}/ws/relay`,
    token: opts.relayToken,
    keychainService: "mason",
  });

  // Set session overrides for env credentials
  // HostProxy's internal CredentialService handles this
  // ENV vars are available in process.env, CredentialResolver picks them up

  await hostProxy.start();
  return { stop: () => hostProxy.stop() };
}
```

**Call site changes in runAgent():**
- `startCredService` -> `startHostProxy`
- `credServiceHandle.disconnect()` and `credServiceHandle.close()` -> `hostProxyHandle.stop()`
- Log messages: "credential service" -> "host proxy"

**Call site changes in runDevContainer():**
- Same pattern as above

**Call site changes in runAcpAgent():**
- Replace `credentialWsClient` and `credentialService` variables with single `hostProxyHandle`
- Shutdown handler calls `hostProxyHandle.stop()` instead of separate disconnect/close

#### 2. session.ts (ACP) Changes

**Token naming in types:**
- `InfrastructureInfo.credentialProxyToken` -> `InfrastructureInfo.relayToken`

**Compose generation:**
- `CREDENTIAL_PROXY_TOKEN=${credentialProxyToken}` -> `RELAY_TOKEN=${relayToken}`

**Comment updates:**
- "credential service runs in-process" -> "host proxy runs in-process"
- "credential-service container" language removed

#### 3. docker-generator.ts Changes

**Type renames in SessionComposeOptions:**
- `credentialProxyToken` -> `relayToken`

**Type renames in SessionResult:**
- `credentialProxyToken` -> `relayToken`

**Compose template:**
- `CREDENTIAL_PROXY_TOKEN=${credentialProxyToken}` -> `RELAY_TOKEN=${relayToken}`

#### 4. proxy.ts — No Changes Needed

Already reads `RELAY_TOKEN` with `CREDENTIAL_PROXY_TOKEN` fallback:
```typescript
const relayToken = process.env.RELAY_TOKEN || process.env.CREDENTIAL_PROXY_TOKEN || undefined;
```

#### 5. proxy-entry.ts — No Changes Needed

Delegates to `startProxy()` which already handles both token names.

### Session Override Handling

The old `defaultStartCredentialService` called `svc.setSessionOverrides(envCredentials)` for credentials found in `process.env`. With `HostProxy`, env credentials are resolved naturally by the `CredentialResolver`'s env resolution strategy (priority order: session overrides > env > keychain > .env). Since the `HostProxy` runs on the host machine where `process.env` contains these values, the resolver will find them without explicit session overrides.

However, for ACP mode where credentials are extracted from ACP client `mcpServers` config, we need the `HostProxy` to support session overrides. We will add an `envCredentials` option to `HostProxyConfig` so the `HostProxy` can call `setSessionOverrides()` on its internal `CredentialService` after initialization.

### Test Coverage

**Updated tests in `packages/cli/tests/cli/run-agent.test.ts`:**
- `startCredentialServiceFn` -> `startHostProxyFn` in all mock deps
- Return `{ stop: async () => {} }` instead of `{ disconnect: () => {}, close: () => {} }`
- `CREDENTIAL_PROXY_TOKEN` -> `RELAY_TOKEN` in compose file assertions
- `credentialProxyToken` -> `relayToken` in type assertions

**Updated tests in `packages/cli/tests/acp/session.test.ts`:**
- `CREDENTIAL_PROXY_TOKEN` -> `RELAY_TOKEN` in compose YAML assertions
- `credentialProxyToken` -> `relayToken` in InfrastructureInfo assertions

**Updated tests in `packages/cli/tests/materializer/docker-generator.test.ts`:**
- `CREDENTIAL_PROXY_TOKEN` -> `RELAY_TOKEN` in compose YAML assertions
- `credentialProxyToken` -> `relayToken` in SessionResult assertions

**Unchanged tests:**
- `packages/cli/tests/integration/credential-flow.test.ts` — already uses `RelayClient` + `CredentialRelayHandler` directly, not the CLI functions
- `packages/cli/tests/generator/credential-service-dockerfile.test.ts` — tests the Dockerfile generator which is unrelated

### HostProxy Enhancement: envCredentials

Add `envCredentials?: Record<string, string>` to `HostProxyConfig`. In `start()`, after creating the `CredentialService`, call `setSessionOverrides(config.envCredentials)` if provided. This preserves the ACP mode behavior where credentials from the ACP client are injected as overrides.
