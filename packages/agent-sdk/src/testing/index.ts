/**
 * Shared E2E test utilities for mason agent packages.
 *
 * Provides workspace setup, CLI execution helpers, Docker utilities,
 * and fixture management. Importable as `@clawmasons/agent-sdk/testing`.
 *
 * Dependency constraint: This module MUST NOT import from @clawmasons/cli,
 * @clawmasons/mcp-agent, or any agent implementation package. Only Node.js
 * built-ins and @agentclientprotocol/sdk are allowed.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync, execSync, spawn, type ChildProcess } from "node:child_process";

export type { ChildProcess };
import { fileURLToPath } from "node:url";
import type { AcpSessionUpdate } from "../types.js";

// ── Logging Helpers ─────────────────────────────────────────────────────

/**
 * Format a single AcpSessionUpdate into a readable one-liner for logging.
 */
export function formatUpdate(u: AcpSessionUpdate): string {
  switch (u.sessionUpdate) {
    case "tool_call":
      return `[tool_call] "${u.title}" (id=${u.toolCallId}, kind=${u.kind ?? "?"}, status=${u.status ?? "?"})`;
    case "tool_call_update":
      return `[tool_call_update] id=${u.toolCallId} status=${u.status ?? "?"} title=${u.title ?? ""}`;
    case "agent_message_chunk": {
      const text = u.content.text;
      return `[message] "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`;
    }
    case "agent_thought_chunk": {
      const text = u.content.text;
      return `[thought] "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`;
    }
    case "plan":
      return `[plan] ${u.entries.length} entries`;
    case "current_mode_update":
      return `[mode] modeId="${u.modeId}"`;
    default:
      return `[${(u as { sessionUpdate: string }).sessionUpdate}]`;
  }
}

/**
 * Log a summary of all updates, focusing on tool calls with their final status.
 */
export function logUpdatesSummary(updates: AcpSessionUpdate[]): void {
  const toolCalls = updates.filter((u) => u.sessionUpdate === "tool_call");
  const toolUpdates = updates.filter((u) => u.sessionUpdate === "tool_call_update");
  const messages = updates.filter((u) => u.sessionUpdate === "agent_message_chunk");
  const thoughts = updates.filter((u) => u.sessionUpdate === "agent_thought_chunk");

  console.log("── Tool Call Summary ──");
  if (toolCalls.length === 0) {
    console.log("  (no tool calls)");
  } else {
    for (const tc of toolCalls) {
      if (tc.sessionUpdate !== "tool_call") continue;
      const finalUpdate = [...toolUpdates]
        .reverse()
        .find((u) => u.sessionUpdate === "tool_call_update" && u.toolCallId === tc.toolCallId);
      const finalStatus =
        (finalUpdate as { status?: string } | undefined)?.status ?? tc.status ?? "?";
      console.log(
        `  "${tc.title}" (id=${tc.toolCallId}, kind=${tc.kind ?? "?"}, final_status=${finalStatus})`,
      );
    }
  }
  console.log(
    `Total updates: ${updates.length} | Tool calls: ${toolCalls.length} | Messages: ${messages.length} | Thoughts: ${thoughts.length}`,
  );
}

// ── Path Constants ──────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the monorepo root by walking up from this file until we find
 * a package.json with a "workspaces" field.
 */
function findProjectRoot(): string {
  // At runtime this file is at:
  //   packages/agent-sdk/dist/testing/index.js  (compiled)
  //   packages/agent-sdk/src/testing/index.ts   (source / ts-node)
  // Walk up to find the monorepo root.
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.workspaces) {
          return dir;
        }
      } catch {
        // Not valid JSON, keep walking
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  throw new Error(
    "Cannot resolve monorepo root. Ensure @clawmasons/agent-sdk is inside the mason monorepo.",
  );
}

/** Absolute path to the monorepo root. */
export const PROJECT_ROOT: string = findProjectRoot();

/** Absolute path to the `scripts/mason.js` CLI entry point. */
export const MASON_BIN: string = path.join(PROJECT_ROOT, "scripts", "mason.js");

/** Absolute path to `packages/agent-sdk/fixtures/`. */
export const FIXTURES_DIR: string = path.join(
  PROJECT_ROOT,
  "packages",
  "agent-sdk",
  "fixtures",
);

// ── Internal Helpers ────────────────────────────────────────────────────

/** Workspace directories to copy from fixtures by default. */
const WORKSPACE_DIRS = [
  "apps",
  "tasks",
  "skills",
  "roles",
  "agents",
  ".mason",
  ".claude",
];

/**
 * Recursively copy a directory tree, skipping node_modules and .git.
 */
function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Copy a fixture workspace to a temporary directory.
 *
 * @param name - A short name used in the temp dir path (e.g., "build-pipeline")
 * @param opts.fixture - Fixture directory name under FIXTURES_DIR (default: "claude-test-project")
 * @param opts.excludePaths - Relative paths within the workspace to remove after copying
 * @param opts.extraDirs - Additional directories to copy beyond the default WORKSPACE_DIRS set
 * @returns Absolute path to the created workspace directory
 */
export function copyFixtureWorkspace(
  name: string,
  opts?: {
    fixture?: string;
    excludePaths?: string[];
    extraDirs?: string[];
  },
): string {
  const fixtureName = opts?.fixture ?? "claude-test-project";
  const fixtureDir = path.join(FIXTURES_DIR, fixtureName);

  if (!fs.existsSync(fixtureDir)) {
    throw new Error(
      `Fixture '${fixtureName}' not found in ${FIXTURES_DIR}.`,
    );
  }

  const timestamp = Date.now();
  const workspaceDir = path.join(
    os.tmpdir(),
    `mason-e2e-${name}-${timestamp}`,
  );
  fs.mkdirSync(workspaceDir, { recursive: true });

  // Copy root package.json
  const pkgSrc = path.join(fixtureDir, "package.json");
  if (fs.existsSync(pkgSrc)) {
    fs.copyFileSync(pkgSrc, path.join(workspaceDir, "package.json"));
  }

  // Copy workspace directories (defaults + extras)
  const dirsToProcess = [
    ...WORKSPACE_DIRS,
    ...(opts?.extraDirs ?? []),
  ];

  for (const wsDir of dirsToProcess) {
    const fixtureSrc = path.join(fixtureDir, wsDir);
    const workspaceDest = path.join(workspaceDir, wsDir);
    if (fs.existsSync(fixtureSrc)) {
      copyDirRecursive(fixtureSrc, workspaceDest);
    } else {
      fs.mkdirSync(workspaceDest, { recursive: true });
    }
  }

  // Remove excluded paths
  if (opts?.excludePaths) {
    for (const rel of opts.excludePaths) {
      const full = path.join(workspaceDir, rel);
      if (fs.existsSync(full)) {
        fs.rmSync(full, { recursive: true, force: true });
      }
    }
  }

  return workspaceDir;
}

/**
 * Run a `mason` CLI command and return stdout.
 * Throws on non-zero exit code.
 */
export function masonExec(
  args: string[],
  cwd: string,
  opts?: { timeout?: number },
): string {
  return execFileSync("node", [MASON_BIN, ...args], {
    cwd,
    stdio: "pipe",
    timeout: opts?.timeout ?? 30_000,
  }).toString();
}

/**
 * Run a `mason` CLI command with --json and parse the output.
 */
export function masonExecJson<T>(
  args: string[],
  cwd: string,
  opts?: { timeout?: number },
): T {
  const output = masonExec(args, cwd, opts);
  return JSON.parse(output) as T;
}

/**
 * Run a `mason` CLI command that is expected to fail (non-zero exit code).
 * Returns { stdout, stderr, exitCode }.
 */
export function masonExecExpectError(
  args: string[],
  cwd: string,
  opts?: { timeout?: number },
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [MASON_BIN, ...args], {
      cwd,
      stdio: "pipe",
      timeout: opts?.timeout ?? 30_000,
    }).toString();
    // If it didn't throw, the command succeeded unexpectedly
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
      exitCode: e.status ?? 1,
    };
  }
}

/**
 * Check if Docker daemon is available.
 */
export function isDockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "pipe", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Poll a health endpoint until it responds with 200 or timeout is reached.
 * On failure, fetches Docker Compose logs for diagnostics.
 */
export async function waitForHealth(
  url: string,
  timeoutMs: number,
  diagnostics?: {
    composeProject: string;
    composeFile: string;
    service: string;
  },
): Promise<void> {
  const start = Date.now();
  let ready = false;

  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        ready = true;
        break;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }

  if (!ready) {
    let msg = `Health endpoint ${url} did not become ready within ${timeoutMs}ms.`;
    if (diagnostics) {
      try {
        const logs = execSync(
          `docker compose -p ${diagnostics.composeProject} -f "${diagnostics.composeFile}" logs ${diagnostics.service}`,
          { stdio: "pipe" },
        ).toString();
        msg += `\nDocker logs:\n${logs}`;
      } catch {
        /* best effort */
      }
    }
    throw new Error(msg);
  }
}

/**
 * Tear down Docker Compose sessions in a workspace's `.mason/sessions/` directory.
 * Best-effort: logs errors but does not throw.
 */
export function cleanupDockerSessions(workspaceDir: string): void {
  const sessionsDir = path.join(workspaceDir, ".mason", "sessions");
  if (!fs.existsSync(sessionsDir)) return;

  for (const sessionId of fs.readdirSync(sessionsDir)) {
    const composeFile = path.join(
      sessionsDir,
      sessionId,
      "docker-compose.yaml",
    );
    if (fs.existsSync(composeFile)) {
      try {
        execSync(
          `docker compose -f "${composeFile}" down --rmi local --volumes`,
          { stdio: "pipe", timeout: 60_000 },
        );
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}

/**
 * Assert that a CLI process and its Docker sessions have stopped.
 * Call this at the end of a test to verify graceful shutdown.
 * Throws if the process is still alive or Docker containers are still running.
 */
export function testIfProcessAndDockerStopped(
  pid: number,
  workspaceDir: string,
): void {
  // Check if process is still alive
  try {
    process.kill(pid, 0); // signal 0 = existence check, doesn't kill
    throw new Error(
      `CLI process (pid ${pid}) is still running after graceful shutdown`,
    );
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== "ESRCH") {
      // ESRCH = no such process (good — it exited). Any other error means it's still alive.
      throw new Error(
        `CLI process (pid ${pid}) is still running after graceful shutdown`,
      );
    }
  }

  // Check if any Docker Compose sessions still have running containers
  const sessionsDir = path.join(workspaceDir, ".mason", "sessions");
  if (!fs.existsSync(sessionsDir)) return;

  for (const sessionId of fs.readdirSync(sessionsDir)) {
    const composeFile = path.join(
      sessionsDir,
      sessionId,
      "docker-compose.yaml",
    );
    if (!fs.existsSync(composeFile)) continue;

    try {
      const output = execSync(
        `docker compose -f "${composeFile}" ps -q`,
        { stdio: "pipe", timeout: 10_000 },
      ).toString().trim();

      if (output.length > 0) {
        throw new Error(
          `Docker containers still running for session ${sessionId}. Container IDs: ${output}`,
        );
      }
    } catch (err: unknown) {
      // Re-throw our own assertion errors
      if (err instanceof Error && err.message.includes("Docker containers still running")) {
        throw err;
      }
      // Ignore docker command failures (compose file might reference removed networks, etc.)
    }
  }
}

/**
 * Best-effort cleanup: kill a CLI process, tear down Docker sessions, and remove the workspace.
 * Suitable for `afterAll` — never throws.
 */
export async function stopProcessAndDocker(
  proc: ChildProcess | null,
  workspaceDir: string,
): Promise<void> {
  // Kill CLI process with escalation
  if (proc && !proc.killed) {
    proc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 3_000));
    if (!proc.killed) {
      proc.kill("SIGKILL");
    }
  }

  // Tear down Docker sessions
  if (workspaceDir) {
    try {
      cleanupDockerSessions(workspaceDir);
    } catch {
      /* best-effort */
    }
  }

  // Remove workspace (skip if MASON_TEST_KEEP_WORKSPACE is set, for debugging)
  if (workspaceDir && fs.existsSync(workspaceDir)) {
    if (process.env.MASON_TEST_KEEP_WORKSPACE) {
      console.log(`[MASON_TEST_KEEP_WORKSPACE] Preserved workspace: ${workspaceDir}`);
    } else {
      try {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  }
}

/**
 * Assert that the session log exists and contains the given text.
 * Print mode writes to `.mason/logs/session.log`.
 */
export function testSessionLogContains(workspaceDir: string, text: string): void {
  const logPath = path.join(workspaceDir, ".mason", "logs", "session.log");
  if (!fs.existsSync(logPath)) {
    throw new Error(`session.log not found at ${logPath}`);
  }
  const contents = fs.readFileSync(logPath, "utf-8");
  if (!contents.includes(text)) {
    throw new Error(
      `session.log does not contain "${text}".\nLog contents:\n${contents.slice(0, 2000)}`,
    );
  }
}

/**
 * Assert that a file in the workspace exists and contains the expected text.
 */
export function testFileContents(workspaceDir: string, relPath: string, expected: string): void {
  const filePath = path.join(workspaceDir, relPath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const contents = fs.readFileSync(filePath, "utf-8");
  if (!contents.includes(expected)) {
    throw new Error(
      `File ${relPath} does not contain "${expected}".\nFile contents:\n${contents.slice(0, 2000)}`,
    );
  }
}

/**
 * Spawn mason in print mode and wait for it to exit.
 * Returns the child process (for pid inspection) and captured output.
 *
 * @param args - CLI arguments to pass after `mason`
 * @param cwd - Working directory
 * @param opts.timeout - Kill the process after this many ms (default: 300_000)
 * @param opts.env - Extra environment variables merged onto `process.env`
 */
export function runMasonPrint(
  args: string[],
  cwd: string,
  opts?: { timeout?: number; env?: Record<string, string> },
): Promise<{ proc: ChildProcess; stdout: string; stderr: string; exitCode: number | null }> {
  const timeoutMs = opts?.timeout ?? 300_000;

  console.log(`[runMasonPrint] mason ${args.join(" ")} (cwd=${cwd})`);

  return new Promise((resolve) => {
    const proc = spawn("node", [MASON_BIN, ...args], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ...opts?.env,
      },
    });

    let stdout = "";
    let stderr = "";

    if (proc.stdout) {
      proc.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
    }
    if (proc.stderr) {
      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
    }

    const timer = setTimeout(() => {
      console.log(`[runMasonPrint] TIMEOUT after ${timeoutMs}ms — killing process`);
      proc.kill("SIGKILL");
      resolve({ proc, stdout, stderr, exitCode: null });
    }, timeoutMs);

    proc.on("exit", (code) => {
      clearTimeout(timer);
      console.log(`[runMasonPrint] exited with code ${code}`);
      resolve({ proc, stdout, stderr, exitCode: code });
    });
  });
}

/**
 * Spawn mason in JSON mode and wait for it to exit.
 * Returns the child process, captured output, and parsed NDJSON updates.
 *
 * Delegates to {@link runMasonPrint} for process spawning, then parses
 * stdout as newline-delimited JSON into `AcpSessionUpdate[]`.
 *
 * @param args - CLI arguments to pass after `mason` (should include `--json <prompt>`)
 * @param cwd - Working directory
 * @param opts.timeout - Kill the process after this many ms (default: 300_000)
 * @param opts.env - Extra environment variables merged onto `process.env`
 */
export async function runMasonJson(
  args: string[],
  cwd: string,
  opts?: { timeout?: number; env?: Record<string, string> },
): Promise<{
  proc: ChildProcess;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  updates: AcpSessionUpdate[];
}> {
  const result = await runMasonPrint(args, cwd, opts);
  const updates: AcpSessionUpdate[] = [];
  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const update = JSON.parse(trimmed) as AcpSessionUpdate;
      console.log(`[runMasonJson] ${formatUpdate(update)}`);
      updates.push(update);
    } catch {
      console.log(`[runMasonJson] skipped non-JSON: ${trimmed.slice(0, 120)}`);
    }
  }
  logUpdatesSummary(updates);
  return { ...result, updates };
}

export { runMasonACP, type AcpResult } from "./acp-client.js";

