## Context

The `docker-init` command generates Dockerfiles for proxy and agent containers. Each generator follows a consistent pattern:
- Function that returns a Dockerfile string
- Uses `node:22-slim` base image
- Copies `node_modules/` from the Docker build context
- Creates and runs as `mason` user
- Sets an appropriate entrypoint

The credential service (`@clawmasons/credential-service`) has a CLI entrypoint at `src/cli.ts` that reads config from environment variables and starts the WebSocket client. The credential service needs native addon support (`better-sqlite3`) just like the proxy.

## Goals / Non-Goals

**Goals:**
- Generate `docker/credential-service/Dockerfile` during `docker-init`
- Dockerfile follows existing proxy pattern (node:22-slim, mason user, native rebuild)
- Entrypoint runs `credential-service` CLI via the chapter node_modules `.bin`
- Single credential service Dockerfile per chapter (not per role/agent)

**Non-Goals:**
- Key pair generation (Phase 2, CHANGE 24)
- Docker Compose changes (CHANGE 8)
- Credential service package creation (already done in CHANGE 3)

## Decisions

### Decision 1: Credential service Dockerfile mirrors proxy Dockerfile pattern

**Choice**: The credential service Dockerfile follows the same structure as the proxy Dockerfile: `node:22-slim`, install build tools, copy `node_modules/`, rebuild native addons, create `mason` user, set entrypoint.

**Rationale**: Consistency with existing patterns. The credential service has the same dependency on `better-sqlite3` (for audit logging) as the proxy, so it needs the same native addon rebuild step.

### Decision 2: No parameters needed for generator function

**Choice**: `generateCredentialServiceDockerfile()` takes no parameters, unlike `generateProxyDockerfile(role, agentName)` which needs role context.

**Rationale**: There is exactly one credential service per chapter. It doesn't vary by role or agent. The function returns a static Dockerfile.

### Decision 3: Entrypoint uses node_modules/.bin/credential-service

**Choice**: The entrypoint runs `node node_modules/.bin/credential-service` (the credential-service package's bin entry).

**Rationale**: Follows the same pattern as the proxy Dockerfile which uses `node node_modules/.bin/chapter`. The credential-service package defines a `bin` entry in its `package.json`.

### Decision 4: Generation is unconditional

**Choice**: The credential service Dockerfile is always generated when `docker-init` generates Dockerfiles (i.e., when agents are found). It does not require any agents to declare credentials.

**Rationale**: The credential service is a core infrastructure component. It should always be available even if no agents currently declare credentials (they may in the future, or credentials may be added dynamically).

## API Surface

```typescript
// packages/cli/src/generator/credential-service-dockerfile.ts
export function generateCredentialServiceDockerfile(): string;
```

## Generated Dockerfile Structure

```
docker/
├── credential-service/
│   └── Dockerfile          # NEW
├── proxy/
│   └── <role>/Dockerfile
└── agent/
    └── <agent>/<role>/Dockerfile
```
