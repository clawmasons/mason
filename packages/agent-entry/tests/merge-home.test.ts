import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the modules before importing
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

import * as fs from "node:fs";
import * as child_process from "node:child_process";
import { mergeHomeBuild } from "../src/index.js";

const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
const mockExecSync = child_process.execSync as ReturnType<typeof vi.fn>;

describe("mergeHomeBuild", () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockExecSync.mockReset();
  });

  it("skips silently when backup directory does not exist", () => {
    mockExistsSync.mockReturnValue(false);

    mergeHomeBuild();

    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("calls cp -rn when backup directory exists", () => {
    mockExistsSync.mockReturnValue(true);
    mockExecSync.mockReturnValue(Buffer.from(""));

    mergeHomeBuild();

    expect(mockExecSync).toHaveBeenCalledWith(
      "cp -rn /home/mason-from-build/. /home/mason/",
      { stdio: "pipe" },
    );
  });

  it("does not throw when cp -rn exits non-zero (no-clobber skip)", () => {
    mockExistsSync.mockReturnValue(true);
    mockExecSync.mockImplementation(() => {
      throw new Error("cp exited with code 1");
    });

    expect(() => mergeHomeBuild()).not.toThrow();
  });
});
