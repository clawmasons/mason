import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionStore, handleConnectAgent } from "../../src/handlers/connect-agent.js";
import type { IncomingMessage, ServerResponse } from "node:http";

// ── SessionStore Tests ─────────────────────────────────────────────────

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
  });

  it("creates a session with unique id and token", () => {
    const entry = store.create("test-agent", "test-role");

    expect(entry.sessionId).toBeDefined();
    expect(entry.sessionToken).toBeDefined();
    expect(entry.sessionToken).toHaveLength(64); // 32 bytes hex
    expect(entry.agentId).toBe("test-agent");
    expect(entry.role).toBe("test-role");
    expect(entry.connectedAt).toBeDefined();
  });

  it("creates unique sessions", () => {
    const entry1 = store.create("agent-1", "role-1");
    const entry2 = store.create("agent-2", "role-2");

    expect(entry1.sessionId).not.toBe(entry2.sessionId);
    expect(entry1.sessionToken).not.toBe(entry2.sessionToken);
  });

  it("looks up session by token", () => {
    const entry = store.create("test-agent", "test-role");
    const found = store.getByToken(entry.sessionToken);

    expect(found).toBeDefined();
    expect(found!.sessionId).toBe(entry.sessionId);
    expect(found!.agentId).toBe("test-agent");
  });

  it("returns undefined for unknown token", () => {
    store.create("test-agent", "test-role");
    const found = store.getByToken("nonexistent-token");

    expect(found).toBeUndefined();
  });

  it("looks up session by id", () => {
    const entry = store.create("test-agent", "test-role");
    const found = store.getById(entry.sessionId);

    expect(found).toBeDefined();
    expect(found!.sessionToken).toBe(entry.sessionToken);
  });

  it("returns undefined for unknown id", () => {
    const found = store.getById("nonexistent-id");
    expect(found).toBeUndefined();
  });

  it("tracks size", () => {
    expect(store.size).toBe(0);
    store.create("agent-1", "role-1");
    expect(store.size).toBe(1);
    store.create("agent-2", "role-2");
    expect(store.size).toBe(2);
  });

  it("defaults risk level to LOW", () => {
    expect(store.riskLevel).toBe("LOW");
  });

  it("accepts risk level at construction", () => {
    const highStore = new SessionStore("HIGH");
    expect(highStore.riskLevel).toBe("HIGH");

    const medStore = new SessionStore("MEDIUM");
    expect(medStore.riskLevel).toBe("MEDIUM");
  });

  it("tracks connection count", () => {
    expect(store.connectionCount).toBe(0);
    store.create("agent-1", "role-1");
    expect(store.connectionCount).toBe(1);
    store.create("agent-2", "role-2");
    expect(store.connectionCount).toBe(2);
  });

  describe("isLocked()", () => {
    it("returns false for LOW risk with connections", () => {
      const lowStore = new SessionStore("LOW");
      lowStore.create("agent-1", "role-1");
      expect(lowStore.isLocked()).toBe(false);
    });

    it("returns false for LOW risk with no connections", () => {
      const lowStore = new SessionStore("LOW");
      expect(lowStore.isLocked()).toBe(false);
    });

    it("returns false for HIGH risk with no connections", () => {
      const highStore = new SessionStore("HIGH");
      expect(highStore.isLocked()).toBe(false);
    });

    it("returns true for HIGH risk after first connection", () => {
      const highStore = new SessionStore("HIGH");
      highStore.create("agent-1", "role-1");
      expect(highStore.isLocked()).toBe(true);
    });

    it("returns false for MEDIUM risk with no connections", () => {
      const medStore = new SessionStore("MEDIUM");
      expect(medStore.isLocked()).toBe(false);
    });

    it("returns true for MEDIUM risk after first connection", () => {
      const medStore = new SessionStore("MEDIUM");
      medStore.create("agent-1", "role-1");
      expect(medStore.isLocked()).toBe(true);
    });
  });
});

// ── handleConnectAgent Tests ───────────────────────────────────────────

describe("handleConnectAgent", () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
  });

  function makeRequest(method: string, authorization?: string): IncomingMessage {
    return {
      method,
      headers: authorization ? { authorization } : {},
    } as unknown as IncomingMessage;
  }

  function makeResponse(): ServerResponse & { statusCode: number; body: string } {
    let body = "";
    let statusCode = 200;
    const res = {
      writeHead: vi.fn((code: number) => {
        statusCode = code;
      }),
      end: vi.fn((data?: string) => {
        body = data ?? "";
      }),
      get statusCode() { return statusCode; },
      get body() { return body; },
    };
    return res as unknown as ServerResponse & { statusCode: number; body: string };
  }

  it("returns 200 with session token for valid auth", () => {
    const req = makeRequest("POST", "Bearer valid-token");
    const res = makeResponse();

    handleConnectAgent(req, res, "valid-token", store, "my-agent", "my-role");

    expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "application/json" });
    const parsed = JSON.parse(res.body);
    expect(parsed.sessionToken).toBeDefined();
    expect(parsed.sessionId).toBeDefined();
    expect(store.size).toBe(1);
  });

  it("returns 401 for missing authorization", () => {
    const req = makeRequest("POST");
    const res = makeResponse();

    handleConnectAgent(req, res, "valid-token", store);

    expect(res.writeHead).toHaveBeenCalledWith(401, { "Content-Type": "application/json" });
    expect(store.size).toBe(0);
  });

  it("returns 401 for wrong token", () => {
    const req = makeRequest("POST", "Bearer wrong-token");
    const res = makeResponse();

    handleConnectAgent(req, res, "valid-token", store);

    expect(res.writeHead).toHaveBeenCalledWith(401, { "Content-Type": "application/json" });
    expect(store.size).toBe(0);
  });

  it("returns 401 for non-Bearer scheme", () => {
    const req = makeRequest("POST", "Basic dXNlcjpwYXNz");
    const res = makeResponse();

    handleConnectAgent(req, res, "valid-token", store);

    expect(res.writeHead).toHaveBeenCalledWith(401, { "Content-Type": "application/json" });
  });

  it("returns 405 for non-POST methods", () => {
    const req = makeRequest("GET", "Bearer valid-token");
    const res = makeResponse();

    handleConnectAgent(req, res, "valid-token", store);

    expect(res.writeHead).toHaveBeenCalledWith(405, { "Content-Type": "application/json" });
  });

  it("stores session with correct agent and role", () => {
    const req = makeRequest("POST", "Bearer token123");
    const res = makeResponse();

    handleConnectAgent(req, res, "token123", store, "researcher", "web-research");

    const parsed = JSON.parse(res.body);
    const session = store.getByToken(parsed.sessionToken);
    expect(session).toBeDefined();
    expect(session!.agentId).toBe("researcher");
    expect(session!.role).toBe("web-research");
  });

  it("defaults agent and role to 'unknown' when not provided", () => {
    const req = makeRequest("POST", "Bearer token123");
    const res = makeResponse();

    handleConnectAgent(req, res, "token123", store);

    const parsed = JSON.parse(res.body);
    const session = store.getByToken(parsed.sessionToken);
    expect(session!.agentId).toBe("unknown");
    expect(session!.role).toBe("unknown");
  });

  it("creates separate sessions for multiple valid requests", () => {
    const req1 = makeRequest("POST", "Bearer token123");
    const res1 = makeResponse();
    handleConnectAgent(req1, res1, "token123", store);

    const req2 = makeRequest("POST", "Bearer token123");
    const res2 = makeResponse();
    handleConnectAgent(req2, res2, "token123", store);

    expect(store.size).toBe(2);
    const parsed1 = JSON.parse(res1.body);
    const parsed2 = JSON.parse(res2.body);
    expect(parsed1.sessionToken).not.toBe(parsed2.sessionToken);
    expect(parsed1.sessionId).not.toBe(parsed2.sessionId);
  });

  // ── Risk-Based Connection Limit Tests ──────────────────────────────

  describe("risk-based connection limits", () => {
    it("HIGH risk: first connect returns 200", () => {
      const highStore = new SessionStore("HIGH");
      const req = makeRequest("POST", "Bearer token123");
      const res = makeResponse();

      handleConnectAgent(req, res, "token123", highStore, "agent-1", "high-role");

      expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "application/json" });
      expect(highStore.size).toBe(1);
    });

    it("HIGH risk: second connect returns 403 with session locked message", () => {
      const highStore = new SessionStore("HIGH");

      // First connect — succeeds
      const req1 = makeRequest("POST", "Bearer token123");
      const res1 = makeResponse();
      handleConnectAgent(req1, res1, "token123", highStore, "agent-1", "high-role");
      expect(res1.statusCode).toBe(200);

      // Second connect — rejected
      const req2 = makeRequest("POST", "Bearer token123");
      const res2 = makeResponse();
      handleConnectAgent(req2, res2, "token123", highStore, "agent-2", "high-role");

      expect(res2.writeHead).toHaveBeenCalledWith(403, { "Content-Type": "application/json" });
      const parsed = JSON.parse(res2.body);
      expect(parsed.error).toContain("Session locked");
      expect(parsed.error).toContain("HIGH");
      expect(highStore.size).toBe(1); // no new session created
    });

    it("MEDIUM risk: first connect returns 200", () => {
      const medStore = new SessionStore("MEDIUM");
      const req = makeRequest("POST", "Bearer token123");
      const res = makeResponse();

      handleConnectAgent(req, res, "token123", medStore, "agent-1", "med-role");

      expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "application/json" });
      expect(medStore.size).toBe(1);
    });

    it("MEDIUM risk: second connect returns 403 with session locked message", () => {
      const medStore = new SessionStore("MEDIUM");

      // First connect
      const req1 = makeRequest("POST", "Bearer token123");
      const res1 = makeResponse();
      handleConnectAgent(req1, res1, "token123", medStore, "agent-1", "med-role");
      expect(res1.statusCode).toBe(200);

      // Second connect — rejected
      const req2 = makeRequest("POST", "Bearer token123");
      const res2 = makeResponse();
      handleConnectAgent(req2, res2, "token123", medStore, "agent-2", "med-role");

      expect(res2.writeHead).toHaveBeenCalledWith(403, { "Content-Type": "application/json" });
      const parsed = JSON.parse(res2.body);
      expect(parsed.error).toContain("Session locked");
      expect(parsed.error).toContain("MEDIUM");
      expect(medStore.size).toBe(1);
    });

    it("LOW risk: first connect returns 200, second connect returns 200", () => {
      const lowStore = new SessionStore("LOW");

      // First connect
      const req1 = makeRequest("POST", "Bearer token123");
      const res1 = makeResponse();
      handleConnectAgent(req1, res1, "token123", lowStore, "agent-1", "low-role");
      expect(res1.statusCode).toBe(200);

      // Second connect — also succeeds
      const req2 = makeRequest("POST", "Bearer token123");
      const res2 = makeResponse();
      handleConnectAgent(req2, res2, "token123", lowStore, "agent-2", "low-role");

      expect(res2.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "application/json" });
      expect(lowStore.size).toBe(2);
    });

    it("default risk level (no arg) behaves as LOW — unlimited connections", () => {
      const defaultStore = new SessionStore(); // no risk level arg

      const req1 = makeRequest("POST", "Bearer token123");
      const res1 = makeResponse();
      handleConnectAgent(req1, res1, "token123", defaultStore, "agent-1", "role-1");
      expect(res1.statusCode).toBe(200);

      const req2 = makeRequest("POST", "Bearer token123");
      const res2 = makeResponse();
      handleConnectAgent(req2, res2, "token123", defaultStore, "agent-2", "role-2");
      expect(res2.statusCode).toBe(200);

      expect(defaultStore.size).toBe(2);
    });

    it("403 rejection does not increment connection count", () => {
      const highStore = new SessionStore("HIGH");

      // First connect
      const req1 = makeRequest("POST", "Bearer token123");
      const res1 = makeResponse();
      handleConnectAgent(req1, res1, "token123", highStore, "agent-1", "high-role");
      expect(highStore.connectionCount).toBe(1);

      // Second connect — rejected
      const req2 = makeRequest("POST", "Bearer token123");
      const res2 = makeResponse();
      handleConnectAgent(req2, res2, "token123", highStore, "agent-2", "high-role");

      expect(res2.statusCode).toBe(403);
      expect(highStore.connectionCount).toBe(1); // still 1
    });
  });
});
