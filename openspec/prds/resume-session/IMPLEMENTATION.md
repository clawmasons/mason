# Session Resume — Implementation Plan

**PRD:** [openspec/prds/resume-session/PRD.md](./PRD.md)
**Phase:** P0 (Core Changes)

---

## Implementation Steps

### CHANGE 1: Universal meta.json & masonSessionId

Extend the session store to support all sessions (not just ACP) and add fields required for resume.

**PRD refs:** PRD §4.1 (Universal meta.json), §4.3 (Latest Session Symlink)

**Summary:** Extend the `Session` interface in `packages/shared/src/session/session-store.ts` with two new fields: `masonSessionId` (always equal to `sessionId`, stored explicitly for container access) and `agentSessionId` (nullable, written by agent hooks). Update `createSession()` to populate `masonSessionId`. Modify `packages/cli/src/cli/commands/run-agent.ts` to call `createSession()` for CLI-initiated sessions (replacing the 8-char `generateSessionId()` with UUID v7 from the session store). Pass the resulting `sessionId` to `createSessionDirectory()` via the existing `sessionId` option.

**User Story:** As the `run-agent` command, I call `createSession(cwd, agent, role)` at the start of every `mason run` invocation. This creates `.mason/sessions/{uuid-v7}/meta.json` with `masonSessionId` and `agentSessionId: null`. Later, the agent's SessionStart hook writes `agentSessionId` into the same file. As `mason run --resume`, I call `readSession(cwd, sessionId)` to retrieve the stored metadata including the `agentSessionId`.

Types:
```typescript
// Extended Session interface (session-store.ts)
export interface Session {
  sessionId: string;
  masonSessionId: string;        // NEW — always equals sessionId
  cwd: string;
  agent: string;
  role: string;
  agentSessionId: string | null;  // NEW — populated by agent hook
  firstPrompt: string | null;
  lastUpdated: string;
  closed: boolean;
  closedAt: string | null;
}
```

**Testable output:** Unit tests: (a) `createSession()` returns session with `masonSessionId === sessionId`, (b) `createSession()` returns `agentSessionId: null`, (c) `updateSession()` can set `agentSessionId` to a string value, (d) `readSession()` round-trips both new fields, (e) CLI `mason run` creates meta.json in `.mason/sessions/{uuid-v7}/` (integration), (f) `generateSessionId()` is no longer used for session directory creation.

**Implemented** — [Spec](../../changes/archive/2026-03-27-universal-meta-json/proposal.md) | [Design](../../changes/archive/2026-03-27-universal-meta-json/design.md) | [Tasks](../../changes/archive/2026-03-27-universal-meta-json/tasks.md)

Files changed:
- `packages/shared/src/session/session-store.ts` — Extended `Session` interface with `masonSessionId` and `agentSessionId`; updated `createSession()` to populate both fields
- `packages/cli/src/cli/commands/run-agent.ts` — Replaced `generateSessionId()` calls with `createSession()` from session store at all 5 call sites; added `createSessionFn` to `RunAgentDeps`
- `packages/shared/tests/session/session-store.test.ts` — Added tests for new fields
- `packages/cli/tests/cli/run-agent.test.ts` — Added `createSessionFn` mock to all test dep factories

---

### CHANGE 2: Latest Session Symlink

Create and maintain a `.mason/sessions/latest` symlink pointing to the most recently started session.

**PRD refs:** PRD §4.4 (Latest Session Symlink)

**Summary:** Add a `updateLatestSymlink(cwd, sessionId)` function to `packages/shared/src/session/session-store.ts` that atomically creates/updates `.mason/sessions/latest` → `{sessionId}` (relative symlink). Use the create-temp-then-rename pattern for atomicity. Add a `resolveLatestSession(cwd)` function that reads the symlink target and returns the session ID. Call `updateLatestSymlink()` from `createSession()` so every session start (CLI and ACP) updates the symlink.

**User Story:** As a developer, after running `mason run -p "hello"`, I can see `.mason/sessions/latest` pointing to my session directory. When I later run `mason run --resume` (no ID), the CLI calls `resolveLatestSession()` to find the most recent session.

```typescript
// New functions in session-store.ts
function updateLatestSymlink(cwd: string, sessionId: string): void;
function resolveLatestSession(cwd: string): string | null;
```

**Testable output:** Unit tests: (a) `updateLatestSymlink()` creates symlink at `.mason/sessions/latest`, (b) symlink target is relative (just the session ID, not absolute path), (c) `resolveLatestSession()` returns the session ID from the symlink, (d) calling `updateLatestSymlink()` twice overwrites the first symlink, (e) `resolveLatestSession()` returns null when symlink doesn't exist, (f) `createSession()` automatically updates the symlink.

**Not Implemented Yet**

---

### CHANGE 3: Per-Session agent-launch.json & Session Directory Mount

Move `agent-launch.json` from the shared build directory to the per-session directory, and mount the session directory into the container.

**PRD refs:** PRD §4.2 (Per-Session agent-launch.json), §4.3 (Session Directory Mount)

**Summary:** Three coordinated changes: (1) Update `refreshAgentLaunchJson()` in `packages/cli/src/cli/commands/run-agent.ts` to write `agent-launch.json` to `.mason/sessions/{id}/` instead of `.mason/docker/{role}/{agent}/workspace/`. (2) Update `generateSessionComposeYml()` in `packages/cli/src/materializer/docker-generator.ts` to add a bind mount from `.mason/sessions/{id}/` → `/home/mason/.mason/session/` (rw), and update the workspace mount so that `agent-launch.json` is no longer expected from the build workspace directory. (3) Update `agent-entry` in `packages/agent-entry/src/index.ts` to check `/home/mason/.mason/session/agent-launch.json` first (new primary path), falling back to the legacy `/home/mason/workspace/agent-launch.json` for backward compatibility.

**User Story:** As the `run-agent` command, I generate `agent-launch.json` into `.mason/sessions/{id}/agent-launch.json`. The Docker compose mounts that session directory into the container at `/home/mason/.mason/session/`. Inside the container, `agent-entry` loads launch config from `/home/mason/.mason/session/agent-launch.json`. This means each session can have different launch args (critical for `--resume` to inject the agent session ID).

```typescript
// Updated search paths in agent-entry (index.ts)
const searchPaths = [
  "/home/mason/.mason/session/agent-launch.json",   // NEW primary (per-session)
  "/home/mason/workspace/agent-launch.json",          // Legacy fallback
  path.join(process.cwd(), "agent-launch.json"),      // CWD fallback
];

// New mount in generateSessionComposeYml()
// volumes:
//   - {sessionDir}:/home/mason/.mason/session:rw
```

**Testable output:** (a) `refreshAgentLaunchJson()` writes to session dir, not build dir, (b) `generateSessionComposeYml()` output includes `/home/mason/.mason/session` volume mount, (c) `agent-entry` loads from `/home/mason/.mason/session/agent-launch.json` when present, (d) `agent-entry` falls back to `/home/mason/workspace/agent-launch.json` when session path missing, (e) `meta.json` is accessible inside container at `/home/mason/.mason/session/meta.json` (e2e).

**Not Implemented Yet**

---

### CHANGE 4: Agent Resume SDK Config

Add the `resume` field to the `AgentPackage` interface so agents can declare how they support session resumption.

**PRD refs:** PRD §5.2 (SDK Resume Configuration)

**Summary:** Add an optional `resume` field to `AgentPackage` in `packages/agent-sdk/src/types.ts`. This field declares: (1) the CLI argument flag the agent uses for resuming (e.g., `--resume`), (2) which `meta.json` field contains the session ID to pass (e.g., `agentSessionId`). Update `generateAgentLaunchJson()` in `packages/agent-sdk/src/helpers.ts` to accept an optional `resumeId` parameter — when provided and the agent package has a `resume` config, append `[resume.flag, resumeId]` to the args array.

**User Story:** As an agent package author, I add `resume: { flag: "--resume", sessionIdField: "agentSessionId" }` to my `AgentPackage` export. The CLI reads this config and injects the appropriate resume argument into `agent-launch.json` when resuming a session. Different agents can use different flags (e.g., `--continue`, `--session`) without CLI changes.

Types:
```typescript
// New field on AgentPackage (types.ts)
export interface AgentPackage {
  // ... existing fields ...

  /** Session resume configuration. */
  resume?: {
    /** CLI argument flag for resuming (e.g., "--resume"). */
    flag: string;
    /** meta.json field containing the agent's session ID (e.g., "agentSessionId"). */
    sessionIdField: string;
  };
}

// Updated generateAgentLaunchJson signature (helpers.ts)
export function generateAgentLaunchJson(
  agentPkg: AgentPackage,
  roleCredentials: string[],
  acpMode?: boolean,
  instructions?: string,
  agentArgs?: string[],
  initialPrompt?: string,
  printMode?: boolean,
  jsonMode?: boolean,
  resumeId?: string,        // NEW
): string;
```

**Testable output:** Unit tests: (a) `generateAgentLaunchJson()` with `resumeId` and agent having `resume` config appends `[flag, resumeId]` to args, (b) `generateAgentLaunchJson()` with `resumeId` but no `resume` config ignores it, (c) `generateAgentLaunchJson()` without `resumeId` produces same output as before (backward compatible), (d) TypeScript compiles with new `resume` field on AgentPackage.

**Not Implemented Yet**

---

### CHANGE 5: Claude Code Agent Resume Support & SessionStart Hook

Configure the claude-code-agent to support resume and capture its session ID via a hook.

**PRD refs:** PRD §5.1 (Hook-Based Capture), §5.2 (SDK Resume Configuration)

**Summary:** Two changes to the claude-code-agent package: (1) Add `resume: { flag: "--resume", sessionIdField: "agentSessionId" }` to the `AgentPackage` export in `index.ts`. (2) Update the materializer's `materializeHome()` (or `materializeWorkspace()`) to merge a `SessionStart` hook into the generated `.claude/settings.json` — this hook runs `node -e "..."` to read `/home/mason/.mason/session/meta.json`, set `agentSessionId` to `process.env.CLAUDE_SESSION_ID`, and write it back. The hook is only added when the session mount is available (i.e., always after CHANGE 3).

**User Story:** As a developer running `mason run -p "hello"`, Claude Code starts inside the container, fires its `SessionStart` hook, which writes `CLAUDE_SESSION_ID` into `meta.json`. When I later run `mason run --resume`, the CLI reads `agentSessionId` from `meta.json` and passes `--resume <agentSessionId>` to Claude Code, which restores its conversation state.

```typescript
// Hook merged into settings.json by materializer
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "node -e \"const f='/home/mason/.mason/session/meta.json';const d=JSON.parse(require('fs').readFileSync(f));d.agentSessionId=process.env.CLAUDE_SESSION_ID;require('fs').writeFileSync(f,JSON.stringify(d,null,2))\""
      }]
    }]
  }
}
```

**Testable output:** (a) claude-code-agent `AgentPackage` export includes `resume` field, (b) materializer output includes `.claude/settings.json` with `SessionStart` hook, (c) hook command references `/home/mason/.mason/session/meta.json`, (d) hook command reads `CLAUDE_SESSION_ID` env var, (e) existing permissions in settings.json are preserved alongside hooks (e2e).

**Not Implemented Yet**

---

### CHANGE 6: `mason run --resume` CLI Flag

Add the `--resume` option to the `mason run` command with full session validation and launch flow.

**PRD refs:** PRD §6.1 (--resume Flag), §6.2 (Ignored Flags), §6.3 (Validation), §6.4 (Resume Flow)

**Summary:** Register `--resume [session-id]` as an option in `registerRunCommand()`. In `createRunAction()`, when `--resume` is present: (1) resolve the session ID — if omitted or "latest", call `resolveLatestSession()`; otherwise use the provided ID, (2) call `readSession()` to load `meta.json`, (3) validate: session exists, not closed, Docker image exists (via `docker image inspect`), (4) warn if `--agent` or `--role` were also provided, (5) extract agent + role from `meta.json`, (6) read `agentSessionId` from `meta.json` and look up `resume` config on the agent's `AgentPackage`, (7) generate `agent-launch.json` with resume args into the session dir, (8) launch Docker compose from the existing session directory. When session is not found, list available sessions with agent, role, first prompt, and relative time.

**User Story:** As a developer, I run `mason run --resume -p "add tests"`. The CLI resolves `latest` → reads `meta.json` → validates Docker artifacts → generates `agent-launch.json` with `--resume <agentSessionId>` → launches the container. The agent picks up where it left off. If I mistype the session ID, I see a helpful error with available sessions listed.

**Testable output:** (a) `mason run --resume` resolves latest symlink, (b) `mason run --resume <id>` uses explicit session ID, (c) `mason run --resume latest` equivalent to no ID, (d) error when session not found includes available sessions list, (e) error when session is closed, (f) error when Docker image missing, (g) warning printed when `--agent` used with `--resume`, (h) warning printed when `--role` used with `--resume`, (i) `agent-launch.json` includes resume flag + agent session ID, (j) `agent-launch.json` includes new prompt from `-p` flag.

**Not Implemented Yet**

---

### CHANGE 7: ACP Automatic Resume

Update the ACP prompt handler to automatically resume agent sessions on subsequent prompts.

**PRD refs:** PRD §7.1 (Automatic Resume on Subsequent Prompts)

**Summary:** Update `ExecutePromptStreamingOptions` in `packages/cli/src/acp/prompt-executor.ts` to accept an optional `masonSessionId` field. When present, replace `--agent`/`--role` args with `--resume <masonSessionId>`. In the ACP `prompt` handler (`packages/cli/src/acp/acp-agent.ts`), after the first prompt completes: read `meta.json` to check if `agentSessionId` was captured. On subsequent prompts for the same session, if `agentSessionId` exists, pass `masonSessionId` (the session's own ID) to `executePromptStreaming()` so the subprocess runs `mason run --resume <masonSessionId> --json <text>` instead of `mason run --agent X --role Y --json <text>`.

**User Story:** As a Zed/VS Code plugin using ACP, I call `newSession` → `prompt("scaffold API")`. The first prompt runs normally. Claude Code writes its session ID to `meta.json`. When I call `prompt("add auth")`, the ACP handler sees `agentSessionId` is set, so it spawns `mason run --resume <session-id> --json "add auth"`. Claude Code resumes seamlessly — the user sees a continuous conversation.

```typescript
// Updated ExecutePromptStreamingOptions
export interface ExecutePromptStreamingOptions {
  agent: string;
  role: string;
  text: string;
  cwd: string;
  signal?: AbortSignal;
  onSessionUpdate: (update: Record<string, unknown>) => void;
  masonSessionId?: string;  // NEW — when set, use --resume instead of --agent/--role
}
```

**Testable output:** (a) first ACP prompt spawns `mason run --agent X --role Y --json text` (no resume), (b) second ACP prompt (after agentSessionId captured) spawns `mason run --resume <sessionId> --json text`, (c) `executePromptStreaming()` with `masonSessionId` produces correct args array, (d) `executePromptStreaming()` without `masonSessionId` produces legacy args (backward compatible), (e) ACP prompt reads `meta.json` after each prompt to check for `agentSessionId`.

**Not Implemented Yet**
