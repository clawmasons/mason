/**
 * Subprocess execution wrapper for ACP prompt handling.
 *
 * Spawns `mason run --agent {agent} --role {role} -p {text}` as a child
 * process and collects stdout. Supports cancellation via AbortSignal.
 */

import { execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { acpLog, acpError } from "./acp-logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the mason CLI binary path.
 * Override with the MASON_BIN environment variable for dev environments.
 * Otherwise falls back to the local node_modules/.bin/mason symlink.
 */
function getMasonBinPath(): string {
  if (process.env.MASON_BIN) {
    return resolve(process.env.MASON_BIN);
  }
  // Go from packages/cli/dist/acp/ → repo root node_modules/.bin/mason
  return resolve(__dirname, "..", "..", "..", "..", "node_modules", ".bin", "mason");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecutePromptOptions {
  agent: string;
  role: string;
  text: string;
  cwd: string;
  signal?: AbortSignal;
  source?: string;
}

export interface ExecutePromptResult {
  output: string;
  cancelled: boolean;
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/**
 * Execute a prompt by spawning `mason run` as a subprocess.
 *
 * Returns the collected stdout output on success.
 * If the AbortSignal fires, returns `{ output: "", cancelled: true }`.
 * Throws on non-zero exit codes (unless aborted).
 */
export function executePrompt(options: ExecutePromptOptions): Promise<ExecutePromptResult> {
  const { agent, role, text, cwd, signal, source } = options;
  const masonBin = getMasonBinPath();
  acpLog("executePrompt: resolved mason bin", { masonBin });

  const args = [
    "run",
    "--agent", agent,
    "--role", role,
    ...(source ? ["--source", source] : []),
    "-p", text,
  ];
  acpLog("executePrompt: spawning", { bin: masonBin, args, cwd });

  return new Promise<ExecutePromptResult>((resolve, reject) => {
    // Check if already aborted
    if (signal?.aborted) {
      acpLog("executePrompt: already aborted before spawn");
      resolve({ output: "", cancelled: true });
      return;
    }

    const child = execFile(
      masonBin,
      args,
      { cwd, maxBuffer: 10 * 1024 * 1024 }, // 10 MB buffer
      (error, stdout, stderr) => {
        // Remove abort listener
        signal?.removeEventListener("abort", onAbort);

        if (error) {
          // Check if this was an abort (signal-based kill)
          if (signal?.aborted) {
            acpLog("executePrompt: aborted via signal");
            resolve({ output: "", cancelled: true });
            return;
          }
          // Non-abort error — subprocess failed
          const message = stderr?.trim() || error.message;
          acpError("executePrompt: failed", { error: message, stderr: stderr?.trim() });
          reject(new Error(`mason run failed: ${message}`));
          return;
        }

        acpLog("executePrompt: success", { stdoutLength: stdout.length });
        resolve({ output: stdout, cancelled: false });
      },
    );

    // Wire up abort signal to kill the child process
    function onAbort() {
      child.kill("SIGTERM");
    }

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

// ---------------------------------------------------------------------------
// Streaming Types
// ---------------------------------------------------------------------------

export interface ExecutePromptStreamingOptions {
  agent: string;
  role: string;
  text: string;
  cwd: string;
  signal?: AbortSignal;
  source?: string;
  onSessionUpdate: (update: Record<string, unknown>) => void;
  masonSessionId?: string;  // When set, use --resume instead of --agent/--role
  sessionId?: string;       // When set, pass as MASON_SESSION_ID env var so runAgentJsonMode reuses this session
}

export interface ExecutePromptStreamingResult {
  cancelled: boolean;
}

// ---------------------------------------------------------------------------
// Streaming Executor
// ---------------------------------------------------------------------------

/**
 * Execute a prompt by spawning `mason run --json` as a subprocess and
 * streaming each NDJSON line to the caller via the `onSessionUpdate` callback.
 *
 * Uses `child_process.spawn` (not `execFile`) so stdout can be read
 * line-by-line as it arrives. Each line is parsed as JSON; malformed lines
 * are logged and skipped.
 *
 * Returns `{ cancelled: true }` if the AbortSignal fires, otherwise
 * `{ cancelled: false }` after the process exits.
 */
export function executePromptStreaming(
  options: ExecutePromptStreamingOptions,
): Promise<ExecutePromptStreamingResult> {
  const { agent, role, text, cwd, signal, source, onSessionUpdate, masonSessionId, sessionId } = options;
  const masonBin = getMasonBinPath();
  acpLog("executePromptStreaming: resolved mason bin", { masonBin });

  const sourceArgs = source ? ["--source", source] : [];
  const args = masonSessionId
    ? ["run", "--resume", masonSessionId, ...sourceArgs, "--json", text]
    : ["run", "--agent", agent, "--role", role, ...sourceArgs, "--json", text];
  acpLog("executePromptStreaming: spawning", { bin: masonBin, args, cwd });

  return new Promise<ExecutePromptStreamingResult>((resolve, reject) => {
    // Check if already aborted
    if (signal?.aborted) {
      acpLog("executePromptStreaming: already aborted before spawn");
      resolve({ cancelled: true });
      return;
    }

    // Pass session ID via env var so runAgentJsonMode reuses the ACP session
    const env = { ...process.env };
    if (sessionId) {
      env.MASON_SESSION_ID = sessionId;
    }

    const child = spawn(masonBin, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });

    // Read stdout line-by-line
    // stdio: ["ignore", "pipe", "pipe"] guarantees stdout is a Readable
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed by stdio config
    const rl = createInterface({ input: child.stdout! });

    rl.on("line", (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return; // skip empty lines

      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        onSessionUpdate(parsed);
      } catch {
        acpError("executePromptStreaming: malformed JSON line, skipping", { line: trimmed });
      }
    });

    // Collect stderr for error reporting
    let stderrData = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrData += chunk.toString();
    });

    // Wire up abort signal to kill the child process
    function onAbort() {
      child.kill("SIGTERM");
    }

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    child.on("close", (code: number | null) => {
      signal?.removeEventListener("abort", onAbort);
      rl.close();

      if (signal?.aborted) {
        acpLog("executePromptStreaming: aborted via signal");
        resolve({ cancelled: true });
        return;
      }

      if (code !== 0 && code !== null) {
        const message = stderrData.trim() || `mason run exited with code ${code}`;
        acpError("executePromptStreaming: failed", { code, stderr: stderrData.trim() });
        reject(new Error(`mason run failed: ${message}`));
        return;
      }

      acpLog("executePromptStreaming: process exited", { code });
      resolve({ cancelled: false });
    });

    child.on("error", (err: Error) => {
      signal?.removeEventListener("abort", onAbort);
      rl.close();
      acpError("executePromptStreaming: spawn error", { error: err.message });
      reject(new Error(`mason run failed to spawn: ${err.message}`));
    });
  });
}
