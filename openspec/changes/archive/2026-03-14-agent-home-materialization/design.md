## Context

Agent containers currently receive only workspace files (`.mcp.json`, `AGENTS.md`, `agent-launch.json`, etc.) at build time, plus credentials at runtime via the credential service. The container's `/home/mason` is sparse — it lacks Claude Code's rich configuration (settings, plans, skills, statsig, project context) that makes the agent behave like the host user's environment.

The `mason` user is created with `groupadd -r mason && useradd -r -g mason -m mason` (system-assigned UID/GID), which causes permission mismatches on bind-mounted volumes from the host.

Key files involved:
- `packages/cli/src/materializer/types.ts` — `RuntimeMaterializer` interface
- `packages/cli/src/materializer/claude-code.ts` — Claude Code materializer (has `materializeWorkspace`)
- `packages/cli/src/materializer/docker-generator.ts` — `generateRoleDockerBuildDir`, `generateSessionComposeYml`
- `packages/cli/src/generator/agent-dockerfile.ts` — `generateAgentDockerfile`
- `packages/agent-entry/src/index.ts` — `bootstrap()` flow

## Goals / Non-Goals

**Goals:**
- Each agent materializer can define what host config goes into the agent's home directory
- Claude Code materializer copies `~/.claude/` config (statsig, projects, settings, plans, plugins, skills) and `~/.claude.json` with proper path transformations
- Container's `mason` user matches host UID/GID to fix bind-mount permissions
- Build-time OS files (`.bashrc`, `.profile`) survive the home directory mount overlay
- `agent-entry` merges build-time files into the mounted home before credential setup

**Non-Goals:**
- Backwards compatibility with existing UID/GID scheme
- Home materialization for `mcp-agent` (starts as no-op, can add later)
- Changing the credential flow — credentials remain runtime-only via MCP proxy
- Syncing home directory changes back to the host

## Decisions

### 1. `materializeHome()` on `RuntimeMaterializer` interface

Add an optional `materializeHome(projectDir: string, homePath: string): void` method to `RuntimeMaterializer`. Unlike `materializeWorkspace()` which returns a `Map<string, string>`, `materializeHome()` writes directly to disk because it copies entire directory trees (not just generated content). The `homePath` parameter is the absolute path to `{projectDir}/.mason/docker/{role}/{agent}/home/`.

**Why not `Map<string, string>`?** Home materialization copies binary files, nested directories, and large trees. A `Map<string, string>` would need to enumerate and read every file into memory. Direct filesystem operations (`fs.cpSync`) are simpler and more efficient.

**Alternative considered:** A separate `HomeMaterializer` interface. Rejected because the materializer already knows what the agent runtime needs — splitting would create coordination overhead.

### 2. Host UID/GID via build args

Pass `HOST_UID` and `HOST_GID` as Docker build args. `generateAgentDockerfile()` emits:
```dockerfile
ARG HOST_UID=1000
ARG HOST_GID=1000
RUN groupadd -g $HOST_GID mason && useradd -m -u $HOST_UID -g $HOST_GID mason
```

The caller (docker-generator or build command) reads `id -u` and `id -g` from the host at build time and passes them as build args. Default values of 1000 provide a reasonable fallback.

**Alternative considered:** Runtime UID remapping via `userns-remap`. Rejected — adds Docker daemon config complexity and doesn't solve the build-time file ownership issue.

### 3. Dockerfile home backup pattern

After the standard `mason` user setup and workspace COPY, the Dockerfile adds:
```dockerfile
# Copy home to backup before mount overlay
COPY {role}/{agent}/home/ /home/mason/
RUN cp -a /home/mason /home/mason-from-build
```

This copies the materialized home files into the image AND backs up the entire `/home/mason` (including OS-generated `.bashrc`, `.profile`, etc.) to `/home/mason-from-build`. When the home directory mount overlays `/home/mason`, the backup persists.

**Alternative considered:** Using Docker entrypoint scripts instead of `agent-entry`. Rejected because `agent-entry` already exists as the universal entrypoint and this is a natural extension of its bootstrap responsibilities.

### 4. agent-entry home merge

Add a `mergeHomeBuild()` step at the very start of `bootstrap()` (before proxy connection):

```typescript
function mergeHomeBuild(): void {
  const backupDir = "/home/mason-from-build";
  if (!fs.existsSync(backupDir)) return;

  // Copy backup files into (now-mounted) /home/mason
  // Use recursive copy, don't overwrite existing files from host mount
  execSync(`cp -rn ${backupDir}/. /home/mason/`);
}
```

The `-n` (no-clobber) flag ensures host-mounted files take precedence over build-time files. This means the materialized home config wins over the OS defaults when there's a conflict — which is the correct behavior.

### 5. Compose volume mount for home directory

`generateSessionComposeYml()` adds a volume mount for the agent's home directory:
```yaml
volumes:
  - {relHomePath}:/home/mason
```

The `homePath` is relative from the session directory to `{dockerBuildDir}/{agentType}/home/`. This is added alongside the existing project mount.

### 6. Claude Code projects path transformation

The projects directory transform follows this algorithm:
1. Read `projectDir` (e.g., `/Users/greff/Projects/clawmasons/chapter`)
2. Replace all `/` with `-` → `-Users-greff-Projects-clawmasons-chapter`
3. Copy `~/.claude/projects/` to `home/.claude/projects/`
4. Delete all subdirectories except the one matching the flattened path
5. Rename the matching directory to `-home-mason-workspace-project` (the container mount path flattened)

This ensures Claude Code inside the container finds its project context at the correct path.

## Risks / Trade-offs

**[Stale home config]** → The home directory is materialized at build time. If host config changes, the agent won't see updates until the next `--build`. Mitigation: this is acceptable because `--build` is the natural refresh point, and credentials (the most sensitive part) are always fetched fresh at runtime.

**[Home directory size]** → Copying `~/.claude/` could be large if the user has many projects. Mitigation: we delete all project directories except the current one during materialization.

**[UID/GID mismatch on shared systems]** → If multiple users share a machine, their UID/GIDs differ. Mitigation: each user builds their own images with their own UID/GID — images are local, not shared.

**[No-clobber merge semantics]** → Using `cp -rn` means build-time files don't overwrite mounted files. If a build-time file is updated but the mounted version is stale, the stale version wins. Mitigation: The home directory mount IS the materialized content, so they're the same files. The no-clobber only protects the mounted files from being overwritten by the build-time OS files (`.bashrc` etc.), which is correct.
