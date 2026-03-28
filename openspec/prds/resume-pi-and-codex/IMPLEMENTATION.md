# Implementation Plan: Resume Support for Pi-Coding-Agent and Codex-Agent

**PRD:** [resume-pi-and-codex/PRD.md](PRD.md)
**Date:** 2026-03-28

---

## CHANGE 1: SDK — Add `position` field to resume config

**Summary:** Extend the `AgentPackage.resume` interface with an optional `position` field (`"append" | "after-first"`) and update both resume arg injection sites to respect it. This is a prerequisite for codex-agent's `exec resume <id>` subcommand pattern.

**User Story:** As a developer building agent packages, I need the SDK to support inserting resume args after the first argument (not just appending), so that agents like Codex that use subcommand-style resume (`exec resume <id> ...flags`) can participate in `mason run --resume`.

**Changes:**

1. **`packages/agent-sdk/src/types.ts`** — Add optional `position?: "append" | "after-first"` to the `resume` type (after `sessionIdField`).

2. **`packages/agent-sdk/src/helpers.ts`** (`generateAgentLaunchJson`) — Replace the append-only logic at line ~177 with position-aware insertion:
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

3. **`packages/cli/src/cli/commands/run-agent.ts`** (~line 1578) — Apply the same position-aware insertion logic in the post-process resume injection:
   ```typescript
   if (agentPkg.resume.position === "after-first" && parsed.args && parsed.args.length > 0) {
     parsed.args = [parsed.args[0], agentPkg.resume.flag, options.resumeId, ...parsed.args.slice(1)];
   } else {
     parsed.args = [...(parsed.args ?? []), agentPkg.resume.flag, options.resumeId];
   }
   ```

4. **`packages/agent-sdk/tests/helpers.test.ts`** — Add test cases:
   - `position: "after-first"` inserts resume args after the first arg
   - `position: "after-first"` with empty args falls back to append
   - Existing tests continue to pass (no `position` = append by default)

5. Run all tests and fix errors:
   - `npm run lint`
   - `npm run build`
   - `npx vitest run packages/agent-sdk/tests/`
   - `npx vitest run packages/cli/tests/`
   - `npm run test`
   - `npm run test:e2e`
6. confirm no regressions in extension agents
   - In `../mason-extensions`: `npm run lint`
   - In `../mason-extensions`: `npm run build`
   - In `../mason-extensions`: `npm run test`
   - In `../mason-extensions`: `npm run test:e2e`

**Implemented** — PR #254

---

## CHANGE 2: Pi-Coding-Agent — Resume config and session ID capture

**Summary:** Add resume configuration to pi-coding-agent's `AgentPackage` and extend the generated Pi extension to capture the session ID into `meta.json` via a `session_start` event handler. References [PRD §5](PRD.md#5-pi-coding-agent-changes).

**User Story:** As a developer using `mason run --agent pi`, I want to be able to resume my Pi session with `mason run --resume` so that I can continue a multi-turn conversation without losing context.

**Changes:**

1. **`agents/pi-coding-agent/src/index.ts`** (in `mason-extensions`) — Add `resume` field to the `piCodingAgent` object:
   ```typescript
   resume: {
     flag: "--resume",
     sessionIdField: "agentSessionId",
   },
   ```

2. **`agents/pi-coding-agent/src/materializer.ts`** — In `generateExtensionIndexTs()`, add a `session_start` event handler inside the `export default (pi) => { ... }` block, **before** the MCP tool registration loop:
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

3. **`agents/pi-coding-agent/tests/materializer.test.ts`** — Add tests:
   - Generated extension index.ts contains `session_start` handler
   - Handler writes `agentSessionId` to meta.json path
   - Handler appears before MCP tool registration loop

4. **`agents/pi-coding-agent/tests/config-schema.test.ts`** or new test — Verify the `resume` config is set correctly on the agent package.

5. Run all tests and fix errors:
   - In `../mason-extensions`: `npm run lint`
   - In `../mason-extensions`: `npm run build`
   - In `../mason-extensions`: `npm run test`
   - In `../mason-extensions`: `npm run test:e2e`

**Not Implemented Yet**

---

## CHANGE 3: Codex-Agent — Resume config, hooks enablement, and session ID capture

**Summary:** Add resume configuration (with `position: "after-first"`) to codex-agent's `AgentPackage`, enable the `codex_hooks` feature flag in `config.toml`, and generate a `SessionStart` hook in `~/.codex/hooks.json` to capture the session ID into `meta.json`. References [PRD §6](PRD.md#6-codex-agent-changes).

**User Story:** As a developer using `mason run --agent codex`, I want to be able to resume my Codex session with `mason run --resume` so that I can continue a multi-turn conversation. The resume args must use `exec resume <id>` subcommand positioning.

**Changes:**

1. **`agents/codex-agent/src/index.ts`** (in `mason-extensions`) — Add `resume` field to the `codexAgent` object:
   ```typescript
   resume: {
     flag: "resume",
     sessionIdField: "agentSessionId",
     position: "after-first" as const,
   },
   ```

2. **`agents/codex-agent/src/materializer.ts`** — `materializeHome()`:
   - Append `[features]\ncodex_hooks = true\n` to the home-level `.codex/config.toml`.
   - Generate `~/.codex/hooks.json` with a `SessionStart` hook that reads `session_id` from stdin JSON and writes it to `/home/mason/.mason/session/meta.json` as `agentSessionId`. Use the same Node.js one-liner pattern as claude-code-agent.

3. **`agents/codex-agent/tests/materializer.test.ts`** — Add tests:
   - `materializeHome()` writes `codex_hooks = true` in the home config.toml
   - `materializeHome()` generates `~/.codex/hooks.json` with `SessionStart` hook
   - Hook command contains `agentSessionId` and `meta.json` path
   - `resume` config on agent package has correct flag, field, and position

4. Run all tests and fix errors:
   - In `../mason-extensions`: `npm run lint`
   - In `../mason-extensions`: `npm run build`
   - In `../mason-extensions`: `npm run test`
   - In `../mason-extensions`: `npm run test:e2e`
   - In `../mason` (this repo): `npm run lint` and `npm run build` (to ensure SDK type changes are compatible)

**Not Implemented Yet**
