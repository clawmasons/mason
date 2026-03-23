/**
 * File-based session logger.
 *
 * Writes timestamped log lines to `{logDir}/session.log`.
 * Used by ACP mode and print mode so that diagnostic
 * output never pollutes stdout.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface AcpLogger {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  close(): void;
}

/**
 * Create a file-appending logger that writes to `{logDir}/session.log`.
 * Creates the directory if it doesn't exist.
 */
export function createFileLogger(logDir: string): AcpLogger {
  fs.mkdirSync(logDir, { recursive: true });

  const logPath = path.join(logDir, "session.log");
  const stream = fs.createWriteStream(logPath, { flags: "a" });

  function write(level: string, args: unknown[]): void {
    const ts = new Date().toISOString();
    const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    stream.write(`${ts} [${level}] ${msg}\n`);
  }

  return {
    log(...args: unknown[]) {
      write("INFO", args);
    },
    error(...args: unknown[]) {
      write("ERROR", args);
    },
    close() {
      stream.end();
    },
  };
}
