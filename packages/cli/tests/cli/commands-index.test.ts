import { Command } from "commander";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock agent-sdk config readers before importing the module under test
vi.mock("@clawmasons/agent-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clawmasons/agent-sdk")>();
  return {
    ...actual,
    readConfigAgentNames: vi.fn(() => ["custom-agent"]),
    readConfigAliasNames: vi.fn(() => ["dev", "review"]),
  };
});

import { registerCommands } from "../../src/cli/commands/index.js";

describe("installAgentTypeShorthand", () => {
  let program: Command;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let errorSpy: any;

  beforeEach(() => {
    program = new Command();
    program.name("mason").description("test");
    // Prevent Commander from calling process.exit on its own errors
    program.exitOverride();
    registerCommands(program);

    // Spy on process.exit and console.error to capture error behavior
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  // With from: "user", args are treated directly as user arguments.
  // ["claude", "--role", "dev"] means firstArg is "claude".

  it("rewrites a known agent type to run command", () => {
    // "claude" is a known agent type via isKnownAgentType (resolved from agent registry).
    // When rewritten to "run claude", Commander will try to run the action which
    // may fail, but our shorthand hook should NOT call process.exit(1) with an
    // unknown command error.
    try {
      program.parse(["claude", "--role", "dev"], { from: "user" });
    } catch {
      // Commander may throw due to exitOverride — that's fine
    }
    // Verify our unknown-command handler was NOT called
    const unknownCmdCalls = errorSpy.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("Unknown command"),
    );
    expect(unknownCmdCalls.length).toBe(0);
  });

  it("rewrites a config-declared agent name to run command", () => {
    // "custom-agent" is returned by the mocked readConfigAgentNames
    try {
      program.parse(["custom-agent"], { from: "user" });
    } catch {
      // Commander may throw due to action failing
    }
    const unknownCmdCalls = errorSpy.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("Unknown command"),
    );
    expect(unknownCmdCalls.length).toBe(0);
  });

  it("rewrites a config-declared alias name to run command", () => {
    // "dev" is returned by the mocked readConfigAliasNames
    try {
      program.parse(["dev"], { from: "user" });
    } catch {
      // Commander may throw
    }
    const unknownCmdCalls = errorSpy.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("Unknown command"),
    );
    expect(unknownCmdCalls.length).toBe(0);
  });

  it("rewrites a second config-declared alias name to run command", () => {
    // "review" is returned by the mocked readConfigAliasNames
    try {
      program.parse(["review"], { from: "user" });
    } catch {
      // Commander may throw
    }
    const unknownCmdCalls = errorSpy.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("Unknown command"),
    );
    expect(unknownCmdCalls.length).toBe(0);
  });

  it("does not rewrite a known command", () => {
    // "run" is a registered command — should not be caught by shorthand hook
    try {
      program.parse(["run"], { from: "user" });
    } catch {
      // Commander may throw
    }
    const unknownCmdCalls = errorSpy.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("Unknown command"),
    );
    expect(unknownCmdCalls.length).toBe(0);
  });

  it("exits with error for unknown first argument", () => {
    try {
      program.parse(["nonexistent-thing"], { from: "user" });
    } catch {
      // may throw
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalled();

    const errorOutput = errorSpy.mock.calls[0]?.[0] as string;
    expect(errorOutput).toContain('Unknown command "nonexistent-thing"');
    expect(errorOutput).toContain("Available commands:");
    expect(errorOutput).toContain("Available agents:");
  });

  it("includes configured aliases in error message", () => {
    try {
      program.parse(["nonexistent-thing"], { from: "user" });
    } catch {
      // may throw
    }

    const errorOutput = errorSpy.mock.calls[0]?.[0] as string;
    expect(errorOutput).toContain("Configured aliases:");
    expect(errorOutput).toContain("dev");
    expect(errorOutput).toContain("review");
  });

  it("does not treat flags as unknown commands", () => {
    // Arguments starting with "-" should not trigger unknown command error
    try {
      program.parse(["--version"], { from: "user" });
    } catch {
      // Commander may throw for --version with exitOverride
    }

    // Should NOT have been called with our "Unknown command" error
    const unknownCmdCalls = errorSpy.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("Unknown command"),
    );
    expect(unknownCmdCalls.length).toBe(0);
  });

  it("works with parseAsync for known agent types", async () => {
    // This test verifies the shorthand hook recognizes "claude" as an agent type.
    // parseAsync triggers the full run action (which calls generateProjectRole, Docker checks, etc.)
    // but we only care that the pre-parse hook did not emit "Unknown command".
    // We race against a short timer since the mocked process.exit doesn't halt execution.
    try {
      await Promise.race([
        program.parseAsync(["claude"], { from: "user" }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
      ]);
    } catch {
      // Commander may throw, or our timeout fires — both are fine
    }
    const unknownCmdCalls = errorSpy.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("Unknown command"),
    );
    expect(unknownCmdCalls.length).toBe(0);
  });

  it("works with parseAsync for config aliases", async () => {
    try {
      await program.parseAsync(["dev"], { from: "user" });
    } catch {
      // Commander may throw
    }
    const unknownCmdCalls = errorSpy.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("Unknown command"),
    );
    expect(unknownCmdCalls.length).toBe(0);
  });

  it("exits with error via parseAsync for unknown arguments", async () => {
    try {
      await program.parseAsync(["unknown-thing"], { from: "user" });
    } catch {
      // may throw
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls[0]?.[0] as string;
    expect(errorOutput).toContain('Unknown command "unknown-thing"');
  });

  it("lists agent types in error output", () => {
    try {
      program.parse(["bogus"], { from: "user" });
    } catch {
      // may throw
    }

    const errorOutput = errorSpy.mock.calls[0]?.[0] as string;
    // Should include known agent types from registry (aliases + canonical names)
    expect(errorOutput).toContain("claude");
    expect(errorOutput).toContain("pi");
  });

  it("includes all known commands in error output", () => {
    try {
      program.parse(["bogus"], { from: "user" });
    } catch {
      // may throw
    }

    const errorOutput = errorSpy.mock.calls[0]?.[0] as string;
    expect(errorOutput).toContain("run");
    expect(errorOutput).toContain("build");
    expect(errorOutput).toContain("validate");
    expect(errorOutput).toContain("list");
  });
});
