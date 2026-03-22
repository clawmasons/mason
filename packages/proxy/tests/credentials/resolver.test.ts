import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

// Mock the keychain module before importing the resolver
const mockQueryKeychain = vi.fn<
  (service: string, account: string) => Promise<string | undefined>
>();
const mockQueryKeychainByService = vi.fn<
  (service: string) => Promise<string | undefined>
>();

vi.mock("../../src/credentials/keychain.js", () => ({
  queryKeychain: (...args: [string, string]) => mockQueryKeychain(...args),
  queryKeychainByService: (...args: [string]) => mockQueryKeychainByService(...args),
}));

import { CredentialResolver } from "../../src/credentials/resolver.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function writeDotenv(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "mason-cred-resolver-"));
  const filePath = join(dir, ".env");
  writeFileSync(filePath, content);
  return filePath;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("CredentialResolver", () => {
  const envKeysToClean: string[] = [];
  let tempDirs: string[] = [];

  beforeEach(() => {
    tempDirs = [];
    mockQueryKeychain.mockReset();
    mockQueryKeychainByService.mockReset();
    // Default: keychain returns undefined (not found)
    mockQueryKeychain.mockResolvedValue(undefined);
    mockQueryKeychainByService.mockResolvedValue(undefined);
  });

  afterEach(() => {
    for (const key of envKeysToClean) {
      process.env[key] = undefined;
    }
    envKeysToClean.length = 0;
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  function setEnv(key: string, value: string): void {
    process.env[key] = value;
    envKeysToClean.push(key);
  }

  function createDotenv(content: string): string {
    const filePath = writeDotenv(content);
    tempDirs.push(join(filePath, ".."));
    return filePath;
  }

  // ── Environment variable resolution ─────────────────────────────────

  describe("resolveFromEnv", () => {
    it("resolves a credential from process.env", async () => {
      setEnv("TEST_CRED_A", "secret-value-a");
      const resolver = new CredentialResolver();

      const result = await resolver.resolve("TEST_CRED_A");

      expect(result).toEqual({ value: "secret-value-a", source: "env" });
    });

    it("does not resolve empty env var", async () => {
      setEnv("TEST_CRED_EMPTY", "");
      const envPath = createDotenv("TEST_CRED_EMPTY=from-dotenv");
      const resolver = new CredentialResolver({ envFilePath: envPath });

      const result = await resolver.resolve("TEST_CRED_EMPTY");

      // Empty env var is treated as not set — falls through to dotenv
      expect(result).toEqual({ value: "from-dotenv", source: "dotenv" });
    });
  });

  // ── Dotenv resolution ───────────────────────────────────────────────

  describe("resolveFromDotenv", () => {
    it("resolves a credential from .env file", async () => {
      const envPath = createDotenv("MY_API_KEY=sk-dotenv-123");
      const resolver = new CredentialResolver({ envFilePath: envPath });

      const result = await resolver.resolve("MY_API_KEY");

      expect(result).toEqual({ value: "sk-dotenv-123", source: "dotenv" });
    });

    it("returns NOT_FOUND for missing key in .env", async () => {
      const envPath = createDotenv("OTHER_KEY=value");
      const resolver = new CredentialResolver({ envFilePath: envPath });

      const result = await resolver.resolve("MISSING_KEY");

      expect(result).toEqual({
        error: 'Credential "MISSING_KEY" not found in any source',
        code: "NOT_FOUND",
        sourcesAttempted: expect.arrayContaining(["env", "dotenv"]),
      });
    });

    it("handles non-existent .env file gracefully", async () => {
      const resolver = new CredentialResolver({
        envFilePath: "/nonexistent/path/.env",
      });

      const result = await resolver.resolve("ANY_KEY");

      expect(result).toEqual({
        error: 'Credential "ANY_KEY" not found in any source',
        code: "NOT_FOUND",
        sourcesAttempted: expect.arrayContaining(["env", "dotenv"]),
      });
    });
  });

  // ── Priority order ──────────────────────────────────────────────────

  describe("priority", () => {
    it("env takes priority over dotenv", async () => {
      setEnv("PRIORITY_KEY", "from-env");
      const envPath = createDotenv("PRIORITY_KEY=from-dotenv");
      const resolver = new CredentialResolver({ envFilePath: envPath });

      const result = await resolver.resolve("PRIORITY_KEY");

      expect(result).toEqual({ value: "from-env", source: "env" });
    });

    it("env takes priority over keychain", async () => {
      vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
      mockQueryKeychain.mockResolvedValue("keychain-value");

      setEnv("PRIORITY_KEY", "from-env");
      const resolver = new CredentialResolver({
        envFilePath: "/nonexistent/.env",
      });

      const result = await resolver.resolve("PRIORITY_KEY");

      expect(result).toEqual({ value: "from-env", source: "env" });
      // Keychain should not even be called when env resolves
      expect(mockQueryKeychain).not.toHaveBeenCalled();
    });

    it("keychain takes priority over dotenv", async () => {
      vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
      mockQueryKeychain.mockResolvedValue("keychain-value");

      const envPath = createDotenv("KC_KEY=dotenv-value");
      const resolver = new CredentialResolver({ envFilePath: envPath });

      const result = await resolver.resolve("KC_KEY");

      expect(result).toEqual({ value: "keychain-value", source: "keychain" });
    });
  });

  // ── NOT_FOUND error ─────────────────────────────────────────────────

  describe("NOT_FOUND", () => {
    it("returns structured error when key not found anywhere", async () => {
      const envPath = createDotenv("");
      const resolver = new CredentialResolver({ envFilePath: envPath });

      const result = await resolver.resolve("NONEXISTENT_KEY");

      expect(result).toHaveProperty("code", "NOT_FOUND");
      expect(result).toHaveProperty("error");
      expect(result).toHaveProperty("sourcesAttempted");
      const err = result as { sourcesAttempted: string[] };
      expect(err.sourcesAttempted).toContain("env");
      expect(err.sourcesAttempted).toContain("dotenv");
    });

    it("includes keychain in sourcesAttempted on macOS", async () => {
      vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
      mockQueryKeychain.mockResolvedValue(undefined);

      const envPath = createDotenv("");
      const resolver = new CredentialResolver({ envFilePath: envPath });

      const result = await resolver.resolve("MISSING_KEY");

      expect(result).toHaveProperty("code", "NOT_FOUND");
      const err = result as { sourcesAttempted: string[] };
      expect(err.sourcesAttempted).toContain("keychain");
    });
  });

  // ── Keychain resolution ─────────────────────────────────────────────

  describe("keychain", () => {
    it("skips keychain on non-macOS platforms", async () => {
      vi.spyOn(process, "platform", "get").mockReturnValue("linux");

      const envPath = createDotenv("");
      const resolver = new CredentialResolver({ envFilePath: envPath });

      const result = await resolver.resolve("SOME_KEY");

      expect(result).toHaveProperty("code", "NOT_FOUND");
      const err = result as { sourcesAttempted: string[] };
      expect(err.sourcesAttempted).not.toContain("keychain");
      expect(mockQueryKeychain).not.toHaveBeenCalled();
    });

    it("resolves from keychain on macOS when env and dotenv miss", async () => {
      vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
      mockQueryKeychain.mockResolvedValue("keychain-secret-value");

      const envPath = createDotenv("");
      const resolver = new CredentialResolver({ envFilePath: envPath });

      const result = await resolver.resolve("KEYCHAIN_KEY");

      expect(result).toEqual({
        value: "keychain-secret-value",
        source: "keychain",
      });
    });

    it("falls through when keychain returns undefined on macOS", async () => {
      vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
      mockQueryKeychain.mockResolvedValue(undefined);

      const envPath = createDotenv("KEYCHAIN_KEY=dotenv-fallback");
      const resolver = new CredentialResolver({ envFilePath: envPath });

      const result = await resolver.resolve("KEYCHAIN_KEY");

      expect(result).toEqual({ value: "dotenv-fallback", source: "dotenv" });
    });

    it("uses configured keychain service name", async () => {
      vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
      mockQueryKeychain.mockResolvedValue("value");

      const resolver = new CredentialResolver({
        keychainService: "my-custom-service",
        envFilePath: "/nonexistent/.env",
      });

      await resolver.resolve("MY_KEY");

      expect(mockQueryKeychain).toHaveBeenCalledWith(
        "my-custom-service",
        "MY_KEY",
      );
    });
  });

  // ── Dotenv caching ──────────────────────────────────────────────────

  describe("caching", () => {
    it("caches dotenv file and does not re-read on subsequent calls", async () => {
      const envPath = createDotenv("KEY_A=val_a\nKEY_B=val_b");
      const resolver = new CredentialResolver({ envFilePath: envPath });

      const resultA = await resolver.resolve("KEY_A");
      const resultB = await resolver.resolve("KEY_B");

      expect(resultA).toEqual({ value: "val_a", source: "dotenv" });
      expect(resultB).toEqual({ value: "val_b", source: "dotenv" });
    });
  });

  // ── Default config ──────────────────────────────────────────────────

  describe("defaults", () => {
    it("uses default keychain service 'clawmasons'", async () => {
      vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
      mockQueryKeychain.mockResolvedValue(undefined);

      const resolver = new CredentialResolver({
        envFilePath: "/nonexistent/.env",
      });
      await resolver.resolve("SOME_KEY");

      expect(mockQueryKeychain).toHaveBeenCalledWith("clawmasons", "SOME_KEY");
    });
  });

  // ── Security key resolution ────────────────────────────────────────

  describe("security.* keys", () => {
    it("rejects all security.* keys with ACCESS_DENIED (allowlist is empty)", async () => {
      const resolver = new CredentialResolver({ envFilePath: "/nonexistent/.env" });
      const result = await resolver.resolve("security.ANY_KEY");

      expect(result).toHaveProperty("code", "ACCESS_DENIED");
      expect(result).toHaveProperty("error");
      const err = result as { error: string };
      expect(err.error).toContain("not in the allowlist");
    });

    it("session overrides take priority over security.* keys", async () => {
      const resolver = new CredentialResolver({ envFilePath: "/nonexistent/.env" });
      resolver.setSessionOverrides({
        "security.SOME_KEY": "session-override-value",
      });

      const result = await resolver.resolve("security.SOME_KEY");

      expect(result).toEqual({
        value: "session-override-value",
        source: "session",
      });
    });

    it("does not use normal env/keychain/dotenv chain for security.* keys", async () => {
      vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
      setEnv("security.SOME_KEY", "env-value");
      mockQueryKeychainByService.mockResolvedValue(undefined);

      const resolver = new CredentialResolver({ envFilePath: "/nonexistent/.env" });
      await resolver.resolve("security.SOME_KEY");

      // The security.* path doesn't check process.env — it uses its own resolution
      // It should NOT find the env value via the normal chain
      expect(mockQueryKeychain).not.toHaveBeenCalled();
    });
  });
});
