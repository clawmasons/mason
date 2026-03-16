## Context

Mason currently manages agent container lifecycles via docker compose — starting a proxy and agent container pair, forwarding credentials, and tearing down on Ctrl+C. The developer interacts entirely through the terminal. There is no mechanism to attach a dev-container-compatible IDE (VSCode, Cursor) to a running agent container.

The existing session flow (docker compose up, credential proxy, agent-entry bootstrap) is stable and must remain untouched. This design layers `--dev-container` mode on top of it: mason starts the session identically, then handles the additional concerns of IDE attachment and persistent VS Code Server state.

## Goals / Non-Goals

**Goals:**
- Mason starts the agent container and prints IDE connection instructions; it does not launch any IDE automatically
- Optionally launch VSCode and attach it to the running container when the user opts in
- Persist VS Code Server binary and extensions across container restarts via a host-mounted volume
- Embed IDE extensions and settings into the agent image at build time via a Dockerfile `LABEL devcontainer.metadata` so no runtime `devcontainer.json` is required
- Allow per-agent `dev-container-customizations` in `.mason/config.json` with a sensible default

**Non-Goals:**
- Starting or managing the IDE process lifecycle beyond the initial `code --folder-uri` spawn
- Supporting IDEs other than VSCode in the initial implementation (the container label approach is IDE-agnostic, but the attach prompt is VSCode-specific)
- Hot-reloading customizations — changes to `dev-container-customizations` require a container image rebuild

## Decisions

### 1. `LABEL devcontainer.metadata` over a runtime `devcontainer.json`

**Decision**: Embed dev-container metadata as a Dockerfile `LABEL` at image build time rather than writing a `devcontainer.json` into the container workspace at runtime.

**Rationale**: A `LABEL` travels with the image and is available immediately when any dev-container-compatible IDE attaches — no filesystem writes needed at session start. It also keeps the session flow stateless. VSCode, Cursor, and other compliant IDEs all read `devcontainer.metadata` labels per the dev container spec.

**Alternative considered**: Writing `.devcontainer/devcontainer.json` to the workspace mount at session start. Rejected because it couples IDE configuration to session state, creates file ownership concerns, and requires the agent workspace mount to exist before configuration is applied.

### 2. Hex-encoded `attached-container` URI for VSCode launch

**Decision**: Construct the VSCode remote URI by JSON-encoding `{ "containerName": "/<name>" }` and hex-encoding it with Node.js `Buffer`, then forming `vscode-remote://attached-container+<hex><workspace>`.

**Rationale**: This is the exact mechanism the VS Code Remote - Containers extension expects. Using `Buffer` for hex encoding avoids a shell `od`/`printf` pipeline dependency and works identically on macOS, Linux, and WSL.

**Alternative considered**: Shelling out to `printf | od` (as in the reference bash script). Rejected because it introduces a shell dependency and is harder to unit test.

### 3. Persistent VS Code Server volume mount

**Decision**: Mount `{projectDir}/.mason/docker/vscode-server` into the container at `/home/mason/.vscode-server`.

**Rationale**: VS Code Server downloads its binary and installs extensions on first attach, which can take 30–60 seconds. Persisting this directory on the host eliminates the download on subsequent container starts. The directory is created by mason during dev-container setup before docker compose up.

**Alternative considered**: Let VS Code Server reinstall on every container start. Rejected because the latency degrades the developer experience significantly.

### 4. Static `server-env-setup` via `agent-entry cred-fetch`

**Decision**: Write a single static `server-env-setup` file (`eval "$(agent-entry cred-fetch)"`) into the persistent VS Code Server mount. `agent-entry cred-fetch` reads credentials from environment variables already set by docker-compose and emits shell exports.

**Rationale**: VS Code Server sources `server-env-setup` on every terminal/task start. Using `agent-entry cred-fetch` keeps the file content session-agnostic (no tokens baked in) while ensuring credentials are available in every VS Code terminal.

**Alternative considered**: Writing session-specific values directly into `server-env-setup`. Rejected because it would require rewriting the file on every session start and could leave stale tokens if the file persists across sessions.

### 5. Interactive prompt rather than automatic IDE launch

**Decision**: After printing connection instructions, mason prompts "Would you like to launch VSCode? (y/N)" and only spawns `code` if the user confirms and it is on PATH.

**Rationale**: Not all users have VSCode installed. Any dev-container-compatible IDE can attach using the printed instructions. Forcing a VSCode launch would be surprising and incorrect for Cursor users or headless environments.

## Risks / Trade-offs

- **`code` not on PATH** → Mason prints a clear error and the user can attach manually using the printed instructions. No session disruption.
- **Volume mount permission mismatch** → If the host user's UID differs from the container's `mason` user, VS Code Server writes may fail. Mitigation: document that the `mason` user in the agent image should match the host UID, or use `docker compose` user mapping.
- **Label size limits** → Docker labels are stored in the image manifest; very large extension lists could approach limits. In practice, the default list of 7 extensions serializes to ~300 bytes — well within limits.
- **VS Code Server version drift** → The persistent mount caches a specific VS Code Server version. If the client VSCode upgrades, the cached server may be replaced. This is handled automatically by VS Code but can cause a one-time re-download.
- **`dev-container-customizations` changes require rebuild** → Developers must rebuild the agent image to pick up changes. Mitigation: document clearly; the label approach trades runtime flexibility for simplicity.

## Migration Plan

1. No changes to existing `mason run` without `--dev-container` — the flag is purely additive.
2. Agent images built without the `LABEL` will still work; VSCode will simply not auto-install extensions on first attach.
3. The `.mason/docker/vscode-server/` directory is created on first dev-container session; it is gitignored automatically (`.mason/docker` is already excluded).

note, we need tochange any .gitignore of .mason in the code to 

.mason/docker
.mason/sessions

everything else can be checked in

## Open Questions

- Should `mason run --dev-container` also support a `--no-vscode-prompt` flag for CI or scripted use cases where the interactive prompt would hang?  not now
- Should the vscode-server volume path be configurable, or is `.mason/docker/vscode-server/` sufficient? notnow
