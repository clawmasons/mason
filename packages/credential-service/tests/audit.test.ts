import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  openCredentialDatabase,
  insertCredentialAudit,
  queryCredentialAudit,
  generateAuditId,
  type CredentialAuditEntry,
} from "../src/audit.js";
import type Database from "better-sqlite3";

describe("Credential Audit", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openCredentialDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  function makeEntry(overrides: Partial<CredentialAuditEntry> = {}): CredentialAuditEntry {
    return {
      id: generateAuditId(),
      timestamp: new Date().toISOString(),
      agent_id: "test-agent",
      role: "test-role",
      session_id: "session-1",
      credential_key: "API_KEY",
      outcome: "granted",
      deny_reason: null,
      source: "env",
      ...overrides,
    };
  }

  describe("insertCredentialAudit", () => {
    it("inserts an audit entry", () => {
      const entry = makeEntry();
      insertCredentialAudit(db, entry);

      const rows = queryCredentialAudit(db);
      expect(rows).toHaveLength(1);
      expect(rows[0].agent_id).toBe("test-agent");
      expect(rows[0].credential_key).toBe("API_KEY");
      expect(rows[0].outcome).toBe("granted");
    });

    it("stores deny_reason and source correctly", () => {
      const entry = makeEntry({
        outcome: "denied",
        deny_reason: "Not declared",
        source: null,
      });
      insertCredentialAudit(db, entry);

      const rows = queryCredentialAudit(db);
      expect(rows[0].deny_reason).toBe("Not declared");
      expect(rows[0].source).toBeNull();
    });
  });

  describe("queryCredentialAudit", () => {
    it("returns empty array for empty table", () => {
      const rows = queryCredentialAudit(db);
      expect(rows).toEqual([]);
    });

    it("filters by agent_id", () => {
      insertCredentialAudit(db, makeEntry({ agent_id: "agent-a" }));
      insertCredentialAudit(db, makeEntry({ agent_id: "agent-b" }));

      const rows = queryCredentialAudit(db, { agent_id: "agent-a" });
      expect(rows).toHaveLength(1);
      expect(rows[0].agent_id).toBe("agent-a");
    });

    it("filters by outcome", () => {
      insertCredentialAudit(db, makeEntry({ outcome: "granted" }));
      insertCredentialAudit(db, makeEntry({ outcome: "denied", deny_reason: "reason" }));
      insertCredentialAudit(db, makeEntry({ outcome: "granted" }));

      const rows = queryCredentialAudit(db, { outcome: "denied" });
      expect(rows).toHaveLength(1);
      expect(rows[0].outcome).toBe("denied");
    });

    it("filters by credential_key", () => {
      insertCredentialAudit(db, makeEntry({ credential_key: "KEY_A" }));
      insertCredentialAudit(db, makeEntry({ credential_key: "KEY_B" }));

      const rows = queryCredentialAudit(db, { credential_key: "KEY_A" });
      expect(rows).toHaveLength(1);
      expect(rows[0].credential_key).toBe("KEY_A");
    });

    it("filters by session_id", () => {
      insertCredentialAudit(db, makeEntry({ session_id: "sess-1" }));
      insertCredentialAudit(db, makeEntry({ session_id: "sess-2" }));

      const rows = queryCredentialAudit(db, { session_id: "sess-1" });
      expect(rows).toHaveLength(1);
    });

    it("respects limit", () => {
      insertCredentialAudit(db, makeEntry());
      insertCredentialAudit(db, makeEntry());
      insertCredentialAudit(db, makeEntry());

      const rows = queryCredentialAudit(db, { limit: 2 });
      expect(rows).toHaveLength(2);
    });

    it("orders by timestamp descending", () => {
      insertCredentialAudit(db, makeEntry({ timestamp: "2026-01-01T00:00:00Z", credential_key: "OLD" }));
      insertCredentialAudit(db, makeEntry({ timestamp: "2026-03-01T00:00:00Z", credential_key: "NEW" }));

      const rows = queryCredentialAudit(db);
      expect(rows[0].credential_key).toBe("NEW");
      expect(rows[1].credential_key).toBe("OLD");
    });
  });

  describe("generateAuditId", () => {
    it("generates unique IDs", () => {
      const id1 = generateAuditId();
      const id2 = generateAuditId();
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe("string");
    });
  });
});
