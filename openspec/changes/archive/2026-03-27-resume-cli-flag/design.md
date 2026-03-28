## Design

### Command Registration (`registerRunCommand` in `run-agent.ts`)

Add the `--resume` option to the `run` command using Commander's `.option()`:

```typescript
.option("--resume [session-id]", "Resume a previous session (default: latest)")
```

This is an optional option with an optional value. When `--resume` is provided without a value, `options.resume` is `true`. When provided with a value, it's the string session ID. When omitted entirely, it's `undefined`.

### Action Handler Changes (`createRunAction` in `run-agent.ts`)

Add `resume?: string | boolean` to the options type on `createRunAction`. When `resume` is truthy, enter the resume flow early in the handler -- before agent/role resolution, config resolution, and Docker build:

```typescript
if (options.resume) {
  await handleResume(projectDir, options);
  return;
}
```

### Resume Handler (`handleResume` in `run-agent.ts`)

New function that encapsulates the full resume flow:

**1. Resolve session ID:**
```typescript
let sessionId: string;
if (options.resume === true || options.resume === "latest") {
  const latest = await resolveLatestSession(projectDir);
  if (!latest) {
    console.error("Error: No latest session found. ...");
    process.exit(1);
  }
  sessionId = latest;
} else {
  sessionId = options.resume;
}
```

**2. Load and validate session:**
```typescript
const session = await readSession(projectDir, sessionId);
if (!session) {
  // Print error with available sessions list
  await printSessionNotFoundError(sessionId, projectDir);
  process.exit(1);
}
if (session.closed) {
  console.error(`Error: Session "${sessionId}" is closed.`);
  process.exit(1);
}
```

**3. Validate Docker image:**
```typescript
const imageName = getResumeImageName(projectDir, session);
try {
  execSync(`docker image inspect ${imageName}`, { stdio: "ignore" });
} catch {
  console.error(`Error: Docker image "${imageName}" not found.`);
  process.exit(1);
}
```

The image name is derived from the compose file's agent service image field. Since compose files are already generated with an `image:` directive, we parse it from the existing `docker-compose.yaml` in the session directory.

**4. Warn on ignored flags:**
```typescript
if (options.agent) {
  console.warn("Warning: --agent is ignored when resuming a session (agent is fixed at session creation).");
}
if (options.role) {
  console.warn("Warning: --role is ignored when resuming a session (role is fixed at session creation).");
}
```

**5. Resolve resume args and generate agent-launch.json:**
```typescript
const agentPkg = getAgentFromRegistry(session.agent);
let resumeId: string | undefined;
if (session.agentSessionId && agentPkg?.resume) {
  const field = agentPkg.resume.sessionIdField as keyof Session;
  resumeId = session[field] as string | undefined;
}
```

Then call `refreshAgentLaunchJson()` with a new `resumeId` option. Update `refreshAgentLaunchJson` to accept `resumeId` in its options and post-process the generated launch JSON:

```typescript
// In refreshAgentLaunchJson, after getting launchJson from materializer:
if (options?.resumeId && launchJson) {
  const agentPkg = getAgentFromRegistry(agentType);
  if (agentPkg?.resume) {
    const parsed = JSON.parse(launchJson);
    parsed.args = [...(parsed.args ?? []), agentPkg.resume.flag, options.resumeId];
    launchJson = JSON.stringify(parsed, null, 2);
  }
}
```

This post-processing approach works regardless of which materializer generated the launch JSON, avoiding the need to modify external materializer packages.

**6. Launch Docker compose:**

Reuse the existing session's `docker-compose.yaml`. Call `updateSession()` to update `lastUpdated`. Then launch via `execComposeCommand()` the same way `runAgentInteractiveMode` does -- start proxy, wait for health, start host proxy, run agent.

### Available Sessions Error Listing

When a session is not found, display available sessions with formatting:

```typescript
async function printSessionNotFoundError(sessionId: string, cwd: string): Promise<void> {
  const sessions = await listSessions(cwd);
  console.error(`\nError: Cannot resume session "${sessionId}" -- session not found.\n`);
  if (sessions.length > 0) {
    console.error("Available sessions:");
    for (const s of sessions) {
      const shortId = s.sessionId.slice(0, 8);
      const prompt = s.firstPrompt ? `"${s.firstPrompt.slice(0, 40)}"` : "(no prompt)";
      const ago = formatRelativeTime(s.lastUpdated);
      console.error(`  ${shortId}  ${s.agent} / ${s.role}  ${prompt}  (${ago})`);
    }
  }
  console.error(`\nRun "mason run --resume <session-id>" with a valid session.\n`);
}
```

### `refreshAgentLaunchJson` Options Update

Add `resumeId?: string` to the options type:

```typescript
function refreshAgentLaunchJson(
  roleType: Role,
  agentType: string,
  sessionDir: string,
  options?: {
    agentConfigCredentials?: string[];
    agentArgs?: string[];
    initialPrompt?: string;
    llmConfig?: { provider: string; model: string };
    printMode?: boolean;
    jsonMode?: boolean;
    resumeId?: string;  // NEW
  },
): void
```

### Docker Image Validation

Parse the existing `docker-compose.yaml` from the session directory to extract the agent service's image name. Use `docker image inspect` (sync via `execSync`) to validate the image exists locally.

### Relative Time Formatting

Add a simple `formatRelativeTime(isoDate: string): string` helper that returns human-readable relative times like "2 hours ago", "yesterday", "3 days ago".

### Files Changed

| File | Change |
|------|--------|
| `packages/cli/src/cli/commands/run-agent.ts` | Add `--resume` option to `registerRunCommand()`, add resume flow to `createRunAction()`, add `handleResume()`, add `printSessionNotFoundError()`, add `formatRelativeTime()`, update `refreshAgentLaunchJson()` with `resumeId` option |
| `packages/shared/src/session/index.ts` | Ensure `listSessions` and `readSession` are exported (already are) |
| `packages/cli/tests/cli/run-agent.test.ts` | Add test suite covering all 10 testable outputs |

### Test Coverage

Tests added to `packages/cli/tests/cli/run-agent.test.ts`:

1. **Command registration**: `--resume` option exists on the `run` command
2. **Resolve latest**: `mason run --resume` calls `resolveLatestSession()` and uses the result
3. **Explicit session ID**: `mason run --resume <id>` uses the provided ID
4. **"latest" keyword**: `mason run --resume latest` is equivalent to no ID
5. **Session not found**: Error message includes available sessions listing
6. **Closed session**: Error when `session.closed === true`
7. **Docker image missing**: Error when `docker image inspect` fails
8. **--agent warning**: Warning printed to stderr when `--agent` used with `--resume`
9. **--role warning**: Warning printed to stderr when `--role` used with `--resume`
10. **agent-launch.json resume args**: Generated launch JSON includes `[resume.flag, agentSessionId]`
11. **agent-launch.json prompt**: Generated launch JSON includes the new prompt from `-p` flag

### Interactions with Future Changes

- **CHANGE 7 (ACP Automatic Resume)** will invoke the resume flow programmatically by spawning `mason run --resume <sessionId>`. The CLI flag and validation logic from this change handle all the heavy lifting -- ACP just needs to pass the right session ID.
