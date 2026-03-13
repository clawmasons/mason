# Design: Docker Generation + Container Ignore

## Architecture

### 1. Role-Centric Docker Build Directory

Generated at `.clawmasons/docker/<role-name>/` with this structure:

```
.clawmasons/docker/<role-name>/
├── <agent-type>/
│   ├── Dockerfile
│   └── workspace/
│       └── (materialized workspace files)
├── mcp-proxy/
│   └── Dockerfile
└── docker-compose.yaml
```

The `docker-compose.yaml` here is a template/reference compose file for the role's build directory. The actual runnable compose file lives in the session directory.

### 2. Volume Masking (Container Ignore)

Given `container.ignore.paths`, generate Docker Compose volume entries that mask those paths inside the container's project mount at `/home/mason/workspace/project/`.

**Rules:**
- Paths ending with `/` or detected as directories: masked with named empty volumes
- Paths without trailing `/` (files): masked with read-only bind mount of sentinel empty file
- Volume names are sanitized from path: e.g., `.clawmasons/` -> `ignore-clawmasons`
- The project is mounted read-only at `/home/mason/workspace/project/:ro`
- Masking volumes come AFTER the project mount (Docker volume stacking)
- The materialized workspace at `/home/mason/workspace/` is NOT affected

**Implementation:**

```typescript
interface VolumeMaskEntry {
  type: 'directory' | 'file';
  hostPath: string;         // relative path in project
  containerPath: string;    // /home/mason/workspace/project/<path>
  volumeName?: string;      // for directory masks (named volume)
}

function generateVolumeMasks(
  ignorePaths: string[],
  sentinelFilePath: string,
): VolumeMaskEntry[]
```

A path is classified as a directory if it ends with `/`. Otherwise it's treated as a file.

Volume name sanitization: replace non-alphanumeric characters with `-`, prefix with `ignore-`.

### 3. Sentinel File

Created at `.clawmasons/empty-file` by `ensureSentinelFile(projectDir)`.
- File content: empty (0 bytes)
- Permissions: `0o444` (read-only for all)
- Idempotent: only creates if missing

### 4. Session Directory

Created at `.clawmasons/sessions/<session-id>/` for each run:

```
.clawmasons/sessions/<session-id>/
├── docker-compose.yaml
└── logs/
```

The session's `docker-compose.yaml`:
- References the role's Docker build dir for Dockerfile build contexts using relative paths from session dir
- Mounts the project directory using relative path back to project root
- Includes all volume mask entries
- Is a fully functional Docker Compose project (can run `docker compose` commands from session dir)

**Path resolution from session dir:**
- Session dir: `<project>/.clawmasons/sessions/<session-id>/`
- Docker build dir: `<project>/.clawmasons/docker/<role-name>/`
- Relative from session to build: `../../docker/<role-name>/`
- Relative from session to project root: `../../..`
- Relative from session to sentinel: `../../empty-file`

### 5. Proxy Dockerfile

The proxy Dockerfile in `mcp-proxy/Dockerfile`:
- Base image: `node:22-slim`
- Copies `node_modules/` from `docker/node_modules/` (pre-populated by `docker-init`)
- Build context: the `docker/` directory (referenced with relative path from build dir)
- Entrypoint: `node node_modules/.bin/clawmasons chapter proxy --agent <agentName> --transport streamable-http`
- Runs as `USER mason`

### 6. Docker Compose Services (Session File)

```yaml
services:
  proxy-<role>:
    build:
      context: <relative-path-to-docker-dir>
      dockerfile: <relative-path-to-mcp-proxy/Dockerfile>
    volumes:
      - <relative-to-project>:/home/mason/workspace/project:ro
      - <relative-to-logs>:/logs
    environment:
      - CHAPTER_PROXY_TOKEN=${CHAPTER_PROXY_TOKEN}
      - CREDENTIAL_PROXY_TOKEN=${CREDENTIAL_PROXY_TOKEN}
      - CHAPTER_SESSION_TYPE=...
      - CHAPTER_DECLARED_CREDENTIALS=...
    ports:
      - "<port>:9090"

  agent-<role>:
    build:
      context: <relative-path-to-docker-dir>/<agent-type>
      dockerfile: Dockerfile
    volumes:
      - <relative-to-project>:/home/mason/workspace/project:ro
      # Volume masks for ignored directories
      - ignore-clawmasons:/home/mason/workspace/project/.clawmasons
      - ignore-claude:/home/mason/workspace/project/.claude
      # Volume masks for ignored files
      - <relative-sentinel>:/home/mason/workspace/project/.env:ro
      # Role-declared extra mounts
      ...
    depends_on:
      - proxy-<role>
    environment:
      - MCP_PROXY_TOKEN=${CHAPTER_PROXY_TOKEN}

volumes:
  ignore-clawmasons:
  ignore-claude:
```

## New Module: `docker-generator.ts`

Location: `packages/cli/src/materializer/docker-generator.ts`

Exports:
- `generateRoleDockerBuildDir(role, agentType, projectDir, dockerBuildRoot)` — writes the full build directory
- `generateVolumeMasks(ignorePaths)` — returns VolumeMaskEntry[]
- `ensureSentinelFile(projectDir)` — creates sentinel file
- `createSessionDirectory(opts)` — creates session dir with compose file
- `generateSessionComposeYml(opts)` — generates the compose YAML string

## Testing Strategy

Unit tests in `packages/cli/tests/materializer/docker-generator.test.ts`:

1. **Build directory structure** — verify all expected files/dirs are created
2. **Volume masking (directories)** — paths ending with `/` generate named volumes
3. **Volume masking (files)** — paths without `/` generate sentinel bind mounts
4. **Masking targets only project mount** — container paths use `/home/mason/workspace/project/`
5. **Sentinel file** — created with correct permissions, idempotent
6. **Session directory** — compose file is valid, all paths resolvable from session dir
7. **Proxy Dockerfile** — uses correct base image and entrypoint
