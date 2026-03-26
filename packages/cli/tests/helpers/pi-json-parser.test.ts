import { describe, it, expect } from "vitest";
import { mockPiCodingAgent } from "./mock-agent-packages.js";

const parse = mockPiCodingAgent.jsonMode!.parseJsonStreamAsACP;

describe("Pi Coding Agent jsonMode parser", () => {
  // ---------- assistant_message ----------
  it("parses assistant_message with a text block into agent_message_chunk", () => {
    const line = JSON.stringify({
      type: "assistant_message",
      content: [{ type: "text", text: "Hello world" }],
    });
    expect(parse(line)).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Hello world" },
    });
  });

  it("joins multiple text blocks with newline", () => {
    const line = JSON.stringify({
      type: "assistant_message",
      content: [
        { type: "text", text: "Line 1" },
        { type: "text", text: "Line 2" },
      ],
    });
    expect(parse(line)).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Line 1\nLine 2" },
    });
  });

  it("returns null for assistant_message with no text blocks", () => {
    const line = JSON.stringify({
      type: "assistant_message",
      content: [{ type: "image", url: "http://example.com/img.png" }],
    });
    expect(parse(line)).toBeNull();
  });

  // ---------- tool_call ----------
  it("parses tool_call into tool_call with in_progress status", () => {
    const line = JSON.stringify({
      type: "tool_call",
      id: "tc-1",
      name: "read_file",
    });
    expect(parse(line)).toEqual({
      sessionUpdate: "tool_call",
      toolCall: {
        toolCallId: "tc-1",
        title: "read_file",
        kind: "other",
        status: "in_progress",
      },
    });
  });

  // ---------- tool_result ----------
  it("parses tool_result into tool_call_update with completed status and stringified content", () => {
    const content = { output: "file contents here" };
    const line = JSON.stringify({
      type: "tool_result",
      id: "tc-1",
      content,
    });
    expect(parse(line)).toEqual({
      sessionUpdate: "tool_call_update",
      toolCall: {
        toolCallId: "tc-1",
        status: "completed",
        content: [
          {
            type: "content",
            content: { type: "text", text: JSON.stringify(content) },
          },
        ],
      },
    });
  });

  // ---------- agent_end ----------
  it("parses agent_end with messages into agent_message_chunk from last assistant", () => {
    const line = JSON.stringify({
      type: "agent_end",
      messages: [
        { role: "user", content: [{ type: "text", text: "hi" }] },
        { role: "assistant", content: [{ type: "text", text: "First response" }] },
        { role: "user", content: [{ type: "text", text: "thanks" }] },
        { role: "assistant", content: [{ type: "text", text: "Final answer" }] },
      ],
    });
    expect(parse(line)).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Final answer" },
    });
  });

  it("returns null for agent_end with no assistant messages", () => {
    const line = JSON.stringify({
      type: "agent_end",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    });
    expect(parse(line)).toBeNull();
  });

  it("returns null for agent_end with empty messages array", () => {
    const line = JSON.stringify({
      type: "agent_end",
      messages: [],
    });
    expect(parse(line)).toBeNull();
  });

  // ---------- unknown event ----------
  it("returns null for unknown event types", () => {
    const line = JSON.stringify({ type: "unknown_event", data: "something" });
    expect(parse(line)).toBeNull();
  });

  // ---------- jsonStreamArgs and buildPromptArgs ----------
  it("has correct jsonStreamArgs", () => {
    expect(mockPiCodingAgent.jsonMode!.jsonStreamArgs).toEqual(["--mode", "json"]);
  });

  it("builds correct prompt args", () => {
    expect(mockPiCodingAgent.jsonMode!.buildPromptArgs!("do something")).toEqual([
      "-p",
      "do something",
    ]);
  });
});
