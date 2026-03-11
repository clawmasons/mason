## Context

The ACP session currently runs three Docker containers: proxy, credential-service, and agent. The credential-service container is fundamentally broken because `CredentialResolver` resolves credentials from host-only sources (process.env, macOS Keychain, .env files) — none of which are available inside the container. The existing `CredentialService` and `CredentialWSClient` classes already support in-process SDK usage (proven by the integration tests in `credential-flow.test.ts`).

The ACP host process (`runAcpAgent()` in `run-acp-agent.ts`) already runs on the host machine and has access to all credential sources. It already calls `collectEnvCredentials()` to gather matching env vars.

## Goals / Non-Goals

**Goals:**
- Run credential service in-process within the ACP host process so it has access to host credentials
- Remove credential-service Docker container from compose stack
- Add e2e test coverage for credential resolution via MCP tool call
- Keep the proxy's credential relay working (proxy still relays requests from agent to credential service)

**Non-Goals:**
- Changing the credential resolution logic itself (env, keychain, dotenv priority)
- Modifying the proxy's credential relay WebSocket protocol
- Supporting multiple credential service instances

## Decisions

### Decision 1: Run CredentialService + CredentialWSClient in the ACP host process

**Choice**: Start `CredentialService` and `CredentialWSClient` in-process within `runAcpAgent()`, after infrastructure (proxy) is up.

**Rationale**: The integration tests (`credential-flow.test.ts`) already prove this works — they run the credential service in SDK mode with an in-memory DB. The WSClient connects to the proxy's WebSocket endpoint from the host, which has network access to the proxy's exposed port.

**Alternative considered**: Mount host credentials into the Docker container via volumes/env. Rejected because Keychain access requires the host security binary, and volume-mounting .env files creates security concerns.

### Decision 2: Remove credential-service from Docker Compose entirely

**Choice**: Remove the credential-service service definition from `generateAcpComposeYml()`. The agent's `depends_on` changes from `credential-service` to `proxy-<role>`.

**Rationale**: The credential service is no longer a Docker service — it's an in-process SDK. Keeping an empty container would be confusing.

### Decision 3: Connect WSClient to proxy via host network

**Choice**: The `CredentialWSClient` connects to the proxy at `ws://localhost:<proxy-port>` (the proxy port is already exposed to the host for the bridge). The proxy's WebSocket credential relay endpoint accepts the connection.

**Rationale**: The proxy already exposes its port to the host (for the ACP bridge). The WSClient simply connects to it the same way the bridge does, but on the WebSocket credential endpoint.

### Decision 4: Add TEST_LLM_TOKEN credential to e2e test

**Choice**: Add `TEST_LLM_TOKEN` to the mcp agent's declared credentials in the initiate template. Set it in the e2e test process env. Add a test that calls `credential_request` tool and verifies the value is returned.

**Rationale**: This creates a concrete e2e test proving credentials flow from host env → credential service → proxy → agent → back.

## Risks / Trade-offs

- **[Risk] Credential service lifecycle tied to host process** → Acceptable: the credential service should run exactly as long as the ACP session runs, which is the host process lifetime.
- **[Risk] Proxy port must be accessible from host** → Already the case for the ACP bridge. No new port exposure needed.
- **[Risk] In-memory audit DB for SDK mode** → Same as integration tests. Persistent audit logging can be added later if needed.
