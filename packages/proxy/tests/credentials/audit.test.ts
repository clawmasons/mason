import { describe, it, expect } from "vitest";
import {
  generateAuditId,
  type AuditEmitter,
  type CredentialAuditEntry,
} from "../../src/credentials/audit.js";

describe("Credential Audit", () => {
  describe("generateAuditId", () => {
    it("generates unique IDs", () => {
      const id1 = generateAuditId();
      const id2 = generateAuditId();
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe("string");
    });

    it("generates UUID-format strings", () => {
      const id = generateAuditId();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe("AuditEmitter type", () => {
    it("accepts a function that receives CredentialAuditEntry", () => {
      const entries: CredentialAuditEntry[] = [];
      const emitter: AuditEmitter = (entry) => {
        entries.push(entry);
      };

      emitter({
        id: generateAuditId(),
        timestamp: new Date().toISOString(),
        agent_id: "test-agent",
        role: "test-role",
        session_id: "session-1",
        credential_key: "API_KEY",
        outcome: "granted",
        deny_reason: null,
        source: "env",
      });

      expect(entries).toHaveLength(1);
      expect(entries[0].credential_key).toBe("API_KEY");
      expect(entries[0].outcome).toBe("granted");
    });
  });
});
