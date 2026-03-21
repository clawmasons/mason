import { randomUUID } from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────

export interface CredentialAuditEntry {
  id: string;
  timestamp: string;
  agent_id: string;
  role: string;
  session_id: string;
  credential_key: string;
  outcome: "granted" | "denied" | "error";
  deny_reason: string | null;
  source: string | null;
}

/**
 * Callback interface for emitting audit entries.
 *
 * The caller provides an implementation that persists audit entries
 * (e.g., via AuditWriter JSONL or relay audit_event messages).
 */
export type AuditEmitter = (entry: CredentialAuditEntry) => void;

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Generate a unique ID for audit entries.
 */
export function generateAuditId(): string {
  return randomUUID();
}
