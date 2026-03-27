import { describe, expect, it } from "vitest";
import { mockClaudeCodeAgent } from "./mock-agent-packages.js";
import type { AcpSessionUpdate } from "@clawmasons/agent-sdk";

const parse = mockClaudeCodeAgent.jsonMode!.parseJsonStreamAsACP;

// ---------------------------------------------------------------------------
// Helper to build Claude stream-json fixture lines
// ---------------------------------------------------------------------------

function assistantEvent(content: Array<Record<string, unknown>>): string {
  return JSON.stringify({ type: "assistant", message: { content } });
}

function resultEvent(result: string): string {
  return JSON.stringify({ type: "result", result });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Claude Code Agent jsonMode parser", () => {
  // 1. assistant event with text block -> agent_message_chunk
  it("maps assistant event with text block to agent_message_chunk", () => {
    const line = assistantEvent([{ type: "text", text: "Hello, I'll help you fix that bug." }]);
    const result = parse(line);

    expect(result).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Hello, I'll help you fix that bug." },
    } satisfies AcpSessionUpdate);
  });

  // 2. assistant event with tool_use block -> tool_call
  it("maps assistant event with tool_use block to tool_call", () => {
    const line = assistantEvent([
      { type: "tool_use", id: "toolu_abc123", name: "Read", input: { file_path: "src/index.ts" } },
    ]);
    const result = parse(line);

    expect(result).toEqual({
      sessionUpdate: "tool_call",
      toolCallId: "toolu_abc123",
      title: "Read",
      kind: "other",
      status: "in_progress",
    } satisfies AcpSessionUpdate);
  });

  // 3. result event -> agent_message_chunk
  it("maps result event to agent_message_chunk", () => {
    const line = resultEvent("All tests are passing now. I fixed the off-by-one error.");
    const result = parse(line);

    expect(result).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "All tests are passing now. I fixed the off-by-one error." },
    } satisfies AcpSessionUpdate);
  });

  // 4. system or unknown event type -> returns null
  it("returns null for system event", () => {
    const line = JSON.stringify({ type: "system", message: "Claude Code v1.0" });
    expect(parse(line)).toBeNull();
  });

  it("returns null for unknown event type", () => {
    const line = JSON.stringify({ type: "stream_event", data: {} });
    expect(parse(line)).toBeNull();
  });

  it("returns null for event with no type", () => {
    const line = JSON.stringify({ foo: "bar" });
    expect(parse(line)).toBeNull();
  });

  // 5. Multiple content blocks — first match wins (text before tool_use)
  it("returns first matching block when multiple content blocks present", () => {
    const line = assistantEvent([
      { type: "text", text: "Let me read that file." },
      { type: "tool_use", id: "toolu_xyz", name: "Read", input: { file_path: "foo.ts" } },
    ]);
    const result = parse(line);

    // text block comes first, so agent_message_chunk wins
    expect(result).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Let me read that file." },
    });
  });

  it("returns tool_call when tool_use is the first recognized block", () => {
    const line = assistantEvent([
      { type: "tool_use", id: "toolu_first", name: "Write", input: {} },
      { type: "text", text: "Done." },
    ]);
    const result = parse(line);

    expect(result).toEqual({
      sessionUpdate: "tool_call",
      toolCallId: "toolu_first",
      title: "Write",
      kind: "other",
      status: "in_progress",
    });
  });

  // 6. tool_result blocks are skipped (not emitted by Claude stream-json without --include-partial-messages)
  it("skips tool_result blocks and returns null when no other recognized blocks", () => {
    const line = assistantEvent([
      { type: "tool_result", tool_use_id: "toolu_abc123", content: "file contents here" },
    ]);
    const result = parse(line);

    expect(result).toBeNull();
  });

  it("skips tool_result block but returns next recognized block", () => {
    const line = assistantEvent([
      { type: "tool_result", tool_use_id: "toolu_abc123", content: "file contents" },
      { type: "text", text: "I found the issue." },
    ]);
    const result = parse(line);

    expect(result).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "I found the issue." },
    });
  });

  // Edge cases
  it("returns null for assistant event with empty content array", () => {
    const line = assistantEvent([]);
    expect(parse(line)).toBeNull();
  });

  it("returns null for assistant event with no message", () => {
    const line = JSON.stringify({ type: "assistant" });
    expect(parse(line)).toBeNull();
  });

  it("returns null for result event with empty result", () => {
    const line = JSON.stringify({ type: "result", result: "" });
    expect(parse(line)).toBeNull();
  });

  // jsonMode configuration
  it("has correct jsonStreamArgs", () => {
    expect(mockClaudeCodeAgent.jsonMode!.jsonStreamArgs).toEqual([
      "--output-format", "stream-json", "--verbose",
    ]);
  });

  it("buildPromptArgs returns -p flag with prompt", () => {
    expect(mockClaudeCodeAgent.jsonMode!.buildPromptArgs!("fix the tests")).toEqual([
      "-p", "fix the tests",
    ]);
  });
});
