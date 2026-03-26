/**
 * Subprocess execution wrapper for ACP prompt handling.
 *
 * Spawns `mason run --agent {agent} --role {role} -p {text}` as a child
 * process and collects stdout. Supports cancellation via AbortSignal.
 */

import { execFile } from "node:child_process";
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
  const { agent, role, text, cwd, signal } = options;
  const masonBin = getMasonBinPath();
  acpLog("executePrompt: resolved mason bin", { masonBin });

  const args = [
    "run",
    "--agent", agent,
    "--role", role,
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
