import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  resolveAgentDir,
  validateEnvFile,
} from "../../src/cli/commands/docker-utils.js";

describe("resolveAgentDir", () => {
  it("returns default path using short name", () => {
    const result = resolveAgentDir("/workspace", "@test/agent-ops");
    expect(result).toBe(path.join("/workspace", ".chapter", "agents", "ops"));
  });

  it("strips scope and agent- prefix", () => {
    const result = resolveAgentDir("/workspace", "@clawmasons/agent-repo-ops");
    expect(result).toBe(path.join("/workspace", ".chapter", "agents", "repo-ops"));
  });

  it("uses custom outputDir when provided", () => {
    const result = resolveAgentDir("/workspace", "@test/agent-ops", "./custom/dir");
    expect(result).toBe(path.resolve("/workspace", "./custom/dir"));
  });

  it("uses absolute custom outputDir as-is", () => {
    const result = resolveAgentDir("/workspace", "@test/agent-ops", "/absolute/path");
    expect(result).toBe("/absolute/path");
  });
});

describe("validateEnvFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-env-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when all values are filled", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".env"),
      "# Comment\nGITHUB_TOKEN=abc123\nCHAPTER_PROXY_TOKEN=xyz\n",
    );
    const missing = validateEnvFile(tmpDir);
    expect(missing).toEqual([]);
  });

  it("returns missing variables with empty values", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".env"),
      "GITHUB_TOKEN=\nCHAPTER_PROXY_TOKEN=abc\nSLACK_TOKEN=\n",
    );
    const missing = validateEnvFile(tmpDir);
    expect(missing).toEqual(["GITHUB_TOKEN", "SLACK_TOKEN"]);
  });

  it("throws when .env file does not exist", () => {
    expect(() => validateEnvFile(tmpDir)).toThrow("No .env file found");
  });

  it("skips comment lines and empty lines", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".env"),
      "# This is a comment\n\nTOKEN=value\n",
    );
    const missing = validateEnvFile(tmpDir);
    expect(missing).toEqual([]);
  });
});
