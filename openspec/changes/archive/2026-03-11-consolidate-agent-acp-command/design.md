## Context

The CLI has two top-level agent commands (`agent` and `acp`) with overlapping startup logic. The `agent` command runs a three-container Docker Compose setup (proxy, credential-service, agent), while `acp` runs a two-container setup (proxy, agent) with the credential service in-process. The in-process credential service is superior: faster startup, no extra container overhead, direct macOS Keychain access from the host.

This change consolidates both commands into a single `clawmasons agent` command. The `-acp` flag switches to ACP/editor mode. Both modes use in-process credential service.

## Goals / Non-Goals

**Goals:**
- Single `agent` command with `-acp` flag for editor integration mode
- Shared startup routine: role resolution, Docker Compose generation, credential service startup
- In-process credential service in both modes (remove credential-service Docker container entirely)
- Update Docker Compose generation to produce only proxy + agent services
- Update all docs to reflect two-container architecture and new CLI syntax
- Update all tests to cover the consolidated command

**Non-Goals:**
- Changing the ACP protocol or bridge behavior
- Changing the proxy or agent container behavior
- Changing the credential resolution priority order
- Backward compatibility shim for `clawmasons acp` (clean break)

## Decisions

### 1. Absorb ACP into `run-agent.ts`, delete `run-acp-agent.ts`

The consolidated command lives in `run-agent.ts`. The `run-acp-agent.ts` file is deleted entirely — no re-exports or backward compatibility shims. The `acp` command is removed from the CLI.

**Alternative:** Keep `run-acp-agent.ts` as a thin wrapper. Rejected because it adds unnecessary indirection and we want a clean break.

### 2. `-acp` flag as a boolean option

```
clawmasons agent <agent> <role> [--acp] [--proxy-port <number>] [--chapter <name>] [--init-agent <name>]
```

In non-ACP mode, `<agent>` and `<role>` are required positional arguments (existing behavior). In ACP mode, `<agent>` is optional (auto-detected) and `<role>` can also be passed via `--role` for backward compatibility with editor configs.

**Alternative:** Subcommand `agent acp`. Rejected because `-acp` is simpler and the modes share the same core startup.

### 3. Shared startup routine extracted as `initAgentSession()`

Extract the common startup logic into a shared function:
1. Pre-flight: check Docker Compose
2. Resolve role from CLAWMASONS_HOME/chapters.json (auto-init if missing)
3. Validate Dockerfiles
4. Ensure .gitignore
5. Generate session ID, tokens, session directory
6. Generate Docker Compose (proxy + agent only, no credential-service)
7. Start proxy
8. Start in-process credential service (CredentialService + CredentialWSClient)

After this shared routine, the modes diverge:
- **Interactive mode:** Start agent container interactively with stdin/stdout inherited
- **ACP mode:** Create AcpSdkBridge, start bridge on stdin/stdout, defer agent start to session/new

### 4. Remove credential-service from all Docker Compose generation

Both `generateComposeYml()` (run-agent) and `generateAcpComposeYml()` (AcpSession) lose the credential-service container. The agent container's `depends_on` changes from `credential-service` to the proxy service only.

The in-process credential service connects to the proxy's WebSocket credential relay (`/ws/credentials`) just like the container did, so the proxy and agent-entry code remain unchanged.

### 5. Merge dependency injection interfaces

`RunAgentDeps` and `RunAcpAgentDeps` are merged into a single `RunAgentDeps` interface that covers both modes. ACP-specific deps (bridge, session factories) are optional and only used when `-acp` is active.

### 6. Agent arguments become optional in ACP mode

In ACP mode, `<agent>` is auto-detected if only one agent package exists (same as current `acp` behavior). The `--role` option is available as an alternative to the positional `<role>` argument for editor config compatibility.

## Risks / Trade-offs

- **[Breaking change for editor configs]** — Editors using `clawmasons acp --role <name>` must update to `clawmasons agent --acp --role <name>`. Mitigated by clear documentation and the project being pre-1.0.
- **[Larger single file]** — `run-agent.ts` grows significantly. Mitigated by extracting shared logic into `initAgentSession()` and keeping mode-specific logic in separate functions.
- **[Credential service reliability]** — Moving from containerized to in-process means the credential service shares the CLI process lifecycle. If the CLI crashes, credentials are lost. Mitigated by: this is already the behavior in ACP mode, and the credential service is lightweight (in-memory SQLite).
