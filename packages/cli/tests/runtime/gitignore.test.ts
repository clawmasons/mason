import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  hasGitignoreEntry,
  ensureGitignoreEntry,
} from "../../src/runtime/gitignore.js";

describe("hasGitignoreEntry", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-gitignore-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns false for non-existent file", () => {
    const result = hasGitignoreEntry(
      path.join(tmpDir, ".gitignore"),
      ".clawmasons",
    );
    expect(result).toBe(false);
  });

  it("returns true when pattern is present", () => {
    const gitignorePath = path.join(tmpDir, ".gitignore");
    fs.writeFileSync(gitignorePath, "node_modules\n.clawmasons\n", "utf-8");

    expect(hasGitignoreEntry(gitignorePath, ".clawmasons")).toBe(true);
  });

  it("returns false when pattern is not present", () => {
    const gitignorePath = path.join(tmpDir, ".gitignore");
    fs.writeFileSync(gitignorePath, "node_modules\ndist\n", "utf-8");

    expect(hasGitignoreEntry(gitignorePath, ".clawmasons")).toBe(false);
  });

  it("ignores blank lines and whitespace when matching", () => {
    const gitignorePath = path.join(tmpDir, ".gitignore");
    fs.writeFileSync(
      gitignorePath,
      "node_modules\n\n  .clawmasons  \n\n",
      "utf-8",
    );

    expect(hasGitignoreEntry(gitignorePath, ".clawmasons")).toBe(true);
  });

  it("does not match partial patterns", () => {
    const gitignorePath = path.join(tmpDir, ".gitignore");
    fs.writeFileSync(gitignorePath, ".clawmasons/logs\n", "utf-8");

    expect(hasGitignoreEntry(gitignorePath, ".clawmasons")).toBe(false);
  });
});

describe("ensureGitignoreEntry", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-gitignore-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns false when .gitignore does not exist", () => {
    const result = ensureGitignoreEntry(tmpDir, ".clawmasons");
    expect(result).toBe(false);
    // Should not create a .gitignore
    expect(fs.existsSync(path.join(tmpDir, ".gitignore"))).toBe(false);
  });

  it("appends pattern when .gitignore exists but does not contain it", () => {
    const gitignorePath = path.join(tmpDir, ".gitignore");
    fs.writeFileSync(gitignorePath, "node_modules\n", "utf-8");

    const result = ensureGitignoreEntry(tmpDir, ".clawmasons");
    expect(result).toBe(true);

    const content = fs.readFileSync(gitignorePath, "utf-8");
    expect(content).toBe("node_modules\n.clawmasons\n");
  });

  it("returns false when pattern is already present", () => {
    const gitignorePath = path.join(tmpDir, ".gitignore");
    fs.writeFileSync(
      gitignorePath,
      "node_modules\n.clawmasons\n",
      "utf-8",
    );

    const result = ensureGitignoreEntry(tmpDir, ".clawmasons");
    expect(result).toBe(false);

    // Content unchanged
    const content = fs.readFileSync(gitignorePath, "utf-8");
    expect(content).toBe("node_modules\n.clawmasons\n");
  });

  it("handles .gitignore with trailing newline", () => {
    const gitignorePath = path.join(tmpDir, ".gitignore");
    fs.writeFileSync(gitignorePath, "node_modules\ndist\n", "utf-8");

    ensureGitignoreEntry(tmpDir, ".clawmasons");

    const content = fs.readFileSync(gitignorePath, "utf-8");
    expect(content).toBe("node_modules\ndist\n.clawmasons\n");
  });

  it("handles .gitignore without trailing newline", () => {
    const gitignorePath = path.join(tmpDir, ".gitignore");
    fs.writeFileSync(gitignorePath, "node_modules\ndist", "utf-8");

    ensureGitignoreEntry(tmpDir, ".clawmasons");

    const content = fs.readFileSync(gitignorePath, "utf-8");
    expect(content).toBe("node_modules\ndist\n.clawmasons\n");
  });

  it("handles empty .gitignore", () => {
    const gitignorePath = path.join(tmpDir, ".gitignore");
    fs.writeFileSync(gitignorePath, "", "utf-8");

    const result = ensureGitignoreEntry(tmpDir, ".clawmasons");
    expect(result).toBe(true);

    const content = fs.readFileSync(gitignorePath, "utf-8");
    expect(content).toBe(".clawmasons\n");
  });
});
