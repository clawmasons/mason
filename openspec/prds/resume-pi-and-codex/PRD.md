# Resume Support for Pi-Coding-Agent and Codex-Agent — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** ClawForge, Inc.
**Depends on:** [resume-session PRD](../resume-session/PRD.md) (implemented)

---

## 1. Problem Statement

The `mason run --resume` infrastructure (per-session `meta.json`, `agentSessionId` capture, ACP auto-resume) was implemented for the claude-code-agent but does not extend to the other two primary agents: **pi-coding-agent** and **codex-agent**.

Both underlying CLI tools support session resume natively:

- **Pi** (`@mariozechner/pi-coding-agent`): `pi --resume <sessionId>` restores a previous session from its JSONL session file.
- **Codex** (`@openai/codex`): `codex exec resume <sessionId>` resumes a previous session by UUID.

However, neither mason agent package:

1. Declares a `resume` configuration on its `AgentPackage` export.
2. Captures the agent's internal session ID (`agentSessionId`) into `meta.json`.
3. Enables the hook infrastructure needed for session ID capture.

This means `mason run --resume` cannot resume pi or codex sessions — the CLI has no agent session ID to pass, and the agents have no resume flag configuration to consume.

---

## 2. Goals

### Agent-Level Goals

- **G-1 Pi session ID capture.** The pi-coding-agent captures its session UUID into `meta.json.agentSessionId` via a `session_start` extension event handler at session startup.
- **G-2 Pi resume flag.** The pi-coding-agent declares `resume` config so the CLI passes `--resume <agentSessionId>` on resume.
- **G-3 Codex session ID capture.** The codex-agent captures its session UUID into `meta.json.agentSessionId` via a `SessionStart` hook at session startup.
- **G-4 Codex resume args.** The codex-agent declares `resume` config so the CLI constructs the correct `resume <agentSessionId>` subcommand args on resume.
- **G-5 Codex hooks enabled.** The codex-agent materializer enables the `codex_hooks` feature flag in `.codex/config.toml` so hooks are active.
- **G-6 ACP seamless resume.** ACP multi-turn conversations work identically for pi and codex as they do for claude-code-agent — the first prompt creates the session, subsequent prompts resume it.

### SDK-Level Goals

- **G-7 Flexible resume arg positioning.** The `AgentPackage.resume` interface supports both append-style (`--resume <id>`) and prepend-style (`resume <id>`) arg construction, since codex uses a subcommand pattern while pi and Claude Code use a flag pattern.

### Non-Goals

- **NG-1 CLI infrastructure changes.** The `mason run --resume` command, session validation, symlink resolution, and error handling are already implemented. This PRD does not modify them.
- **NG-2 Session storage changes.** `meta.json` schema, per-session `agent-launch.json`, and session directory mounts are already in place.
- **NG-3 New hook frameworks.** We use each agent's native hook/extension mechanism — no new hook infrastructure is created.
- **NG-4 Cross-agent resume.** Resuming a pi session as codex (or vice versa) remains unsupported.

---

## 3. Design Principles

- **Follow the claude-code-agent pattern.** Each agent needs: (1) `resume` config on `AgentPackage`, (2) session ID capture via the agent's native hook mechanism writing to `/home/mason/.mason/session/meta.json`.
- **Use native hook mechanisms.** Pi uses in-process TypeScript extensions; codex uses external process hooks via `hooks.json`. Each agent captures its session ID through its own idiom.
- **Extend, don't fork.** The SDK's `generateAgentLaunchJson()` is extended to support codex's subcommand pattern rather than adding agent-specific logic.

---

## 4. SDK Changes: Extended Resume Configuration

### 4.1 Current Interface

```typescript
resume?: {
  flag: string;           // e.g., "--resume"
  sessionIdField: string; // e.g., "agentSessionId"
};
```

The current `generateAgentLaunchJson()` appends `[flag, resumeId]` to the end of the args array. This works for Claude Code (`--resume <id>`) and pi (`--resume <id>`) but **not** for codex, which requires `resume <id>` inserted at the beginning of args (before other flags).

### 4.2 Extended Interface

```typescript
resume?: {
  /** The CLI argument(s) for resuming. */
  flag: string;
  /** The meta.json field containing the agent's session ID. */
  sessionIdField: string;
  /** Where to insert resume args relative to other args. Default: "append". */
  position?: "append" | "prepend";
};
```

**Behavior:**

- `position: "append"` (default, backward compatible): args become `[...existingArgs, flag, resumeId]`
- `position: "prepend"`: args become `[flag, resumeId, ...existingArgs]`

**Why `prepend` works for codex:** Codex's print/json mode args start with `exec`. With `position: "prepend"` and `flag: "resume"`, the final args become `["resume", "<sessionId>", "exec", ...]` — wait, that's wrong. We need `["exec", "resume", "<sessionId>", ...]`.

**Revised approach:** Since codex's `exec` is already the first arg in `jsonStreamArgs`, and `resume <id>` must come right after `exec`, we use `position: "after-command"` or simply make `prepend` insert after the first arg:

```typescript
resume?: {
  flag: string;
  sessionIdField: string;
  /**
   * Where to insert resume args.
   * - "append" (default): [...existingArgs, flag, resumeId]
   * - "after-first": [existingArgs[0], flag, resumeId, ...existingArgs.slice(1)]
   */
  position?: "append" | "after-first";
};
```

**Codex example:** With `jsonStreamArgs: ["exec", "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check", "--json"]` and `resume: { flag: "resume", sessionIdField: "agentSessionId", position: "after-first" }`, the resumed args become:

```
["exec", "resume", "<sessionId>", "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check", "--json", "<prompt>"]
```

---

## 5. Pi-Coding-Agent Changes

changing package in ../mason-extensions/agents/pi-coding-agent

### 5.1 AgentPackage Resume Config

Add to `pi-coding-agent/src/index.ts`:

```typescript
resume: {
  flag: "--resume",
  sessionIdField: "agentSessionId",
  // position defaults to "append" — correct for pi
},
```

### 5.2 Session ID Capture via Extension

Pi's hook mechanism is its **extension system** — TypeScript modules at `.pi/extensions/*/index.ts` that run in-process and receive lifecycle events via `pi.on(event, handler)`.

The mason-mcp extension (already generated by the materializer) is the right place to add session ID capture. Add a `session_start` event handler to the generated `index.ts`:

```typescript
// Session ID capture — write pi's session UUID to mason meta.json
pi.on("session_start", async (_event, ctx) => {
  try {
    const f = "/home/mason/.mason/session/meta.json";
    const fs = require("fs");
    if (!fs.existsSync(f)) return;
    const sessionId = ctx.sessionManager.getSessionId();
    if (!sessionId) return;
    const m = JSON.parse(fs.readFileSync(f, "utf8"));
    m.agentSessionId = sessionId;
    fs.writeFileSync(f, JSON.stringify(m, null, 2));
  } catch (e) {
    // Silent — agentSessionId stays null, resume won't activate
  }
});
```

**Key details:**
- Pi extensions are TypeScript, running in the same process — no stdin/stdout protocol needed.
- The session ID is accessed via `ctx.sessionManager.getSessionId()` which returns the UUID from the JSONL session header.
- Error handling follows the same pattern as claude-code-agent: silent failure means `agentSessionId` stays `null` and resume degrades gracefully.

### 5.3 Materializer Change

Update `generateExtensionIndexTs()` in `pi-coding-agent/src/materializer.ts` to include the `session_start` handler inside the `export default (pi) => { ... }` block.

---

## 6. Codex-Agent Changes

changing package in ../mason-extensions/agents/codex-agent

### 6.1 AgentPackage Resume Config

Add to `codex-agent/src/index.ts`:

```typescript
resume: {
  flag: "resume",
  sessionIdField: "agentSessionId",
  position: "after-first",  // Insert "resume <id>" after "exec"
},
```

### 6.2 Enable Codex Hooks Feature

Codex hooks require explicit opt-in via `config.toml`:

```toml
[features]
codex_hooks = true
```

Update `materializeHome()` in `codex-agent/src/materializer.ts` to append the feature flag to the home-level `~/.codex/config.toml`.

### 6.3 Session ID Capture via SessionStart Hook

Codex hooks follow the same JSON-over-stdin pattern as Claude Code hooks. The `SessionStart` hook receives a JSON object on stdin containing `session_id`.

Generate `.codex/hooks.json` in the workspace (or home directory):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{try{const i=JSON.parse(s);const f='/home/mason/.mason/session/meta.json';if(require('fs').existsSync(f)&&i.session_id){const m=JSON.parse(require('fs').readFileSync(f,'utf8'));m.agentSessionId=i.session_id;require('fs').writeFileSync(f,JSON.stringify(m,null,2))}}catch(e){}})\""
          }
        ]
      }
    ]
  }
}
```

**Key details:**
- The hook command is identical to claude-code-agent's SessionStart hook — both tools use the same stdin JSON protocol with a `session_id` field.
- The hook file goes in `.codex/hooks.json` (either home-level `~/.codex/hooks.json` or project-level `.codex/hooks.json`).
- Error handling: silent catch — if meta.json doesn't exist or session_id is missing, the hook exits cleanly.

### 6.4 Materializer Changes

Update `codexAgentMaterializer` in `codex-agent/src/materializer.ts`:

1. **`materializeHome()`**: Append `[features]\ncodex_hooks = true\n` to the generated `config.toml`.
2. **`materializeWorkspace()`** (or `materializeHome()`): Generate `.codex/hooks.json` with the SessionStart hook.

---

## 7. Use Cases

### UC-1: Resume Pi Session

**Actor:** Developer who ran a pi-coding-agent session.
**Goal:** Continue the session with a follow-up prompt.

**Flow:**
1. Developer runs `mason run --agent pi -p "scaffold a REST API"`.
2. Pi starts, fires `session_start` event. The mason-mcp extension reads the session UUID via `ctx.sessionManager.getSessionId()` and writes it to `/home/mason/.mason/session/meta.json` as `agentSessionId`.
3. Session completes. `meta.json` now has `agentSessionId: "550e8400-e29b-..."`.
4. Developer runs `mason run --resume -p "now add tests"`.
5. CLI resolves latest session → reads `meta.json` → finds `agentSessionId` → reads pi's `resume` config.
6. CLI generates `agent-launch.json` with args `["--resume", "550e8400-e29b-...", "-p", "now add tests"]` (append position).
7. Pi resumes the session with full conversation history.

**Acceptance Criteria:**
- `agentSessionId` is captured in `meta.json` after the first run.
- `mason run --resume` passes the correct `--resume` flag to pi.
- Pi restores the previous session state.

---

### UC-2: Resume Codex Session

**Actor:** Developer who ran a codex-agent session.
**Goal:** Continue the session with a follow-up prompt.

**Flow:**
1. Developer runs `mason run --agent codex -p "build a CLI tool"`.
2. Codex starts, fires `SessionStart` hook. Hook reads `session_id` from stdin JSON, writes it to `meta.json` as `agentSessionId`.
3. Session completes. `meta.json` now has `agentSessionId: "019d34f8-512d-..."`.
4. Developer runs `mason run --resume -p "add --verbose flag"`.
5. CLI resolves latest session → reads `meta.json` → finds `agentSessionId` → reads codex's `resume` config (position: `after-first`).
6. CLI generates `agent-launch.json` with args `["exec", "resume", "019d34f8-512d-...", "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check", "--json", "add --verbose flag"]`.
7. Codex resumes the session.

**Acceptance Criteria:**
- `codex_hooks` feature is enabled in `config.toml`.
- `.codex/hooks.json` is generated with the SessionStart hook.
- `agentSessionId` is captured in `meta.json` after the first run.
- `mason run --resume` constructs args with `resume <id>` after `exec` (not appended at end).
- Codex restores the previous session state.

---

### UC-3: ACP Multi-Turn with Pi

**Actor:** IDE plugin using ACP protocol with pi-coding-agent.
**Goal:** Send multiple prompts seamlessly.

**Flow:**
1. IDE calls `newSession` → session created.
2. IDE calls `prompt("scaffold API")` → pi runs, `agentSessionId` captured.
3. IDE calls `prompt("add auth")` → ACP sees `agentSessionId`, spawns `mason run --resume <sessionId> -p "add auth"`.
4. Pi resumes seamlessly.

**Acceptance Criteria:**
- No user intervention between turns.
- Second prompt resumes the pi session automatically.

---

### UC-4: ACP Multi-Turn with Codex

**Actor:** IDE plugin using ACP protocol with codex-agent.
**Goal:** Send multiple prompts seamlessly.

**Flow:**
1. IDE calls `newSession` → session created.
2. IDE calls `prompt("build CLI")` → codex runs, `agentSessionId` captured.
3. IDE calls `prompt("add tests")` → ACP sees `agentSessionId`, spawns `mason run --resume <sessionId> --json "add tests"`.
4. CLI constructs codex args with `resume <id>` in correct position.
5. Codex resumes seamlessly.

**Acceptance Criteria:**
- No user intervention between turns.
- Codex resume args are correctly positioned.

---

## 8. Non-Functional Requirements

### 8.1 Backward Compatibility

- The `position` field on `AgentPackage.resume` defaults to `"append"`, preserving existing behavior for claude-code-agent and any other agents that don't set it.
- Existing sessions (without `agentSessionId`) cannot be resumed. This is acceptable — resume is a new capability.

### 8.2 Hook Error Isolation

- Both pi's `session_start` handler and codex's `SessionStart` hook must fail silently. If session ID capture fails, `agentSessionId` stays `null` and `mason run --resume` falls back to a descriptive error ("no agent session ID found — cannot resume").
- Hooks must not block or delay agent startup on failure.

### 8.3 Feature Flag Safety (Codex)

- The `codex_hooks = true` feature flag is required for hooks to fire. If the flag is missing (e.g., during a migration), the SessionStart hook simply won't execute — same safe degradation as pi.

---

## 9. Implementation Notes

### 9.1 Pi Extension Placement

The `session_start` handler must be inside the `export default (pi) => { ... }` block of the generated extension, alongside the existing tool registrations. It should be added **before** the MCP tool registration loop so that the session ID is captured early.

### 9.2 Codex hooks.json Location

Codex discovers hooks at two paths: `~/.codex/hooks.json` (user-level) and `<repo>/.codex/hooks.json` (project-level). Since the workspace is mounted at `/home/mason/workspace/project/`, the project-level path would be `/home/mason/workspace/project/.codex/hooks.json`. However, the home-level path (`~/.codex/hooks.json`) is simpler and guaranteed to be available. **Use home-level** — generate it in `materializeHome()`.

### 9.3 Codex config.toml Merging

The current `materializeHome()` writes a fresh `config.toml` with only the trusted project config. The `[features]` section must be appended to this same file. The `materializeWorkspace()` also generates a separate workspace-level `config.toml` for MCP config. Ensure `codex_hooks = true` is in the **home-level** config (since hooks.json is home-level).

### 9.4 `generateAgentLaunchJson` Position Logic

The updated function should handle position as follows:

```typescript
if (resumeId && agentPkg.resume) {
  const resumeArgs = [agentPkg.resume.flag, resumeId];
  if (agentPkg.resume.position === "after-first" && args && args.length > 0) {
    args = [args[0], ...resumeArgs, ...args.slice(1)];
  } else {
    args = [...(args ?? []), ...resumeArgs];
  }
}
```
