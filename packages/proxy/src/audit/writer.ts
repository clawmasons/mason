import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { CLI_NAME_LOWERCASE } from "@clawmasons/shared";
import type { AuditEventMessage } from "../relay/messages.js";

// ── Default Path ────────────────────────────────────────────────────────

const DEFAULT_AUDIT_PATH = join(
  homedir(),
  `.${CLI_NAME_LOWERCASE}`,
  "data",
  "audit.jsonl",
);

// ── AuditWriter ─────────────────────────────────────────────────────────

/**
 * Host-side audit log writer that appends `audit_event` messages
 * as JSON lines to a JSONL file.
 */
export class AuditWriter {
  private readonly filePath: string;
  private dirEnsured = false;

  constructor(config?: { filePath?: string }) {
    this.filePath = config?.filePath ?? DEFAULT_AUDIT_PATH;
  }

  /**
   * Append an audit event as a single JSON line.
   */
  write(event: AuditEventMessage): void {
    if (!this.dirEnsured) {
      mkdirSync(dirname(this.filePath), { recursive: true });
      this.dirEnsured = true;
    }

    const line = JSON.stringify(event) + "\n";
    appendFileSync(this.filePath, line, "utf-8");
  }

  /**
   * Close the writer. No-op since appendFileSync does not hold a file handle.
   */
  close(): void {
    // No-op — appendFileSync opens and closes the file each call
  }

  /** Get the configured file path (for testing/logging). */
  getFilePath(): string {
    return this.filePath;
  }
}
