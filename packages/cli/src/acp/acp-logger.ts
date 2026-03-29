/**
 * ACP file logger singleton.
 *
 * Two loggers:
 * 1. **Startup logger** — writes to `~/.mason/acp-start.log` immediately on
 *    import. Captures everything from process launch through `initialize` and
 *    the beginning of `newSession`, before a project CWD is known.
 * 2. **CWD logger** — initialized once `session/new` provides a `cwd`.
 *    Writes to `{cwd}/.mason/logs/acp.log`. The startup logger is closed
 *    at handoff time.
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { type FileLogger, createFileLogger } from "../utils/file-logger.js";

// ---------------------------------------------------------------------------
// Startup logger — active from import until CWD handoff
// ---------------------------------------------------------------------------

let startupLogger: FileLogger | undefined = createFileLogger(
  join(homedir(), ".mason"),
  "acp-start.log",
);
startupLogger.log("ACP startup logger initialized");

/** Log an informational message to the startup logger. No-op after handoff. */
export function acpStartupLog(...args: unknown[]): void {
  startupLogger?.log(...args);
}

/** Log an error message to the startup logger. No-op after handoff. */
export function acpStartupError(...args: unknown[]): void {
  startupLogger?.error(...args);
}

// ---------------------------------------------------------------------------
// CWD logger — active after initAcpLogger(cwd)
// ---------------------------------------------------------------------------

let logger: FileLogger | undefined;

/**
 * Initialize the ACP logger for a project directory.
 * Idempotent — subsequent calls with the same or different cwd are ignored
 * once a logger exists. Call `closeAcpLogger()` first to reinitialize.
 *
 * Closes the startup logger at handoff time.
 */
export function initAcpLogger(cwd: string): void {
  if (logger) return;
  const logDir = join(cwd, ".mason", "logs");

  // Final startup log entries before handoff
  if (startupLogger) {
    startupLogger.log(`Handing off to CWD logger: ${join(logDir, "acp.log")}`);
    startupLogger.close();
    startupLogger = undefined;
  }

  logger = createFileLogger(logDir, "acp.log");
  logger.log("CWD logger initialized", { cwd });
}

/** Log an informational message. No-op before `initAcpLogger`. */
export function acpLog(...args: unknown[]): void {
  logger?.log(...args);
}

/** Log an error message. No-op before `initAcpLogger`. */
export function acpError(...args: unknown[]): void {
  logger?.error(...args);
}

/** Close all underlying write streams. */
export function closeAcpLogger(): void {
  startupLogger?.close();
  startupLogger = undefined;
  logger?.close();
  logger = undefined;
}
