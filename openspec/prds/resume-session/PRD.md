# Session Resume — Product Requirements Document

**Version:** 0.2.0 · Implemented
**Date:** March 2026
**Author:** ClawForge, Inc.

---

## 1. Problem Statement

Every invocation of `mason run` starts a fresh session — new container, new agent state, new conversation. There is no way to continue a previous session. This creates friction for common workflows:

- **Iterative development.** A developer asks the agent to scaffold a feature, reviews the output, then wants to say "now add tests for that." Today this requires re-explaining the full context.
- **Long-running tasks.** Network interruptions, accidental terminal closures, or laptop sleep can terminate a session. The user must start over.
- **ACP continuity.** The ACP protocol supports `loadSession` for restoring metadata, but the underlying agent process does not resume — each `prompt` call spawns a brand-new `mason run` subprocess with no memory of prior turns.

Additionally, session-related state is scattered:

- `agent-launch.json` is generated into the build directory (`.mason/docker/<role>/<agent>/workspace/`), shared across all sessions for the same role/agent combination. This prevents per-session customization (e.g., adding `--resume` args on subsequent launches).
- `meta.json` is only created for ACP sessions. CLI-initiated sessions via `mason run` create a session directory with `docker-compose.yaml` and `logs/` but no metadata file, making them invisible to session listing and resume.
- There is no standard mechanism for capturing the agent's internal session ID (e.g., Claude Code's `CLAUDE_SESSION_ID`) back to the host.

---

## 2. Goals

### User Goals

- **G-1 Resume by ID.** `mason run --resume <session-id>` relaunches the agent in the same container configuration, with the agent's own session state restored.
- **G-2 Resume latest.** `mason run --resume` (no ID) or `mason run --resume latest` resumes the most recently started session.
- **G-3 Clear failure on missing session.** If the specified session ID does not exist or its Docker artifacts are missing, the CLI exits with a descriptive error — not a Docker stack trace.
- **G-4 Per-session launch config.** Each session has its own `agent-launch.json`, enabling the CLI to inject session-specific arguments (like `--resume <agent-session-id>`) on subsequent launches.
- **G-5 Agent session ID capture.** The agent's internal session identifier (e.g., `CLAUDE_SESSION_ID`) is written back to the session's `meta.json`, enabling the CLI to pass it on resume.
- **G-6 ACP resume.** ACP's `prompt` handler uses `--resume` automatically for sessions that already have an `agentSessionId`, providing seamless multi-turn conversations.

### Non-Goals

- **NG-1 Conversation history replay.** Restoring the full message history in the agent's UI is deferred. Resume relies on the agent's own session persistence (e.g., Claude Code's `--resume` flag handles this internally).
- **NG-2 Session migration.** Moving sessions between machines or projects is out of scope.
- **NG-3 Multi-session merge.** Combining or forking sessions is out of scope.
- **NG-4 Cross-agent resume.** Changing the agent type or role during resume is explicitly unsupported. These require rebuilding Docker and are incompatible with session state.
- **NG-5 Session garbage collection.** Automatic cleanup of old sessions is out of scope. Users manually delete `.mason/sessions/<id>/`.

---

## 3. Design Principles

- **Session-first architecture.** Every session — whether started via `mason run` or ACP — gets a `meta.json` and a per-session `agent-launch.json`. The session directory is the single source of truth for that session's configuration.
- **Agent-agnostic resume.** The CLI does not hardcode how each agent resumes. Instead, the agent SDK exposes a resume argument configuration. The CLI populates `agent-launch.json` with the appropriate flag and value.
- **Fail-fast on missing state.** Resume validates that the session exists, `meta.json` is readable, and Docker artifacts are present before attempting to launch. Errors are specific and actionable.
- **Symlink for convenience.** `.mason/sessions/latest` is a symbolic link pointing to the most recently started session directory, updated atomically on every session start.

---

## 4. Session Directory Changes

### 4.1 Universal `meta.json`

Today, `meta.json` is only created for ACP sessions (via `createSession()` in `session-store.ts`). This PRD requires that **all sessions** — including CLI-initiated `mason run` sessions — create a `meta.json` at session start.

**Extended schema:**

```json
{
  "sessionId": "019d2b36-8cad-71c0-949f-8756b44edd77",
  "masonSessionId": "019d2b36-8cad-71c0-949f-8756b44edd77",
  "cwd": "/Users/dev/my-project",
  "agent": "claude-code-agent",
  "role": "developer",
  "agentSessionId": null,
  "firstPrompt": null,
  "lastUpdated": "2026-03-27T10:00:00.000Z",
  "closed": false,
  "closedAt": null
}
```

**New fields:**

| Field | Type | Description |
|-------|------|-------------|
| `masonSessionId` | `string` | Identical to `sessionId`. Stored explicitly so the container can identify its own session from the mounted `meta.json`. |
| `agentSessionId` | `string \| null` | The agent's internal session ID (e.g., Claude Code's `CLAUDE_SESSION_ID`). Written by the agent via a hook. `null` until the agent starts. |

### 4.2 Per-Session `agent-launch.json`

`agent-launch.json` is currently generated into the build directory at `.mason/docker/<role>/<agent>/workspace/agent-launch.json` and shared across sessions.

This PRD moves generation to:

```
.mason/sessions/<sessionId>/agent-launch.json
```

The file is regenerated before each launch (including resume), allowing the CLI to inject session-specific arguments.

### 4.3 Session Directory Mount

The session directory is mounted into the container:

| Host path | Container path | Mode |
|-----------|---------------|------|
| `.mason/sessions/<sessionId>/` | `/home/mason/.mason/session/` | Read-write |

This gives the agent (and its hooks) access to `meta.json` and `agent-launch.json` from inside the container.

### 4.4 Latest Session Symlink

A symbolic link at `.mason/sessions/latest` points to the most recently started session directory:

```
.mason/sessions/latest → .mason/sessions/019d2b36-8cad-71c0-949f-8756b44edd77
```

**Behavior:**

- Created/updated atomically (write temp link, then rename) on **every** session start — both `mason run` and ACP.
- `mason run --resume latest` and `mason run --resume` both resolve via this symlink.
- If the symlink is missing or dangling, `mason run --resume` (without an explicit ID) fails with a clear error.

---

## 5. Agent Session ID Capture

### 5.1 Hook-Based Capture

The agent's internal session ID is captured via a hook that runs at agent startup. For Claude Code, this is a `SessionStart` hook that reads `CLAUDE_SESSION_ID` from the environment and writes it to `meta.json`.

**Claude Code example hook (added by materializer):**

```json
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

### 5.2 SDK Resume Configuration

Different agents may use different flags for session resumption. The agent SDK exposes this as a configuration on `AgentPackage`:

```typescript
export interface AgentPackage {
  // ... existing fields ...

  /**
   * Configuration for session resume support.
   * When present, the CLI can inject resume arguments into agent-launch.json.
   */
  resume?: {
    /** The CLI argument flag for resuming (e.g., "--resume"). */
    flag: string;
    /** The meta.json field that holds the session ID to pass (e.g., "agentSessionId"). */
    sessionIdField: string;
  };
}
```

**Example for Claude Code Agent:**

```typescript
{
  name: "claude-code-agent",
  resume: {
    flag: "--resume",
    sessionIdField: "agentSessionId",
  },
  // ...
}
```

When generating `agent-launch.json` for a resumed session, the CLI reads the `sessionIdField` from `meta.json` and appends `[flag, value]` to the args array.

---

## 6. CLI Changes

### 6.1 `--resume` Flag

```
mason run --resume [session-id] [options]
```

- `--resume` without a value: resolve via `.mason/sessions/latest` symlink.
- `--resume <session-id>`: use the specified session ID directly.
- `--resume latest`: equivalent to `--resume` without a value.

### 6.2 Ignored Flags on Resume

When `--resume` is present, the following flags are **ignored with a warning**:

- `--agent <name>` — "Warning: --agent is ignored when resuming a session (agent is fixed at session creation)."
- `--role <name>` — "Warning: --role is ignored when resuming a session (role is fixed at session creation)."

The agent and role are read from the session's `meta.json`.

### 6.3 Validation Before Launch

When resuming, the CLI validates:

1. **Session exists.** `.mason/sessions/<id>/meta.json` is readable.
2. **Session not closed.** `meta.json.closed` is `false`.
3. **Docker artifacts exist.** The Docker image for the session's agent/role combination exists locally (via `docker image inspect`).

If any check fails, the CLI exits with a descriptive error:

```
Error: Cannot resume session "abc123" — session not found.

Available sessions:
  019d2b36  claude-code-agent / developer  "fix the login bug"  (2 hours ago)
  019d2a01  claude-code-agent / developer  "add user profile"   (yesterday)

Run "mason run --resume <session-id>" with a valid session.
```

### 6.4 Resume Flow

1. Resolve session ID (explicit, "latest", or symlink).
2. Read `meta.json` → extract `agent`, `role`, `agentSessionId`.
3. Validate Docker artifacts exist.
4. Generate `agent-launch.json` into `.mason/sessions/<id>/`:
   - If `agentSessionId` is present and agent declares `resume` config: append resume flag + session ID to args.
   - Include the new prompt (from `-p` flag) in args.
5. Launch Docker compose from the session directory.
6. Update `lastUpdated` in `meta.json`.

---

## 7. ACP Changes

### 7.1 Automatic Resume on Subsequent Prompts

When the ACP `prompt` handler fires for an existing session:

1. Read `meta.json` for the session.
2. If `agentSessionId` is present, spawn `mason run` with `--resume <mason-session-id>` and the new prompt.
3. The CLI's resume flow (§6.4) handles injecting the agent's resume flag into `agent-launch.json`.

This makes multi-turn ACP conversations seamless — the first prompt creates the session, and subsequent prompts resume it.

---

## 8. Use Cases

### UC-1: Resume Latest Session

**Actor:** Developer who ran a session earlier.
**Goal:** Continue the most recent session with a follow-up prompt.

**Flow:**
1. Developer previously ran `mason run -p "scaffold a REST API"`.
2. Session completes. `.mason/sessions/latest` symlink points to this session.
3. Developer runs `mason run --resume -p "now add tests for that"`.
4. CLI resolves `latest` symlink → reads `meta.json` → finds `agentSessionId`.
5. CLI generates `agent-launch.json` with `--resume <agentSessionId>` and `-p "now add tests for that"`.
6. Agent resumes with full context from the previous turn.

**Acceptance Criteria:**
- Agent receives the resume flag and restores its session state.
- The follow-up prompt is executed in the context of the previous conversation.

---

### UC-2: Resume Specific Session by ID

**Actor:** Developer managing multiple sessions.
**Goal:** Resume a specific session, not the latest.

**Flow:**
1. Developer runs `mason run --resume 019d2b36 -p "fix the bug we discussed"`.
2. CLI finds `.mason/sessions/019d2b36/meta.json`.
3. CLI validates session exists, is not closed, Docker artifacts present.
4. Agent resumes the specified session.

**Acceptance Criteria:**
- The correct session is resumed, not the latest.
- Session ID can be a prefix match (if unambiguous) or exact match.

---

### UC-3: Ignored Flags Warning

**Actor:** Developer who habitually includes `--agent` in their command.
**Goal:** Understand why `--agent` is ignored during resume.

**Flow:**
1. Developer runs `mason run --resume --agent pi -p "continue"`.
2. CLI prints: "Warning: --agent is ignored when resuming a session (agent is fixed at session creation)."
3. CLI uses the agent from `meta.json`, not the `--agent` flag.
4. Session resumes normally.

**Acceptance Criteria:**
- Warning is printed to stderr.
- The session resumes with the original agent, ignoring the flag.

---

### UC-4: Session Not Found

**Actor:** Developer who provides an invalid session ID.
**Goal:** Get a clear error with available alternatives.

**Flow:**
1. Developer runs `mason run --resume nonexistent -p "hello"`.
2. CLI checks `.mason/sessions/nonexistent/meta.json` — not found.
3. CLI prints error listing available sessions (see §6.3).
4. CLI exits with non-zero status.

**Acceptance Criteria:**
- Error message includes the invalid session ID.
- Available sessions are listed with agent, role, first prompt, and relative time.

---

### UC-5: ACP Multi-Turn Conversation

**Actor:** IDE plugin using ACP protocol.
**Goal:** Send multiple prompts to the same agent session seamlessly.

**Flow:**
1. IDE calls `newSession` → session created, `meta.json` written.
2. IDE calls `prompt("scaffold a REST API")` → `mason run` spawns, agent runs, `agentSessionId` captured via hook.
3. IDE calls `prompt("add authentication")` → ACP reads `meta.json`, sees `agentSessionId`, spawns `mason run --resume <session-id> -p "add authentication"`.
4. Agent resumes with context from turn 1.

**Acceptance Criteria:**
- No user intervention needed between turns.
- `agentSessionId` is captured after the first prompt and reused for all subsequent prompts.

---

## 9. Skill Documentation Update

The `add-agent/SKILL.md` documentation must be updated to describe:

- How agents should populate `agentSessionId` (via hooks writing to `/home/mason/.mason/session/meta.json`).
- The `resume` field on `AgentPackage` and how the CLI uses it.
- The session directory mount at `/home/mason/.mason/session/`.

---

## 10. Non-Functional Requirements

### 10.1 Symlink Atomicity

The `.mason/sessions/latest` symlink must be updated atomically via the create-temp-then-rename pattern to avoid races where a concurrent read sees a partially written symlink.

### 10.2 Session Directory Permissions

The session directory and its contents must be readable and writable by the container's `mason` user (matching `HOST_UID`/`HOST_GID`). The `meta.json` file must survive concurrent reads (from the CLI) and writes (from the agent hook) without corruption — use atomic write (temp file + rename).

### 10.3 Backward Compatibility

- Sessions created before this change (without `meta.json`) cannot be resumed. This is acceptable since resume is a new capability.
- The `agent-launch.json` location change requires that `agent-entry` checks the new session-mounted path first, falling back to the legacy workspace path for backward compatibility during migration.

### 10.4 Performance

- Resume should not rebuild Docker images. It reuses the existing image from the original session.
- `docker image inspect` for validation adds negligible latency (<100ms).

---

## 11. Implementation Notes

### 11.1 Relay Token Extraction on Resume

When resuming a session, the CLI reads the relay token from the existing `docker-compose.yaml` via regex extraction (`/RELAY_TOKEN=([a-f0-9]+)/`). If extraction fails (e.g., compose file corrupted), the CLI SHALL fail with an explicit error rather than generating a new token — a mismatched token would silently break host proxy communication.

### 11.2 Resume Error Propagation in agent-launch.json Generation

During resume, `refreshAgentLaunchJson()` SHALL propagate errors from `materializeForAgent()` rather than silently catching them. If the agent-launch.json cannot be generated with resume args, the session would silently degrade to a fresh start — this is unacceptable for resume semantics and must be a hard failure.

For non-resume paths, the silent catch is retained since the initial build already created a fallback copy.

### 11.3 SessionStart Hook Error Handling

The SessionStart hook that captures `CLAUDE_SESSION_ID` SHALL guard against missing state:
- Check that `/home/mason/.mason/session/meta.json` exists before reading
- Check that `CLAUDE_SESSION_ID` environment variable is set before writing
- If either condition fails, the hook exits silently (no error) — this means `agentSessionId` stays `null` and resume won't activate, which is safe degradation
