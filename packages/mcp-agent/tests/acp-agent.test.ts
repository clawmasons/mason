import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AcpAgent,
  createAcpAgentFactory,
  type AcpAgentConfig,
} from "../src/acp-agent.js";
import type { AgentSideConnection } from "@agentclientprotocol/sdk";
import { PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type { ToolCaller, ToolDefinition } from "../src/tool-caller.js";

// ── Helpers ───────────────────────────────────────────────────────────

function createMockCaller(tools: ToolDefinition[] = []): ToolCaller {
  return {
    listTools: vi.fn().mockResolvedValue(tools),
    callTool: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "mock result" }],
    }),
  };
}

function createMockConnection(): AgentSideConnection {
  return {
    sessionUpdate: vi.fn().mockResolvedValue(undefined),
    requestPermission: vi.fn(),
    readTextFile: vi.fn(),
    writeTextFile: vi.fn(),
    createTerminal: vi.fn(),
    extMethod: vi.fn(),
    extNotification: vi.fn(),
    signal: new AbortController().signal,
    closed: new Promise(() => {}),
  } as unknown as AgentSideConnection;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("AcpAgent", () => {
  let mockConn: AgentSideConnection;
  let mockCaller: ToolCaller;
  let agent: AcpAgent;

  beforeEach(() => {
    mockConn = createMockConnection();
    mockCaller = createMockCaller([
      { name: "tool_a", description: "Tool A" },
      { name: "tool_b", description: "Tool B" },
    ]);
    agent = new AcpAgent(mockConn, { caller: mockCaller });
  });

  describe("initialize", () => {
    it("returns protocol version and agent info", async () => {
      const result = await agent.initialize({
        protocolVersion: PROTOCOL_VERSION,
      });

      expect(result.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(result.agentInfo).toEqual({
        name: "mcp-agent",
        version: "0.1.0",
      });
      expect(result.agentCapabilities).toEqual({
        loadSession: false,
      });
    });
  });

  describe("newSession", () => {
    it("returns a session ID", async () => {
      const result = await agent.newSession({
        cwd: "/workspace",
        mcpServers: [],
      });

      expect(result.sessionId).toBeDefined();
      expect(typeof result.sessionId).toBe("string");
      expect(result.sessionId.length).toBe(32); // 16 bytes as hex
    });

    it("calls onSessionSetup when provided", async () => {
      const onSessionSetup = vi.fn().mockResolvedValue(undefined);
      const agentWithSetup = new AcpAgent(mockConn, {
        caller: mockCaller,
        onSessionSetup,
      });

      await agentWithSetup.newSession({
        cwd: "/workspace",
        mcpServers: [],
      });

      expect(onSessionSetup).toHaveBeenCalledOnce();
    });

    it("generates unique session IDs", async () => {
      const agent1 = new AcpAgent(mockConn, { caller: mockCaller });
      const agent2 = new AcpAgent(mockConn, { caller: mockCaller });

      const result1 = await agent1.newSession({ cwd: "/workspace", mcpServers: [] });
      const result2 = await agent2.newSession({ cwd: "/workspace", mcpServers: [] });

      expect(result1.sessionId).not.toBe(result2.sessionId);
    });
  });

  describe("prompt", () => {
    it("returns tool list as end_turn response", async () => {
      const sessionResult = await agent.newSession({ cwd: "/workspace", mcpServers: [] });
      const sessionId = sessionResult.sessionId;

      const result = await agent.prompt({
        sessionId,
        prompt: [{ type: "text", text: "list" }],
      });

      expect(result.stopReason).toBe("end_turn");
      expect(mockCaller.listTools).toHaveBeenCalled();
    });

    it("sends session update with tool information", async () => {
      const sessionResult = await agent.newSession({ cwd: "/workspace", mcpServers: [] });
      const sessionId = sessionResult.sessionId;

      await agent.prompt({
        sessionId,
        prompt: [{ type: "text", text: "list" }],
      });

      const sessionUpdate = mockConn.sessionUpdate as ReturnType<typeof vi.fn>;
      expect(sessionUpdate).toHaveBeenCalledOnce();

      const updateArgs = sessionUpdate.mock.calls[0][0];
      expect(updateArgs.sessionId).toBe(sessionId);
      expect(updateArgs.update.sessionUpdate).toBe("agent_message_chunk");
      expect(updateArgs.update.content.text).toContain("tool_a");
      expect(updateArgs.update.content.text).toContain("tool_b");
      expect(updateArgs.update.content.text).toContain("Tool A");
    });

    it("handles empty tool list", async () => {
      const emptyCaller = createMockCaller([]);
      const emptyAgent = new AcpAgent(mockConn, { caller: emptyCaller });
      const sessionResult = await emptyAgent.newSession({ cwd: "/workspace", mcpServers: [] });

      const result = await emptyAgent.prompt({
        sessionId: sessionResult.sessionId,
        prompt: [{ type: "text", text: "list" }],
      });

      expect(result.stopReason).toBe("end_turn");

      const sessionUpdate = mockConn.sessionUpdate as ReturnType<typeof vi.fn>;
      const updateArgs = sessionUpdate.mock.calls[0][0];
      expect(updateArgs.update.content.text).toContain("No tools available");
    });
  });

  describe("cancel", () => {
    it("does not throw", async () => {
      const sessionResult = await agent.newSession({ cwd: "/workspace", mcpServers: [] });
      await expect(
        agent.cancel({ sessionId: sessionResult.sessionId }),
      ).resolves.toBeUndefined();
    });
  });

  describe("authenticate", () => {
    it("returns empty object", async () => {
      const result = await agent.authenticate();
      expect(result).toEqual({});
    });
  });
});

describe("createAcpAgentFactory", () => {
  it("returns a function that creates an AcpAgent", () => {
    const caller = createMockCaller();
    const factory = createAcpAgentFactory({ caller });
    const conn = createMockConnection();

    const agent = factory(conn);

    expect(agent).toBeDefined();
    expect(typeof agent.initialize).toBe("function");
    expect(typeof agent.newSession).toBe("function");
    expect(typeof agent.prompt).toBe("function");
    expect(typeof agent.cancel).toBe("function");
  });
});
