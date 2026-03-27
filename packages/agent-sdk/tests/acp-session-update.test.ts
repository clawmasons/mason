import { describe, expect, it } from "vitest";
import type { AcpSessionUpdate, AcpToolCallFields, AcpToolCallUpdateFields, ToolKind, ToolCallStatus, AgentPackage } from "../src/types.js";

// ── ToolKind & ToolCallStatus ───────────────────────────────────────────────

describe("ToolKind", () => {
  it("accepts all valid ACP tool kinds", () => {
    const kinds: ToolKind[] = ["read", "edit", "delete", "move", "search", "execute", "think", "fetch", "switch_mode", "other"];
    expect(kinds).toHaveLength(10);
  });
});

describe("ToolCallStatus", () => {
  it("accepts all valid ACP tool call statuses", () => {
    const statuses: ToolCallStatus[] = ["pending", "in_progress", "completed", "failed"];
    expect(statuses).toHaveLength(4);
  });
});

// ── AcpToolCallFields ───────────────────────────────────────────────────────

describe("AcpToolCallFields", () => {
  it("accepts a minimal tool call (title required)", () => {
    const fields: AcpToolCallFields = {
      toolCallId: "toolu_abc123",
      title: "Read file",
    };
    expect(fields.toolCallId).toBe("toolu_abc123");
    expect(fields.title).toBe("Read file");
    expect(fields.kind).toBeUndefined();
    expect(fields.status).toBeUndefined();
    expect(fields.content).toBeUndefined();
  });

  it("accepts a tool call with all fields", () => {
    const fields: AcpToolCallFields = {
      toolCallId: "toolu_xyz",
      title: "Read src/index.ts",
      kind: "read",
      status: "in_progress",
      content: [{ type: "content", content: { type: "text", text: "file contents" } }],
    };
    expect(fields.kind).toBe("read");
    expect(fields.status).toBe("in_progress");
    expect(fields.content).toHaveLength(1);
  });
});

// ── AcpToolCallUpdateFields ─────────────────────────────────────────────────

describe("AcpToolCallUpdateFields", () => {
  it("accepts a minimal update (only toolCallId required)", () => {
    const fields: AcpToolCallUpdateFields = {
      toolCallId: "tc_1",
    };
    expect(fields.toolCallId).toBe("tc_1");
    expect(fields.title).toBeUndefined();
  });

  it("accepts a completed update with content", () => {
    const fields: AcpToolCallUpdateFields = {
      toolCallId: "tc_1",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "result" } }],
    };
    expect(fields.status).toBe("completed");
    expect(fields.content).toHaveLength(1);
  });
});

// ── AcpSessionUpdate variants ────────────────────────────────────────────────

describe("AcpSessionUpdate", () => {
  it("agent_message_chunk variant", () => {
    const update: AcpSessionUpdate = {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Hello world" },
    };
    expect(update.sessionUpdate).toBe("agent_message_chunk");
  });

  it("tool_call variant (flat structure)", () => {
    const update: AcpSessionUpdate = {
      sessionUpdate: "tool_call",
      toolCallId: "tc_1",
      title: "Read file",
      kind: "other",
      status: "in_progress",
    };
    expect(update.sessionUpdate).toBe("tool_call");
    if (update.sessionUpdate === "tool_call") {
      expect(update.toolCallId).toBe("tc_1");
      expect(update.title).toBe("Read file");
    }
  });

  it("tool_call_update variant with content (flat structure)", () => {
    const update: AcpSessionUpdate = {
      sessionUpdate: "tool_call_update",
      toolCallId: "tc_1",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "result" } }],
    };
    expect(update.sessionUpdate).toBe("tool_call_update");
    if (update.sessionUpdate === "tool_call_update") {
      expect(update.status).toBe("completed");
    }
  });

  it("agent_thought_chunk variant", () => {
    const update: AcpSessionUpdate = {
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "Let me think about this..." },
    };
    expect(update.sessionUpdate).toBe("agent_thought_chunk");
  });

  it("plan variant with entries", () => {
    const update: AcpSessionUpdate = {
      sessionUpdate: "plan",
      entries: [
        { content: "Read config", priority: "high", status: "completed" },
        { content: "Update schema", priority: "high", status: "in_progress" },
        { content: "Add tests", priority: "medium", status: "pending" },
      ],
    };
    expect(update.sessionUpdate).toBe("plan");
    if (update.sessionUpdate === "plan") {
      expect(update.entries).toHaveLength(3);
      expect(update.entries[0].status).toBe("completed");
      expect(update.entries[2].priority).toBe("medium");
    }
  });

  it("current_mode_update variant", () => {
    const update: AcpSessionUpdate = {
      sessionUpdate: "current_mode_update",
      modeId: "planning",
    };
    expect(update.sessionUpdate).toBe("current_mode_update");
    if (update.sessionUpdate === "current_mode_update") {
      expect(update.modeId).toBe("planning");
    }
  });

  it("discriminated union narrows correctly via switch", () => {
    const updates: AcpSessionUpdate[] = [
      { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } },
      { sessionUpdate: "tool_call", toolCallId: "t1", title: "Read", status: "in_progress" },
      { sessionUpdate: "plan", entries: [] },
      { sessionUpdate: "current_mode_update", modeId: "coding" },
    ];

    for (const update of updates) {
      switch (update.sessionUpdate) {
        case "agent_message_chunk":
          expect(update.content.text).toBe("hi");
          break;
        case "tool_call":
          expect(update.toolCallId).toBe("t1");
          break;
        case "plan":
          expect(update.entries).toHaveLength(0);
          break;
        case "current_mode_update":
          expect(update.modeId).toBe("coding");
          break;
      }
    }
  });
});

// ── jsonMode on AgentPackage ─────────────────────────────────────────────────

describe("AgentPackage.jsonMode", () => {
  it("is optional on AgentPackage", () => {
    // An AgentPackage without jsonMode should be valid
    const pkg: Pick<AgentPackage, "name" | "materializer" | "jsonMode"> = {
      name: "test-agent",
      materializer: {} as AgentPackage["materializer"],
    };
    expect(pkg.jsonMode).toBeUndefined();
  });

  it("parseJsonStreamAsACP has the correct signature and returns AcpSessionUpdate", () => {
    const mockParser = (line: string): AcpSessionUpdate | null => {
      const event = JSON.parse(line);
      if (event.type === "text") {
        return {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: event.text },
        };
      }
      return null;
    };

    const pkg: Pick<AgentPackage, "name" | "materializer" | "jsonMode"> = {
      name: "test-agent",
      materializer: {} as AgentPackage["materializer"],
      jsonMode: {
        jsonStreamArgs: ["--json"],
        parseJsonStreamAsACP: mockParser,
      },
    };

    // Should parse a valid line
    const result = pkg.jsonMode!.parseJsonStreamAsACP(
      JSON.stringify({ type: "text", text: "hello" }),
    );
    expect(result).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "hello" },
    });

    // Should return null for unrecognized lines
    const skip = pkg.jsonMode!.parseJsonStreamAsACP(
      JSON.stringify({ type: "unknown" }),
    );
    expect(skip).toBeNull();
  });

  it("parseJsonStreamAsACP receives previousLine parameter", () => {
    const receivedArgs: Array<{ line: string; previousLine?: string }> = [];

    const mockParser = (line: string, previousLine?: string): AcpSessionUpdate | null => {
      receivedArgs.push({ line, previousLine });
      return null;
    };

    const pkg: Pick<AgentPackage, "jsonMode"> = {
      jsonMode: {
        jsonStreamArgs: ["--output-format", "stream-json"],
        parseJsonStreamAsACP: mockParser,
      },
    };

    pkg.jsonMode!.parseJsonStreamAsACP("line2", "line1");
    expect(receivedArgs[0].line).toBe("line2");
    expect(receivedArgs[0].previousLine).toBe("line1");
  });

  it("buildPromptArgs is optional", () => {
    const pkg: Pick<AgentPackage, "jsonMode"> = {
      jsonMode: {
        jsonStreamArgs: ["--json"],
        parseJsonStreamAsACP: () => null,
      },
    };
    expect(pkg.jsonMode!.buildPromptArgs).toBeUndefined();
  });

  it("buildPromptArgs returns string array when defined", () => {
    const pkg: Pick<AgentPackage, "jsonMode"> = {
      jsonMode: {
        jsonStreamArgs: ["--json"],
        buildPromptArgs: (prompt: string) => ["-p", prompt],
        parseJsonStreamAsACP: () => null,
      },
    };
    expect(pkg.jsonMode!.buildPromptArgs!("fix the bug")).toEqual(["-p", "fix the bug"]);
  });

  it("coexists independently with printMode", () => {
    const pkg: Pick<AgentPackage, "name" | "materializer" | "jsonMode" | "printMode"> = {
      name: "dual-mode-agent",
      materializer: {} as AgentPackage["materializer"],
      jsonMode: {
        jsonStreamArgs: ["--output-format", "stream-json"],
        parseJsonStreamAsACP: () => null,
      },
      printMode: {
        jsonStreamArgs: ["--output-format", "stream-json"],
        parseJsonStreamFinalResult: () => null,
      },
    };
    expect(pkg.jsonMode).toBeDefined();
    expect(pkg.printMode).toBeDefined();
  });
});
