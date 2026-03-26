import { describe, expect, it } from "vitest";
import { mockCodexAgent } from "./mock-agent-packages.js";
import type { AcpSessionUpdate } from "@clawmasons/agent-sdk";

const parse = mockCodexAgent.jsonMode!.parseJsonStreamAsACP;

// ---------------------------------------------------------------------------
// Helper to build Codex NDJSON fixture lines
// ---------------------------------------------------------------------------

function codexEvent(type: string, item: Record<string, unknown>): string {
  return JSON.stringify({ type, item });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Codex Agent jsonMode parser", () => {
  // 1. item.completed + agent_message → agent_message_chunk
  it("maps item.completed + agent_message to agent_message_chunk", () => {
    const line = codexEvent("item.completed", { type: "agent_message", text: "I found the bug in your code." });
    const result = parse(line);

    expect(result).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "I found the bug in your code." },
    } satisfies AcpSessionUpdate);
  });

  // 2. item.completed + reasoning → agent_thought_chunk
  it("maps item.completed + reasoning to agent_thought_chunk", () => {
    const line = codexEvent("item.completed", { type: "reasoning", text: "Let me think about this..." });
    const result = parse(line);

    expect(result).toEqual({
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "Let me think about this..." },
    } satisfies AcpSessionUpdate);
  });

  // 3. item.started + command_execution → tool_call (in_progress)
  it("maps item.started + command_execution to tool_call in_progress", () => {
    const line = codexEvent("item.started", { type: "command_execution", id: "cmd_001", command: "npm test" });
    const result = parse(line);

    expect(result).toEqual({
      sessionUpdate: "tool_call",
      toolCall: {
        toolCallId: "cmd_001",
        title: "npm test",
        kind: "command_execution",
        status: "in_progress",
      },
    } satisfies AcpSessionUpdate);
  });

  // 4. item.completed + command_execution → tool_call_update (completed with aggregated_output)
  it("maps item.completed + command_execution to tool_call_update completed", () => {
    const line = codexEvent("item.completed", {
      type: "command_execution",
      id: "cmd_001",
      command: "npm test",
      aggregated_output: "All 42 tests passed.",
    });
    const result = parse(line);

    expect(result).toEqual({
      sessionUpdate: "tool_call_update",
      toolCall: {
        toolCallId: "cmd_001",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "All 42 tests passed." } }],
      },
    } satisfies AcpSessionUpdate);
  });

  // 4b. item.completed + command_execution with no aggregated_output defaults to ""
  it("defaults aggregated_output to empty string when missing", () => {
    const line = codexEvent("item.completed", {
      type: "command_execution",
      id: "cmd_002",
      command: "ls",
    });
    const result = parse(line);

    expect(result).toEqual({
      sessionUpdate: "tool_call_update",
      toolCall: {
        toolCallId: "cmd_002",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "" } }],
      },
    });
  });

  // 5. item.completed + file_change → tool_call_update with change summary
  it("maps item.completed + file_change to tool_call_update with change summary", () => {
    const line = codexEvent("item.completed", {
      type: "file_change",
      id: "fc_001",
      changes: [
        { path: "src/index.ts", kind: "modified" },
        { path: "src/utils.ts", kind: "created" },
      ],
    });
    const result = parse(line);

    expect(result).toEqual({
      sessionUpdate: "tool_call_update",
      toolCall: {
        toolCallId: "fc_001",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "modified: src/index.ts, created: src/utils.ts" } }],
      },
    } satisfies AcpSessionUpdate);
  });

  // 6. item.started + mcp_tool_call → tool_call (in_progress, title = "server:tool")
  it("maps item.started + mcp_tool_call to tool_call in_progress", () => {
    const line = codexEvent("item.started", {
      type: "mcp_tool_call",
      id: "mcp_001",
      server: "mason",
      tool: "search_files",
    });
    const result = parse(line);

    expect(result).toEqual({
      sessionUpdate: "tool_call",
      toolCall: {
        toolCallId: "mcp_001",
        title: "mason:search_files",
        kind: "other",
        status: "in_progress",
      },
    } satisfies AcpSessionUpdate);
  });

  // 7. item.completed + mcp_tool_call → tool_call_update (completed with result)
  it("maps item.completed + mcp_tool_call to tool_call_update completed", () => {
    const resultContent = [{ type: "text", text: "Found 3 matches" }];
    const line = codexEvent("item.completed", {
      type: "mcp_tool_call",
      id: "mcp_001",
      server: "mason",
      tool: "search_files",
      result: { content: resultContent },
    });
    const result = parse(line);

    expect(result).toEqual({
      sessionUpdate: "tool_call_update",
      toolCall: {
        toolCallId: "mcp_001",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: JSON.stringify(resultContent) } }],
      },
    } satisfies AcpSessionUpdate);
  });

  // 7b. item.completed + mcp_tool_call with no result content → empty text
  it("defaults mcp_tool_call result to empty string when no content", () => {
    const line = codexEvent("item.completed", {
      type: "mcp_tool_call",
      id: "mcp_002",
      server: "mason",
      tool: "noop",
      result: {},
    });
    const result = parse(line);

    expect(result).toEqual({
      sessionUpdate: "tool_call_update",
      toolCall: {
        toolCallId: "mcp_002",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "" } }],
      },
    });
  });

  // 8. item.started + todo_list → plan with entries
  it("maps item.started + todo_list to plan with entries", () => {
    const line = codexEvent("item.started", {
      type: "todo_list",
      items: [
        { text: "Read the source code", completed: false },
        { text: "Fix the bug", completed: false },
        { text: "Write tests", completed: false },
      ],
    });
    const result = parse(line);

    expect(result).toEqual({
      sessionUpdate: "plan",
      entries: [
        { content: "Read the source code", priority: "medium", status: "in_progress" },
        { content: "Fix the bug", priority: "medium", status: "pending" },
        { content: "Write tests", priority: "medium", status: "pending" },
      ],
    } satisfies AcpSessionUpdate);
  });

  // 9. item.updated + todo_list with mixed completed states → correct status mapping
  it("maps item.updated + todo_list with mixed states to plan with correct statuses", () => {
    const line = codexEvent("item.updated", {
      type: "todo_list",
      items: [
        { text: "Read the source code", completed: true },
        { text: "Fix the bug", completed: true },
        { text: "Write tests", completed: false },
        { text: "Update docs", completed: false },
      ],
    });
    const result = parse(line);

    expect(result).toEqual({
      sessionUpdate: "plan",
      entries: [
        { content: "Read the source code", priority: "medium", status: "completed" },
        { content: "Fix the bug", priority: "medium", status: "completed" },
        { content: "Write tests", priority: "medium", status: "in_progress" },
        { content: "Update docs", priority: "medium", status: "pending" },
      ],
    } satisfies AcpSessionUpdate);
  });

  // 10. turn.completed → null
  it("returns null for turn.completed", () => {
    const line = JSON.stringify({ type: "turn.completed" });
    expect(parse(line)).toBeNull();
  });

  // 11. turn.failed → null
  it("returns null for turn.failed", () => {
    const line = JSON.stringify({ type: "turn.failed", error: "timeout" });
    expect(parse(line)).toBeNull();
  });

  // 12. thread.started → null
  it("returns null for thread.started", () => {
    const line = JSON.stringify({ type: "thread.started", thread_id: "t_123" });
    expect(parse(line)).toBeNull();
  });

  // 13. buildPromptArgs returns [prompt] (positional, no flag)
  it("buildPromptArgs returns positional prompt with no flag", () => {
    expect(mockCodexAgent.jsonMode!.buildPromptArgs!("fix the tests")).toEqual([
      "fix the tests",
    ]);
  });

  // jsonMode configuration
  it("has correct jsonStreamArgs", () => {
    expect(mockCodexAgent.jsonMode!.jsonStreamArgs).toEqual([
      "exec", "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check", "--json",
    ]);
  });
});
