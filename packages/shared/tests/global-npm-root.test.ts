import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock node:child_process so promisify can wrap it correctly
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    exec: vi.fn(),
  };
});

import { exec } from "node:child_process";

const mockExec = exec as unknown as ReturnType<typeof vi.fn>;

// Import after mock setup
import {
  getGlobalNpmRoot,
  resetGlobalNpmRootCache,
} from "../src/role/global-npm-root.js";

describe("getGlobalNpmRoot", () => {
  beforeEach(() => {
    resetGlobalNpmRootCache();
    mockExec.mockReset();
  });

  it("returns the path from npm root -g on success", async () => {
    mockExec.mockImplementation(
      (
        _cmd: string,
        cb: (err: null, result: { stdout: string; stderr: string }) => void,
      ) => {
        cb(null, { stdout: "/usr/local/lib/node_modules\n", stderr: "" });
      },
    );

    const result = await getGlobalNpmRoot();
    expect(result).toBe("/usr/local/lib/node_modules");
  });

  it("returns null when exec passes an error to callback", async () => {
    mockExec.mockImplementation(
      (_cmd: string, cb: (err: Error) => void) => {
        cb(new Error("npm not found"));
      },
    );

    const result = await getGlobalNpmRoot();
    expect(result).toBeNull();
  });

  it("returns null when stdout is empty", async () => {
    mockExec.mockImplementation(
      (
        _cmd: string,
        cb: (err: null, result: { stdout: string; stderr: string }) => void,
      ) => {
        cb(null, { stdout: "   \n", stderr: "" });
      },
    );

    const result = await getGlobalNpmRoot();
    expect(result).toBeNull();
  });

  it("caches the result — exec called only once across multiple calls", async () => {
    mockExec.mockImplementation(
      (
        _cmd: string,
        cb: (err: null, result: { stdout: string; stderr: string }) => void,
      ) => {
        cb(null, { stdout: "/usr/local/lib/node_modules\n", stderr: "" });
      },
    );

    await getGlobalNpmRoot();
    await getGlobalNpmRoot();
    await getGlobalNpmRoot();

    expect(mockExec).toHaveBeenCalledTimes(1);
  });

  it("caches null result — exec not retried after failure", async () => {
    mockExec.mockImplementation((_cmd: string, cb: (err: Error) => void) => {
      cb(new Error("not found"));
    });

    await getGlobalNpmRoot();
    await getGlobalNpmRoot();

    expect(mockExec).toHaveBeenCalledTimes(1);
  });
});
