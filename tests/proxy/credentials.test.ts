import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { loadEnvFile, resolveEnvVars } from "../../src/proxy/credentials.js";

// ── loadEnvFile ──────────────────────────────────────────────────────────

describe("loadEnvFile", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function writeEnv(content: string): string {
    tempDir = mkdtempSync(join(tmpdir(), "chapter-cred-"));
    const filePath = join(tempDir, ".env");
    writeFileSync(filePath, content);
    return filePath;
  }

  it("parses basic KEY=VALUE lines", () => {
    const path = writeEnv("FOO=bar\nBAZ=qux");
    expect(loadEnvFile(path)).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("skips comments and blank lines", () => {
    const path = writeEnv("# comment\nFOO=bar\n\n# another\nBAZ=qux\n");
    expect(loadEnvFile(path)).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("handles double-quoted values", () => {
    const path = writeEnv('FOO="hello world"');
    expect(loadEnvFile(path)).toEqual({ FOO: "hello world" });
  });

  it("handles single-quoted values", () => {
    const path = writeEnv("FOO='hello world'");
    expect(loadEnvFile(path)).toEqual({ FOO: "hello world" });
  });

  it("strips inline comments for unquoted values", () => {
    const path = writeEnv("FOO=bar # this is a comment");
    expect(loadEnvFile(path)).toEqual({ FOO: "bar" });
  });

  it("preserves inline # in quoted values", () => {
    const path = writeEnv('FOO="bar # not a comment"');
    expect(loadEnvFile(path)).toEqual({ FOO: "bar # not a comment" });
  });

  it("returns empty object for non-existent file", () => {
    expect(loadEnvFile("/nonexistent/.env")).toEqual({});
  });

  it("handles empty values", () => {
    const path = writeEnv("FOO=\nBAR=baz");
    expect(loadEnvFile(path)).toEqual({ FOO: "", BAR: "baz" });
  });

  it("handles values with = signs", () => {
    const path = writeEnv("FOO=bar=baz");
    expect(loadEnvFile(path)).toEqual({ FOO: "bar=baz" });
  });

  it("handles lines without = sign (skip them)", () => {
    const path = writeEnv("NOEQ\nFOO=bar");
    expect(loadEnvFile(path)).toEqual({ FOO: "bar" });
  });
});

// ── resolveEnvVars ──────────────────────────────────────────────────────

describe("resolveEnvVars", () => {
  afterEach(() => {
    // Clean up any env vars set during tests
    delete process.env.TEST_OVERRIDE;
  });

  it("resolves ${VAR} references from loaded env", () => {
    const env = { GITHUB_TOKEN: "${MY_TOKEN}" };
    const loaded = { MY_TOKEN: "ghp_abc123" };
    expect(resolveEnvVars(env, loaded)).toEqual({ GITHUB_TOKEN: "ghp_abc123" });
  });

  it("process.env takes precedence over loaded env", () => {
    process.env.TEST_OVERRIDE = "from_process";
    const env = { TOKEN: "${TEST_OVERRIDE}" };
    const loaded = { TEST_OVERRIDE: "from_file" };
    expect(resolveEnvVars(env, loaded)).toEqual({ TOKEN: "from_process" });
  });

  it("unresolved references become empty strings", () => {
    const env = { TOKEN: "${MISSING_VAR}" };
    expect(resolveEnvVars(env, {})).toEqual({ TOKEN: "" });
  });

  it("passes through values without ${} references", () => {
    const env = { STATIC: "plain_value" };
    expect(resolveEnvVars(env, {})).toEqual({ STATIC: "plain_value" });
  });

  it("resolves multiple references in one value", () => {
    const env = { URL: "https://${HOST}:${PORT}/api" };
    const loaded = { HOST: "localhost", PORT: "8080" };
    expect(resolveEnvVars(env, loaded)).toEqual({ URL: "https://localhost:8080/api" });
  });

  it("handles empty env record", () => {
    expect(resolveEnvVars({}, { FOO: "bar" })).toEqual({});
  });
});
