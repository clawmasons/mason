import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CredentialService } from "../../src/credentials/service.js";
import { queryCredentialAudit } from "../../src/credentials/audit.js";
import type { CredentialRequest } from "../../src/credentials/schemas.js";

// Mock the keychain module to prevent actual keychain calls
vi.mock("../../src/credentials/keychain.js", () => ({
  queryKeychain: vi.fn().mockResolvedValue(undefined),
}));

describe("CredentialService", () => {
  let service: CredentialService;
  const envKeysToClean: string[] = [];

  function setEnv(key: string, value: string): void {
    process.env[key] = value;
    envKeysToClean.push(key);
  }

  beforeEach(() => {
    service = new CredentialService({
      dbPath: ":memory:",
      envFilePath: "/nonexistent/.env",
      keychainService: "test",
    });
  });

  afterEach(() => {
    service.close();
    for (const key of envKeysToClean) {
      process.env[key] = undefined;
    }
    envKeysToClean.length = 0;
  });

  function makeRequest(overrides: Partial<CredentialRequest> = {}): CredentialRequest {
    return {
      id: "req-1",
      key: "API_KEY",
      agentId: "test-agent",
      role: "test-role",
      sessionId: "session-1",
      declaredCredentials: ["API_KEY", "OTHER_KEY"],
      ...overrides,
    };
  }

  // ── Access Validation ──────────────────────────────────────────────

  describe("access validation", () => {
    it("grants access when key is in declaredCredentials", async () => {
      setEnv("API_KEY", "secret-value");
      const request = makeRequest();

      const response = await service.handleRequest(request);

      expect(response).toEqual({
        id: "req-1",
        key: "API_KEY",
        value: "secret-value",
        source: "env",
      });
    });

    it("denies access when key is NOT in declaredCredentials", async () => {
      setEnv("UNDECLARED_KEY", "secret");
      const request = makeRequest({
        key: "UNDECLARED_KEY",
        declaredCredentials: ["API_KEY"],
      });

      const response = await service.handleRequest(request);

      expect(response).toEqual({
        id: "req-1",
        key: "UNDECLARED_KEY",
        error: expect.stringContaining("has not declared"),
        code: "ACCESS_DENIED",
      });
    });

    it("denies access with empty declaredCredentials", async () => {
      setEnv("API_KEY", "secret");
      const request = makeRequest({ declaredCredentials: [] });

      const response = await service.handleRequest(request);

      expect(response).toHaveProperty("code", "ACCESS_DENIED");
    });
  });

  // ── Credential Resolution ─────────────────────────────────────────

  describe("credential resolution", () => {
    it("returns NOT_FOUND when credential exists in declarations but not in sources", async () => {
      const request = makeRequest({ key: "MISSING_KEY", declaredCredentials: ["MISSING_KEY"] });

      const response = await service.handleRequest(request);

      expect(response).toEqual({
        id: "req-1",
        key: "MISSING_KEY",
        error: expect.stringContaining("not found"),
        code: "NOT_FOUND",
      });
    });

    it("resolves from env when available", async () => {
      setEnv("MY_SECRET", "env-value");
      const request = makeRequest({
        key: "MY_SECRET",
        declaredCredentials: ["MY_SECRET"],
      });

      const response = await service.handleRequest(request);

      expect(response).toEqual({
        id: "req-1",
        key: "MY_SECRET",
        value: "env-value",
        source: "env",
      });
    });
  });

  // ── Audit Logging ─────────────────────────────────────────────────

  describe("audit logging", () => {
    it("logs granted access", async () => {
      setEnv("API_KEY", "value");
      await service.handleRequest(makeRequest());

      const entries = queryCredentialAudit(service.getDatabase());
      expect(entries).toHaveLength(1);
      expect(entries[0].outcome).toBe("granted");
      expect(entries[0].agent_id).toBe("test-agent");
      expect(entries[0].credential_key).toBe("API_KEY");
      expect(entries[0].source).toBe("env");
      expect(entries[0].deny_reason).toBeNull();
    });

    it("logs denied access", async () => {
      await service.handleRequest(
        makeRequest({ key: "FORBIDDEN", declaredCredentials: ["API_KEY"] }),
      );

      const entries = queryCredentialAudit(service.getDatabase());
      expect(entries).toHaveLength(1);
      expect(entries[0].outcome).toBe("denied");
      expect(entries[0].deny_reason).toContain("has not declared");
    });

    it("logs resolution errors", async () => {
      await service.handleRequest(
        makeRequest({ key: "MISSING", declaredCredentials: ["MISSING"] }),
      );

      const entries = queryCredentialAudit(service.getDatabase());
      expect(entries).toHaveLength(1);
      expect(entries[0].outcome).toBe("error");
      expect(entries[0].deny_reason).toContain("not found");
    });

    it("records session and role metadata", async () => {
      setEnv("API_KEY", "value");
      await service.handleRequest(
        makeRequest({ sessionId: "sess-42", role: "admin-role" }),
      );

      const entries = queryCredentialAudit(service.getDatabase());
      expect(entries[0].session_id).toBe("sess-42");
      expect(entries[0].role).toBe("admin-role");
    });
  });
});
