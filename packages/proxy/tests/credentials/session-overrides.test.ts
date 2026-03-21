import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CredentialResolver } from "../../src/credentials/resolver.js";
import { CredentialService } from "../../src/credentials/service.js";
import { queryCredentialAudit } from "../../src/credentials/audit.js";
import type { CredentialRequest } from "../../src/credentials/schemas.js";

// Mock the keychain module to prevent actual keychain calls
vi.mock("../../src/credentials/keychain.js", () => ({
  queryKeychain: vi.fn().mockResolvedValue(undefined),
}));

// ── Resolver-level session override tests ─────────────────────────────

describe("CredentialResolver session overrides", () => {
  const envKeysToClean: string[] = [];

  function setEnv(key: string, value: string): void {
    process.env[key] = value;
    envKeysToClean.push(key);
  }

  afterEach(() => {
    for (const key of envKeysToClean) {
      process.env[key] = undefined;
    }
    envKeysToClean.length = 0;
  });

  it("returns session override value with source 'session'", async () => {
    const resolver = new CredentialResolver({ envFilePath: "/nonexistent/.env" });
    resolver.setSessionOverrides({ MY_TOKEN: "override-value" });

    const result = await resolver.resolve("MY_TOKEN");

    expect(result).toEqual({ value: "override-value", source: "session" });
  });

  it("session override takes priority over env var", async () => {
    setEnv("API_KEY", "from-env");
    const resolver = new CredentialResolver({ envFilePath: "/nonexistent/.env" });
    resolver.setSessionOverrides({ API_KEY: "from-session" });

    const result = await resolver.resolve("API_KEY");

    expect(result).toEqual({ value: "from-session", source: "session" });
  });

  it("non-overridden keys still resolve from env", async () => {
    setEnv("OTHER_KEY", "env-value");
    const resolver = new CredentialResolver({ envFilePath: "/nonexistent/.env" });
    resolver.setSessionOverrides({ DIFFERENT_KEY: "override-value" });

    const result = await resolver.resolve("OTHER_KEY");

    expect(result).toEqual({ value: "env-value", source: "env" });
  });

  it("clearSessionOverrides removes all overrides", async () => {
    setEnv("MY_KEY", "env-value");
    const resolver = new CredentialResolver({ envFilePath: "/nonexistent/.env" });
    resolver.setSessionOverrides({ MY_KEY: "override-value" });

    // Before clearing: session override wins
    let result = await resolver.resolve("MY_KEY");
    expect(result).toEqual({ value: "override-value", source: "session" });

    // After clearing: falls back to env
    resolver.clearSessionOverrides();
    result = await resolver.resolve("MY_KEY");
    expect(result).toEqual({ value: "env-value", source: "env" });
  });

  it("empty overrides behave identically to no overrides", async () => {
    setEnv("MY_KEY", "env-value");
    const resolver = new CredentialResolver({ envFilePath: "/nonexistent/.env" });
    resolver.setSessionOverrides({});

    const result = await resolver.resolve("MY_KEY");

    expect(result).toEqual({ value: "env-value", source: "env" });
  });

  it("returns NOT_FOUND when key is not in overrides or other sources", async () => {
    const resolver = new CredentialResolver({ envFilePath: "/nonexistent/.env" });
    resolver.setSessionOverrides({ OTHER_KEY: "value" });

    const result = await resolver.resolve("MISSING_KEY");

    expect(result).toHaveProperty("code", "NOT_FOUND");
  });

  it("setSessionOverrides replaces previous overrides entirely", async () => {
    const resolver = new CredentialResolver({ envFilePath: "/nonexistent/.env" });
    resolver.setSessionOverrides({ KEY_A: "val-a", KEY_B: "val-b" });
    resolver.setSessionOverrides({ KEY_C: "val-c" });

    // KEY_A should no longer be overridden
    const resultA = await resolver.resolve("KEY_A");
    expect(resultA).toHaveProperty("code", "NOT_FOUND");

    // KEY_C should be overridden
    const resultC = await resolver.resolve("KEY_C");
    expect(resultC).toEqual({ value: "val-c", source: "session" });
  });
});

// ── Service-level session override tests ──────────────────────────────

describe("CredentialService session overrides", () => {
  let service: CredentialService;
  const envKeysToClean: string[] = [];

  function setEnv(key: string, value: string): void {
    process.env[key] = value;
    envKeysToClean.push(key);
  }

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

  it("session override returns override value instead of env var", async () => {
    setEnv("API_KEY", "env-value");
    service.setSessionOverrides({ API_KEY: "session-value" });

    const response = await service.handleRequest(makeRequest());

    expect(response).toEqual({
      id: "req-1",
      key: "API_KEY",
      value: "session-value",
      source: "session",
    });
  });

  it("session override is audited with source 'session'", async () => {
    service.setSessionOverrides({ API_KEY: "session-value" });

    await service.handleRequest(makeRequest());

    const entries = queryCredentialAudit(service.getDatabase());
    expect(entries).toHaveLength(1);
    expect(entries[0].outcome).toBe("granted");
    expect(entries[0].source).toBe("session");
  });

  it("clearSessionOverrides falls back to normal resolution", async () => {
    setEnv("API_KEY", "env-value");
    service.setSessionOverrides({ API_KEY: "session-value" });
    service.clearSessionOverrides();

    const response = await service.handleRequest(makeRequest());

    expect(response).toEqual({
      id: "req-1",
      key: "API_KEY",
      value: "env-value",
      source: "env",
    });
  });

  it("access validation still applies with session overrides", async () => {
    service.setSessionOverrides({ UNDECLARED_KEY: "session-value" });

    const response = await service.handleRequest(
      makeRequest({
        key: "UNDECLARED_KEY",
        declaredCredentials: ["API_KEY"],
      }),
    );

    expect(response).toHaveProperty("code", "ACCESS_DENIED");
  });

  it("non-overridden keys resolve normally through service", async () => {
    setEnv("OTHER_KEY", "env-value");
    service.setSessionOverrides({ API_KEY: "session-value" });

    const response = await service.handleRequest(
      makeRequest({ key: "OTHER_KEY" }),
    );

    expect(response).toEqual({
      id: "req-1",
      key: "OTHER_KEY",
      value: "env-value",
      source: "env",
    });
  });
});
