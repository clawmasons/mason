import { describe, it, expect, vi } from "vitest";
import {
  parseCommand,
  formatResult,
  formatHelp,
  executeCommand,
  type ToolCaller,
  type ToolDefinition,
  type ToolCallResult,
} from "../src/tool-caller.js";

// ── parseCommand ──────────────────────────────────────────────────────

describe("parseCommand", () => {
  it("parses 'list' command", () => {
    expect(parseCommand("list")).toEqual({ type: "list" });
  });

  it("parses 'exit' command", () => {
    expect(parseCommand("exit")).toEqual({ type: "exit" });
  });

  it("parses 'help' command", () => {
    expect(parseCommand("help")).toEqual({ type: "help" });
  });

  it("parses empty input as help", () => {
    expect(parseCommand("")).toEqual({ type: "help" });
    expect(parseCommand("  ")).toEqual({ type: "help" });
  });

  it("parses tool name with JSON args", () => {
    const result = parseCommand('my_tool {"key": "val"}');
    expect(result).toEqual({
      type: "call",
      toolName: "my_tool",
      args: { key: "val" },
    });
  });

  it("parses tool name with complex JSON args", () => {
    const result = parseCommand('github_create_pr {"title": "test", "body": "desc", "draft": true}');
    expect(result).toEqual({
      type: "call",
      toolName: "github_create_pr",
      args: { title: "test", body: "desc", draft: true },
    });
  });

  it("parses tool name with no args as call with empty args", () => {
    expect(parseCommand("my_tool")).toEqual({
      type: "call",
      toolName: "my_tool",
      args: {},
    });
  });

  it("returns error for invalid JSON args", () => {
    const result = parseCommand("my_tool invalid-json");
    expect(result.type).toBe("error");
    if (result.type === "error") {
      expect(result.message).toContain("Invalid JSON");
    }
  });

  it("returns error for non-object JSON args (array)", () => {
    const result = parseCommand('my_tool [1, 2, 3]');
    expect(result.type).toBe("error");
    if (result.type === "error") {
      expect(result.message).toContain("JSON object");
    }
  });

  it("returns error for non-object JSON args (string)", () => {
    const result = parseCommand('my_tool "just a string"');
    expect(result.type).toBe("error");
    if (result.type === "error") {
      expect(result.message).toContain("JSON object");
    }
  });

  it("trims whitespace from input", () => {
    expect(parseCommand("  list  ")).toEqual({ type: "list" });
    expect(parseCommand("  exit  ")).toEqual({ type: "exit" });
  });
});

// ── formatResult ──────────────────────────────────────────────────────

describe("formatResult", () => {
  it("formats successful result", () => {
    const result: ToolCallResult = {
      content: [{ type: "text", text: "Success message" }],
    };
    expect(formatResult(result)).toBe("Result: Success message");
  });

  it("formats error result", () => {
    const result: ToolCallResult = {
      content: [{ type: "text", text: "Something went wrong" }],
      isError: true,
    };
    expect(formatResult(result)).toBe("Error: Something went wrong");
  });

  it("joins multi-content results", () => {
    const result: ToolCallResult = {
      content: [
        { type: "text", text: "Line 1" },
        { type: "text", text: "Line 2" },
      ],
    };
    expect(formatResult(result)).toBe("Result: Line 1\nLine 2");
  });
});

// ── formatHelp ────────────────────────────────────────────────────────

describe("formatHelp", () => {
  it("generates help with available tools", () => {
    const tools: ToolDefinition[] = [
      { name: "github_create_pr", description: "Create a pull request" },
      { name: "slack_post_message", description: "Post a message" },
    ];

    const help = formatHelp(tools);
    expect(help).toContain("[mcp-agent] Available commands:");
    expect(help).toContain("list");
    expect(help).toContain("help");
    expect(help).toContain("exit");
    expect(help).toContain("Available tools:");
    expect(help).toContain("github_create_pr");
    expect(help).toContain("Create a pull request");
    expect(help).toContain("slack_post_message");
  });

  it("generates help with no tools", () => {
    const help = formatHelp([]);
    expect(help).toContain("[mcp-agent] Available commands:");
    expect(help).toContain("No tools available");
  });

  it("handles tools without descriptions", () => {
    const tools: ToolDefinition[] = [
      { name: "simple_tool" },
    ];

    const help = formatHelp(tools);
    expect(help).toContain("simple_tool");
    expect(help).not.toContain("undefined");
  });
});

// ── executeCommand ────────────────────────────────────────────────────

describe("executeCommand", () => {
  function createMockCaller(tools: ToolDefinition[] = []): ToolCaller {
    return {
      listTools: vi.fn().mockResolvedValue(tools),
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "mock result" }],
      }),
    };
  }

  it("handles 'list' command by calling listTools", async () => {
    const tools: ToolDefinition[] = [
      { name: "tool_a", description: "Tool A" },
      { name: "tool_b", description: "Tool B" },
    ];
    const caller = createMockCaller(tools);

    const result = await executeCommand("list", caller);
    expect(result.exit).toBe(false);
    expect(result.output).toContain("tool_a");
    expect(result.output).toContain("tool_b");
    expect(caller.listTools).toHaveBeenCalled();
  });

  it("handles 'list' with no tools", async () => {
    const caller = createMockCaller([]);

    const result = await executeCommand("list", caller);
    expect(result.exit).toBe(false);
    expect(result.output).toContain("No tools available");
  });

  it("handles 'exit' command", async () => {
    const caller = createMockCaller();
    const result = await executeCommand("exit", caller);
    expect(result.exit).toBe(true);
    expect(result.output).toContain("Goodbye");
  });

  it("handles 'help' command", async () => {
    const tools: ToolDefinition[] = [{ name: "my_tool" }];
    const result = await executeCommand("help", createMockCaller(), tools);
    expect(result.exit).toBe(false);
    expect(result.output).toContain("Available commands");
    expect(result.output).toContain("my_tool");
  });

  it("handles tool call command", async () => {
    const caller = createMockCaller();
    const result = await executeCommand('my_tool {"key": "val"}', caller);
    expect(result.exit).toBe(false);
    expect(result.output).toContain("mock result");
    expect(caller.callTool).toHaveBeenCalledWith("my_tool", { key: "val" });
  });

  it("handles tool call with no args", async () => {
    const caller = createMockCaller();
    const result = await executeCommand("my_tool", caller);
    expect(result.exit).toBe(false);
    expect(caller.callTool).toHaveBeenCalledWith("my_tool", {});
  });

  it("handles tool call error with help", async () => {
    const caller: ToolCaller = {
      listTools: vi.fn().mockResolvedValue([]),
      callTool: vi.fn().mockRejectedValue(new Error("tool not found")),
    };
    const tools: ToolDefinition[] = [{ name: "real_tool" }];

    const result = await executeCommand("bad_tool", caller, tools);
    expect(result.exit).toBe(false);
    expect(result.output).toContain("tool not found");
    expect(result.output).toContain("Available commands");
    expect(result.output).toContain("real_tool");
  });

  it("handles invalid JSON in command", async () => {
    const caller = createMockCaller();
    const result = await executeCommand("my_tool {invalid}", caller);
    expect(result.exit).toBe(false);
    expect(result.output).toContain("Invalid JSON");
  });

  it("handles listTools error", async () => {
    const caller: ToolCaller = {
      listTools: vi.fn().mockRejectedValue(new Error("connection refused")),
      callTool: vi.fn(),
    };

    const result = await executeCommand("list", caller);
    expect(result.exit).toBe(false);
    expect(result.output).toContain("connection refused");
  });
});
