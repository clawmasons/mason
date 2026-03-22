import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { showApprovalDialog, escapeForOsascript } from "../../src/approvals/dialog.js";

// ── Mock child_process.exec ──────────────────────────────────────────

vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

import { exec } from "node:child_process";

const mockExec = vi.mocked(exec);

// ── escapeForOsascript Tests ─────────────────────────────────────────

describe("escapeForOsascript", () => {
  it("escapes double quotes", () => {
    expect(escapeForOsascript('say "hello"')).toBe('say \\"hello\\"');
  });

  it("escapes backslashes", () => {
    expect(escapeForOsascript("path\\to\\file")).toBe("path\\\\to\\\\file");
  });

  it("escapes both backslashes and double quotes", () => {
    expect(escapeForOsascript('a\\b"c')).toBe('a\\\\b\\"c');
  });

  it("returns empty string unchanged", () => {
    expect(escapeForOsascript("")).toBe("");
  });

  it("returns normal text unchanged", () => {
    expect(escapeForOsascript("github_delete_repo")).toBe("github_delete_repo");
  });
});

// ── showApprovalDialog Tests ─────────────────────────────────────────

describe("showApprovalDialog", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    mockExec.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  describe("on macOS (darwin)", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "darwin" });
    });

    it("returns true when user clicks Approve", async () => {
      mockExec.mockImplementation((_cmd: string, callback: unknown) => {
        (callback as (err: null, stdout: string) => void)(null, "button returned:Approve");
        return undefined as never;
      });

      const result = await showApprovalDialog("github_delete_repo", '{"repo":"test"}', "researcher");
      expect(result).toBe(true);
    });

    it("returns false when user clicks Deny", async () => {
      mockExec.mockImplementation((_cmd: string, callback: unknown) => {
        (callback as (err: null, stdout: string) => void)(null, "button returned:Deny");
        return undefined as never;
      });

      const result = await showApprovalDialog("github_delete_repo", '{"repo":"test"}', "researcher");
      expect(result).toBe(false);
    });

    it("returns false when dialog is closed (error)", async () => {
      mockExec.mockImplementation((_cmd: string, callback: unknown) => {
        (callback as (err: Error, stdout: string) => void)(
          new Error("User cancelled"),
          "",
        );
        return undefined as never;
      });

      const result = await showApprovalDialog("github_delete_repo", undefined, "researcher");
      expect(result).toBe(false);
    });

    it("passes escaped tool name and arguments to osascript", async () => {
      mockExec.mockImplementation((_cmd: string, callback: unknown) => {
        (callback as (err: null, stdout: string) => void)(null, "button returned:Approve");
        return undefined as never;
      });

      await showApprovalDialog('tool"with"quotes', '{"key":"val\\"ue"}', "agent");

      expect(mockExec).toHaveBeenCalledTimes(1);
      const cmd = mockExec.mock.calls[0][0] as string;
      expect(cmd).toContain("osascript");
      // Verify quotes are escaped in the osascript command
      expect(cmd).toContain('tool\\"with\\"quotes');
    });

    it("works without arguments", async () => {
      mockExec.mockImplementation((_cmd: string, callback: unknown) => {
        (callback as (err: null, stdout: string) => void)(null, "button returned:Approve");
        return undefined as never;
      });

      const result = await showApprovalDialog("github_list_repos", undefined, "researcher");
      expect(result).toBe(true);

      expect(mockExec).toHaveBeenCalledTimes(1);
      const cmd = mockExec.mock.calls[0][0] as string;
      expect(cmd).not.toContain("Arguments:");
    });
  });

  describe("on non-macOS", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "linux" });
    });

    it("auto-approves with console warning", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await showApprovalDialog("github_delete_repo", undefined, "researcher");
      expect(result).toBe(true);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("approval auto-approved on linux"),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("github_delete_repo"),
      );

      warnSpy.mockRestore();
    });

    it("does not invoke exec on non-macOS", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await showApprovalDialog("some_tool", undefined, "agent");
      expect(mockExec).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});
