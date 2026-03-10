import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  getClawmasonsHome,
  ensureClawmasonsHome,
  readChaptersJson,
  writeChaptersJson,
  findRoleEntry,
  findRoleEntryByRole,
  upsertRoleEntry,
  type ChapterEntry,
  type ChaptersJson,
} from "../../src/runtime/home.js";

describe("getClawmasonsHome", () => {
  const originalEnv = process.env["CLAWMASONS_HOME"];

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["CLAWMASONS_HOME"] = originalEnv;
    } else {
      delete process.env["CLAWMASONS_HOME"];
    }
  });

  it("reads CLAWMASONS_HOME env var", () => {
    process.env["CLAWMASONS_HOME"] = "/opt/clawmasons";
    expect(getClawmasonsHome()).toBe("/opt/clawmasons");
  });

  it("defaults to ~/.clawmasons when env var is unset", () => {
    delete process.env["CLAWMASONS_HOME"];
    expect(getClawmasonsHome()).toBe(path.join(os.homedir(), ".clawmasons"));
  });

  it("resolves relative env var paths to absolute", () => {
    process.env["CLAWMASONS_HOME"] = "relative/path";
    const result = getClawmasonsHome();
    expect(path.isAbsolute(result)).toBe(true);
  });
});

describe("ensureClawmasonsHome", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-home-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates directory and .gitignore when missing", () => {
    const home = path.join(tmpDir, "clawmasons");
    ensureClawmasonsHome(home);

    expect(fs.existsSync(home)).toBe(true);
    expect(fs.statSync(home).isDirectory()).toBe(true);

    const gitignorePath = path.join(home, ".gitignore");
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const content = fs.readFileSync(gitignorePath, "utf-8");
    expect(content).toContain("**/logs/");
  });

  it("is idempotent -- does not overwrite existing .gitignore", () => {
    const home = path.join(tmpDir, "clawmasons");
    fs.mkdirSync(home, { recursive: true });

    const gitignorePath = path.join(home, ".gitignore");
    fs.writeFileSync(gitignorePath, "custom content\n", "utf-8");

    ensureClawmasonsHome(home);

    const content = fs.readFileSync(gitignorePath, "utf-8");
    expect(content).toBe("custom content\n");
  });
});

describe("readChaptersJson", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-home-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty chapters array when file does not exist", () => {
    const result = readChaptersJson(tmpDir);
    expect(result).toEqual({ chapters: [] });
  });

  it("parses valid chapters.json", () => {
    const data: ChaptersJson = {
      chapters: [
        {
          lodge: "acme",
          chapter: "platform",
          role: "writer",
          dockerBuild: "/path/to/docker",
          roleDir: "/home/.clawmasons/acme/platform/writer",
          agents: ["note-taker"],
          createdAt: "2026-03-10T12:00:00Z",
          updatedAt: "2026-03-10T12:00:00Z",
        },
      ],
    };
    fs.writeFileSync(
      path.join(tmpDir, "chapters.json"),
      JSON.stringify(data, null, 2),
      "utf-8",
    );

    const result = readChaptersJson(tmpDir);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].lodge).toBe("acme");
    expect(result.chapters[0].chapter).toBe("platform");
    expect(result.chapters[0].role).toBe("writer");
  });

  it("throws on malformed JSON", () => {
    fs.writeFileSync(
      path.join(tmpDir, "chapters.json"),
      "{ not valid json",
      "utf-8",
    );

    expect(() => readChaptersJson(tmpDir)).toThrow("Failed to parse");
  });

  it("returns empty chapters when file has no chapters array", () => {
    fs.writeFileSync(
      path.join(tmpDir, "chapters.json"),
      JSON.stringify({ something: "else" }),
      "utf-8",
    );

    const result = readChaptersJson(tmpDir);
    expect(result).toEqual({ chapters: [] });
  });
});

describe("writeChaptersJson", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-home-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates file with correct content", () => {
    const data: ChaptersJson = {
      chapters: [
        {
          lodge: "acme",
          chapter: "platform",
          role: "writer",
          dockerBuild: "/path/to/docker",
          roleDir: "/home/.clawmasons/acme/platform/writer",
          agents: ["note-taker"],
          createdAt: "2026-03-10T12:00:00Z",
          updatedAt: "2026-03-10T12:00:00Z",
        },
      ],
    };

    writeChaptersJson(tmpDir, data);

    const filePath = path.join(tmpDir, "chapters.json");
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.chapters).toHaveLength(1);
    expect(parsed.chapters[0].lodge).toBe("acme");
  });

  it("does not leave temp file after successful write", () => {
    writeChaptersJson(tmpDir, { chapters: [] });

    const tmpFile = path.join(tmpDir, "chapters.json.tmp");
    expect(fs.existsSync(tmpFile)).toBe(false);
  });
});

describe("findRoleEntry", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-home-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedChaptersJson(entries: ChapterEntry[]): void {
    writeChaptersJson(tmpDir, { chapters: entries });
  }

  it("returns matching entry", () => {
    seedChaptersJson([
      makeEntry({ lodge: "acme", chapter: "platform", role: "writer" }),
      makeEntry({ lodge: "acme", chapter: "platform", role: "editor" }),
    ]);

    const result = findRoleEntry(tmpDir, "acme", "platform", "writer");
    expect(result).toBeDefined();
    expect(result!.role).toBe("writer");
  });

  it("returns undefined when not found", () => {
    seedChaptersJson([
      makeEntry({ lodge: "acme", chapter: "platform", role: "writer" }),
    ]);

    const result = findRoleEntry(tmpDir, "acme", "platform", "nonexistent");
    expect(result).toBeUndefined();
  });

  it("returns undefined when chapters.json is missing", () => {
    const result = findRoleEntry(tmpDir, "acme", "platform", "writer");
    expect(result).toBeUndefined();
  });
});

describe("findRoleEntryByRole", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-home-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedChaptersJson(entries: ChapterEntry[]): void {
    writeChaptersJson(tmpDir, { chapters: entries });
  }

  it("returns matching entry by role name only", () => {
    seedChaptersJson([
      makeEntry({ lodge: "acme", chapter: "platform", role: "writer" }),
      makeEntry({ lodge: "acme", chapter: "platform", role: "editor" }),
    ]);

    const result = findRoleEntryByRole(tmpDir, "writer");
    expect(result).toBeDefined();
    expect(result!.role).toBe("writer");
    expect(result!.lodge).toBe("acme");
  });

  it("returns first match when multiple lodges have same role", () => {
    seedChaptersJson([
      makeEntry({ lodge: "acme", chapter: "platform", role: "writer" }),
      makeEntry({ lodge: "other", chapter: "tools", role: "writer" }),
    ]);

    const result = findRoleEntryByRole(tmpDir, "writer");
    expect(result).toBeDefined();
    expect(result!.lodge).toBe("acme");
  });

  it("returns undefined when not found", () => {
    seedChaptersJson([
      makeEntry({ lodge: "acme", chapter: "platform", role: "writer" }),
    ]);

    const result = findRoleEntryByRole(tmpDir, "nonexistent");
    expect(result).toBeUndefined();
  });

  it("returns undefined when chapters.json is missing", () => {
    const result = findRoleEntryByRole(tmpDir, "writer");
    expect(result).toBeUndefined();
  });
});

describe("upsertRoleEntry", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-home-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates new entry when none exists", () => {
    const entry = makeEntry({
      lodge: "acme",
      chapter: "platform",
      role: "writer",
      createdAt: "2026-03-10T12:00:00Z",
      updatedAt: "2026-03-10T12:00:00Z",
    });

    upsertRoleEntry(tmpDir, entry);

    const data = readChaptersJson(tmpDir);
    expect(data.chapters).toHaveLength(1);
    expect(data.chapters[0].lodge).toBe("acme");
    expect(data.chapters[0].role).toBe("writer");
    expect(data.chapters[0].createdAt).toBe("2026-03-10T12:00:00Z");
  });

  it("updates existing entry by composite key, preserving createdAt", () => {
    const original = makeEntry({
      lodge: "acme",
      chapter: "platform",
      role: "writer",
      agents: ["note-taker"],
      createdAt: "2026-03-10T10:00:00Z",
      updatedAt: "2026-03-10T10:00:00Z",
    });

    writeChaptersJson(tmpDir, { chapters: [original] });

    const updated = makeEntry({
      lodge: "acme",
      chapter: "platform",
      role: "writer",
      agents: ["note-taker", "reviewer"],
      createdAt: "2026-03-10T14:00:00Z", // Should be ignored; original preserved
      updatedAt: "2026-03-10T14:00:00Z",
    });

    upsertRoleEntry(tmpDir, updated);

    const data = readChaptersJson(tmpDir);
    expect(data.chapters).toHaveLength(1);
    expect(data.chapters[0].agents).toEqual(["note-taker", "reviewer"]);
    expect(data.chapters[0].createdAt).toBe("2026-03-10T10:00:00Z"); // preserved
    expect(data.chapters[0].updatedAt).toBe("2026-03-10T14:00:00Z"); // updated
  });

  it("does not affect other entries", () => {
    const existing = makeEntry({
      lodge: "acme",
      chapter: "platform",
      role: "editor",
    });
    writeChaptersJson(tmpDir, { chapters: [existing] });

    const newEntry = makeEntry({
      lodge: "acme",
      chapter: "platform",
      role: "writer",
    });
    upsertRoleEntry(tmpDir, newEntry);

    const data = readChaptersJson(tmpDir);
    expect(data.chapters).toHaveLength(2);
  });

  it("creates chapters.json if it does not exist", () => {
    const entry = makeEntry({
      lodge: "acme",
      chapter: "platform",
      role: "writer",
    });

    upsertRoleEntry(tmpDir, entry);

    expect(fs.existsSync(path.join(tmpDir, "chapters.json"))).toBe(true);
    const data = readChaptersJson(tmpDir);
    expect(data.chapters).toHaveLength(1);
  });
});

// Helper to create a ChapterEntry with sensible defaults
function makeEntry(overrides: Partial<ChapterEntry> = {}): ChapterEntry {
  return {
    lodge: "acme",
    chapter: "platform",
    role: "writer",
    dockerBuild: "/path/to/docker",
    roleDir: "/home/.clawmasons/acme/platform/writer",
    agents: ["note-taker"],
    createdAt: "2026-03-10T12:00:00Z",
    updatedAt: "2026-03-10T12:00:00Z",
    ...overrides,
  };
}
