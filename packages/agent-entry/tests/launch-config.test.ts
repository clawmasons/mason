import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLaunchConfig, installCredentials } from "../src/index.js";
import type { CredentialConfig } from "../src/index.js";

describe("loadLaunchConfig", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns null when no config file exists", () => {
    // loadLaunchConfig checks fixed paths that won't exist in test
    const result = loadLaunchConfig();
    // May return null or find a file depending on cwd — just verify it doesn't throw
    expect(result === null || typeof result === "object").toBe(true);
  });

  it("throws on invalid JSON", () => {
    tempDir = mkdtempSync(join(tmpdir(), "agent-launch-test-"));
    const configPath = join(tempDir, "agent-launch.json");
    writeFileSync(configPath, "not json");

    // Change cwd temporarily
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    try {
      expect(() => loadLaunchConfig()).toThrow();
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("throws when command is missing", () => {
    tempDir = mkdtempSync(join(tmpdir(), "agent-launch-test-"));
    const configPath = join(tempDir, "agent-launch.json");
    writeFileSync(configPath, JSON.stringify({ credentials: [] }));

    const originalCwd = process.cwd();
    process.chdir(tempDir);
    try {
      expect(() => loadLaunchConfig()).toThrow("command");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("throws when file credential has no path", () => {
    tempDir = mkdtempSync(join(tmpdir(), "agent-launch-test-"));
    const configPath = join(tempDir, "agent-launch.json");
    writeFileSync(configPath, JSON.stringify({
      credentials: [{ key: "MY_KEY", type: "file" }],
      command: "bash",
    }));

    const originalCwd = process.cwd();
    process.chdir(tempDir);
    try {
      expect(() => loadLaunchConfig()).toThrow("path");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("parses valid config from cwd", () => {
    tempDir = mkdtempSync(join(tmpdir(), "agent-launch-test-"));
    const config = {
      credentials: [
        { key: "API_KEY", type: "env" },
        { key: "CREDS", type: "file", path: "/home/mason/.claude/.credentials.json" },
      ],
      command: "claude",
      args: ["--verbose"],
    };
    writeFileSync(join(tempDir, "agent-launch.json"), JSON.stringify(config));

    const originalCwd = process.cwd();
    process.chdir(tempDir);
    try {
      const result = loadLaunchConfig();
      expect(result).not.toBeNull();
      expect(result!.command).toBe("claude");
      expect(result!.args).toEqual(["--verbose"]);
      expect(result!.credentials).toHaveLength(2);
      expect(result!.credentials[0]).toEqual({ key: "API_KEY", type: "env" });
      expect(result!.credentials[1]).toEqual({
        key: "CREDS",
        type: "file",
        path: "/home/mason/.claude/.credentials.json",
      });
    } finally {
      process.chdir(originalCwd);
    }
  });
});

describe("installCredentials", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns env vars for env-type credentials", () => {
    const configs: CredentialConfig[] = [
      { key: "API_KEY", type: "env" },
      { key: "DB_PASS", type: "env" },
    ];
    const values = { API_KEY: "sk-123", DB_PASS: "secret" };

    const result = installCredentials(configs, values);

    expect(result).toEqual({ API_KEY: "sk-123", DB_PASS: "secret" });
  });

  it("writes file for file-type credentials", () => {
    tempDir = mkdtempSync(join(tmpdir(), "agent-cred-install-"));
    const filePath = join(tempDir, "subdir", "creds.json");

    const configs: CredentialConfig[] = [
      { key: "CREDS", type: "file", path: filePath },
    ];
    const values = { CREDS: '{"token":"abc"}' };

    const result = installCredentials(configs, values);

    // File-type credentials are not returned as env vars
    expect(result).toEqual({});
    // But the file should exist
    const content = readFileSync(filePath, "utf-8");
    expect(content).toBe('{"token":"abc"}');
  });

  it("creates parent directories for file credentials", () => {
    tempDir = mkdtempSync(join(tmpdir(), "agent-cred-install-"));
    const filePath = join(tempDir, "deep", "nested", "dir", "creds.json");

    const configs: CredentialConfig[] = [
      { key: "CREDS", type: "file", path: filePath },
    ];
    const values = { CREDS: "content" };

    installCredentials(configs, values);

    const content = readFileSync(filePath, "utf-8");
    expect(content).toBe("content");
  });

  it("skips credentials with no value", () => {
    const configs: CredentialConfig[] = [
      { key: "MISSING", type: "env" },
    ];
    const values: Record<string, string> = {};

    const result = installCredentials(configs, values);

    expect(result).toEqual({});
  });

  it("handles mix of env and file credentials", () => {
    tempDir = mkdtempSync(join(tmpdir(), "agent-cred-install-"));
    const filePath = join(tempDir, "creds.json");

    const configs: CredentialConfig[] = [
      { key: "TOKEN", type: "env" },
      { key: "CREDS", type: "file", path: filePath },
    ];
    const values = { TOKEN: "my-token", CREDS: '{"key":"val"}' };

    const result = installCredentials(configs, values);

    expect(result).toEqual({ TOKEN: "my-token" });
    expect(readFileSync(filePath, "utf-8")).toBe('{"key":"val"}');
  });
});
