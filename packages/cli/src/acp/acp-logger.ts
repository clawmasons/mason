/**
 * ACP file logger singleton.
 *
 * Initialized once `session/new` provides a `cwd`. Before that, log calls
 * are silently dropped. Writes to `{cwd}/.mason/logs/acp.log`.
 */

import { join } from "node:path";
import { type FileLogger, createFileLogger } from "../utils/file-logger.js";

let logger: FileLogger | undefined;

/**
 * Initialize the ACP logger for a project directory.
 * Idempotent — subsequent calls with the same or different cwd are ignored
 * once a logger exists. Call `closeAcpLogger()` first to reinitialize.
 */
export function initAcpLogger(cwd: string): void {
  if (logger) return;
  const logDir = join(cwd, ".mason", "logs");
  logger = createFileLogger(logDir, "acp.log");
}

/** Log an informational message. No-op before `initAcpLogger`. */
export function acpLog(...args: unknown[]): void {
  logger?.log(...args);
}

/** Log an error message. No-op before `initAcpLogger`. */
export function acpError(...args: unknown[]): void {
  logger?.error(...args);
}

/** Close the underlying write stream. */
export function closeAcpLogger(): void {
  logger?.close();
  logger = undefined;
}
