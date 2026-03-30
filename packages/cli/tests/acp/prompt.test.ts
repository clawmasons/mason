import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AgentSideConnection,
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import {
  createMasonAcpAgent,
  getSessionState,
  extractTextFromPrompt,
} from "../../src/acp/acp-agent.js";
import { readSession, updateSession } from "@clawmasons/shared";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Mock discovery-cache to avoid real filesystem scans and agent imports
// ---------------------------------------------------------------------------
const mockDiscoverForCwd = vi.fn();

vi.mock("../../src/acp/discovery-cache.js", () => ({
  discoverForCwd: (...args: unknown[]) => mockDiscoverForCwd(...args),
  invalidateCache: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock prompt-executor to avoid spawning real subprocesses
// ---------------------------------------------------------------------------
const mockExecutePromptStreaming = vi.fn();

vi.mock("../../src/acp/prompt-executor.js", () => ({
  executePromptStreaming: (...args: unknown[]) => mockExecutePromptStreaming(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create in-memory connected client + agent pair using TransformStreams. */
function createConnectionPair() {
  const clientToAgent = new TransformStream<Uint8Array>();
  const agentToClient = new TransformStream<Uint8Array>();

  const agentStream = ndJsonStream(agentToClient.writable, clientToAgent.readable);
  const agentConn = new AgentSideConnection(
    (conn) => createMasonAcpAgent(conn),
    agentStream,
  );

  const clientStream = ndJsonStream(clientToAgent.writable, agentToClient.readable);

  // Collect sessionUpdate notifications
  const sessionUpdates: SessionNotification[] = [];

  const clientConn = new ClientSideConnection(
    () => ({
      async requestPermission() {
        return { outcome: { outcome: "cancelled" as const } };
      },
      async sessionUpdate(params: SessionNotification) {
        sessionUpdates.push(params);
      },
    }),
    clientStream,
  );

  return { agentConn, clientConn, sessionUpdates };
}

/** Build a fake Role object for testing. */
function fakeRole(name: string, type: "local" | "package" = "local", tasks: { name: string; ref?: string }[] = []) {
  return {
    metadata: { name },
    instructions: "Test instructions",
    type: "project" as const,
    tasks,
    mcp: [],
    skills: [],
    sources: [],
    container: {},
    governance: {},
    resources: [],
    source: {
      type,
      agentDialect: undefined,
      path: type === "local" ? `/tmp/test/.mason/roles/${name}` : undefined,
      packageName: type === "package" ? `@clawmasons/role-${name}` : undefined,
    },
  };
}

/** Initialize a connection and create a session, returning the sessionId. */
async function initAndCreateSession(
  clientConn: ClientSideConnection,
  tempDir: string,
): Promise<string> {
  await clientConn.initialize({ protocolVersion: PROTOCOL_VERSION });
  const response = await clientConn.newSession({ cwd: tempDir, mcpServers: [] });
  return response.sessionId;
}

// ---------------------------------------------------------------------------
// Tests: extractTextFromPrompt
// ---------------------------------------------------------------------------

describe("extractTextFromPrompt", () => {
  it("extracts text from a single text block", () => {
    const result = extractTextFromPrompt([
      { type: "text", text: "hello world" },
    ]);
    expect(result).toBe("hello world");
  });

  it("concatenates multiple text blocks with newlines", () => {
    const result = extractTextFromPrompt([
      { type: "text", text: "first" },
      { type: "text", text: "second" },
    ]);
    expect(result).toBe("first\nsecond");
  });

  it("skips non-text blocks", () => {
    const result = extractTextFromPrompt([
      { type: "text", text: "hello" },
      { type: "image", data: "base64data", mimeType: "image/png" } as never,
      { type: "text", text: "world" },
    ]);
    expect(result).toBe("hello\nworld");
  });

  it("returns empty string for empty prompt", () => {
    const result = extractTextFromPrompt([]);
    expect(result).toBe("");
  });

  it("returns empty string when no text blocks present", () => {
    const result = extractTextFromPrompt([
      { type: "image", data: "base64data", mimeType: "image/png" } as never,
    ]);
    expect(result).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Tests: prompt handler
// ---------------------------------------------------------------------------

describe("session/prompt handler", () => {
  let tempDir: string;
  let clientConn: ClientSideConnection;
  let sessionUpdates: SessionNotification[];

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mason-acp-prompt-test-"));

    const pair = createConnectionPair();
    clientConn = pair.clientConn;
    sessionUpdates = pair.sessionUpdates;

    // Default mock: return discovery result
    mockDiscoverForCwd.mockResolvedValue({
      roles: [fakeRole("project", "local")],
      registry: new Map(),
      agentNames: ["claude-code-agent"],
      defaultRole: fakeRole("project", "local"),
      defaultAgent: "claude-code-agent",
    });

    // Default mock: executePromptStreaming calls onSessionUpdate and returns
    mockExecutePromptStreaming.mockImplementation(
      (opts: { onSessionUpdate: (update: Record<string, unknown>) => void }) => {
        opts.onSessionUpdate({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello! I can help with that." },
        });
        return Promise.resolve({ cancelled: false });
      },
    );
  });

  afterEach(async () => {
    mockDiscoverForCwd.mockReset();
    mockExecutePromptStreaming.mockReset();
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("calls executePromptStreaming with correct arguments", async () => {
    const sessionId = await initAndCreateSession(clientConn, tempDir);

    await clientConn.prompt({
      sessionId,
      prompt: [{ type: "text", text: "help me refactor" }],
    });

    expect(mockExecutePromptStreaming).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "claude-code-agent",
        role: "project",
        text: "help me refactor",
        cwd: tempDir,
        sessionId,
        onSessionUpdate: expect.any(Function),
      }),
    );
    // Verify signal is an AbortSignal
    const callArgs = mockExecutePromptStreaming.mock.calls[0][0];
    expect(callArgs.signal).toBeInstanceOf(AbortSignal);
  });

  it("passes sessionId to executePromptStreaming for session unification", async () => {
    const sessionId = await initAndCreateSession(clientConn, tempDir);

    await clientConn.prompt({
      sessionId,
      prompt: [{ type: "text", text: "hello" }],
    });

    const callArgs = mockExecutePromptStreaming.mock.calls[0][0];
    expect(callArgs.sessionId).toBe(sessionId);
  });

  it("returns stopReason end_turn on success", async () => {
    const sessionId = await initAndCreateSession(clientConn, tempDir);

    const response = await clientConn.prompt({
      sessionId,
      prompt: [{ type: "text", text: "hello" }],
    });

    expect(response.stopReason).toBe("end_turn");
  });

  it("sends agent_message_chunk with output", async () => {
    const sessionId = await initAndCreateSession(clientConn, tempDir);

    await clientConn.prompt({
      sessionId,
      prompt: [{ type: "text", text: "hello" }],
    });

    // Wait for notifications to arrive
    await new Promise((resolve) => setTimeout(resolve, 200));

    const messageChunk = sessionUpdates.find(
      (u) => u.update.sessionUpdate === "agent_message_chunk",
    );
    expect(messageChunk).toBeDefined();
    expect(messageChunk!.sessionId).toBe(sessionId);

    const update = messageChunk!.update as {
      sessionUpdate: string;
      content: { type: string; text: string };
    };
    expect(update.content).toEqual({
      type: "text",
      text: "Hello! I can help with that.",
    });
  });

  it("sends session_info_update after prompt", async () => {
    const sessionId = await initAndCreateSession(clientConn, tempDir);

    await clientConn.prompt({
      sessionId,
      prompt: [{ type: "text", text: "help me refactor this function" }],
    });

    // Wait for notifications to arrive
    await new Promise((resolve) => setTimeout(resolve, 200));

    const infoUpdate = sessionUpdates.find(
      (u) => u.update.sessionUpdate === "session_info_update",
    );
    expect(infoUpdate).toBeDefined();
    expect(infoUpdate!.sessionId).toBe(sessionId);

    const update = infoUpdate!.update as {
      sessionUpdate: string;
      title: string;
      updatedAt: string;
    };
    expect(update.title).toBe("help me refactor this function");
    expect(update.updatedAt).toBeDefined();
  });

  it("updates meta.json with firstPrompt and lastUpdated", async () => {
    const sessionId = await initAndCreateSession(clientConn, tempDir);

    await clientConn.prompt({
      sessionId,
      prompt: [{ type: "text", text: "initial prompt" }],
    });

    const meta = await readSession(tempDir, sessionId);
    expect(meta).toBeDefined();
    expect(meta!.firstPrompt).toBe("initial prompt");
    expect(meta!.lastUpdated).toBeDefined();
  });

  it("does not overwrite firstPrompt on subsequent prompts", async () => {
    const sessionId = await initAndCreateSession(clientConn, tempDir);

    // First prompt
    await clientConn.prompt({
      sessionId,
      prompt: [{ type: "text", text: "first prompt" }],
    });

    // Second prompt
    await clientConn.prompt({
      sessionId,
      prompt: [{ type: "text", text: "second prompt" }],
    });

    const meta = await readSession(tempDir, sessionId);
    expect(meta!.firstPrompt).toBe("first prompt");
  });

  it("cleans up abortController after prompt completes", async () => {
    const sessionId = await initAndCreateSession(clientConn, tempDir);

    await clientConn.prompt({
      sessionId,
      prompt: [{ type: "text", text: "hello" }],
    });

    const state = getSessionState(sessionId);
    expect(state).toBeDefined();
    expect(state!.abortController).toBeUndefined();
  });

  it("handles multiple text blocks in prompt", async () => {
    const sessionId = await initAndCreateSession(clientConn, tempDir);

    await clientConn.prompt({
      sessionId,
      prompt: [
        { type: "text", text: "first part" },
        { type: "text", text: "second part" },
      ],
    });

    expect(mockExecutePromptStreaming).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "first part\nsecond part",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: cancel handler
// ---------------------------------------------------------------------------

describe("session/cancel handler", () => {
  let tempDir: string;
  let clientConn: ClientSideConnection;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mason-acp-cancel-test-"));

    const pair = createConnectionPair();
    clientConn = pair.clientConn;

    mockDiscoverForCwd.mockResolvedValue({
      roles: [fakeRole("project", "local")],
      registry: new Map(),
      agentNames: ["claude-code-agent"],
      defaultRole: fakeRole("project", "local"),
      defaultAgent: "claude-code-agent",
    });
  });

  afterEach(async () => {
    mockDiscoverForCwd.mockReset();
    mockExecutePromptStreaming.mockReset();
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("returns stopReason cancelled when cancel is called during prompt", async () => {
    const sessionId = await initAndCreateSession(clientConn, tempDir);

    // Mock executePromptStreaming to be slow and check signal
    mockExecutePromptStreaming.mockImplementation(
      (opts: { signal?: AbortSignal }) =>
        new Promise<{ cancelled: boolean }>((resolve) => {
          const checkSignal = () => {
            if (opts.signal?.aborted) {
              resolve({ cancelled: true });
              return;
            }
            setTimeout(checkSignal, 10);
          };
          checkSignal();
        }),
    );

    // Start prompt (don't await yet)
    const promptPromise = clientConn.prompt({
      sessionId,
      prompt: [{ type: "text", text: "do something long" }],
    });

    // Wait a tick for prompt to start, then cancel
    await new Promise((resolve) => setTimeout(resolve, 50));
    await clientConn.cancel({ sessionId });

    const response = await promptPromise;
    expect(response.stopReason).toBe("cancelled");
  });

  it("cancel is no-op when no active prompt", async () => {
    const sessionId = await initAndCreateSession(clientConn, tempDir);

    // Cancel when nothing is running -- should not throw
    await clientConn.cancel({ sessionId });
    // If we get here without throwing, the test passes
  });
});

// ---------------------------------------------------------------------------
// Tests: ACP automatic resume
// ---------------------------------------------------------------------------

describe("ACP automatic resume", () => {
  let tempDir: string;
  let clientConn: ClientSideConnection;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mason-acp-resume-test-"));

    const pair = createConnectionPair();
    clientConn = pair.clientConn;

    mockDiscoverForCwd.mockResolvedValue({
      roles: [fakeRole("project", "local")],
      registry: new Map(),
      agentNames: ["claude-code-agent"],
      defaultRole: fakeRole("project", "local"),
      defaultAgent: "claude-code-agent",
    });

    // Default mock: executePromptStreaming resolves successfully
    mockExecutePromptStreaming.mockImplementation(
      (opts: { onSessionUpdate: (update: Record<string, unknown>) => void }) => {
        opts.onSessionUpdate({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Done." },
        });
        return Promise.resolve({ cancelled: false });
      },
    );
  });

  afterEach(async () => {
    mockDiscoverForCwd.mockReset();
    mockExecutePromptStreaming.mockReset();
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("first prompt does not pass masonSessionId (no resume)", async () => {
    const sessionId = await initAndCreateSession(clientConn, tempDir);

    await clientConn.prompt({
      sessionId,
      prompt: [{ type: "text", text: "scaffold API" }],
    });

    expect(mockExecutePromptStreaming).toHaveBeenCalledTimes(1);
    const callArgs = mockExecutePromptStreaming.mock.calls[0][0];
    expect(callArgs.masonSessionId).toBeUndefined();
  });

  it("second prompt passes masonSessionId when agentSessionId is captured", async () => {
    const sessionId = await initAndCreateSession(clientConn, tempDir);

    // First prompt — simulate agent hook writing agentSessionId during execution
    mockExecutePromptStreaming.mockImplementationOnce(
      async (opts: { onSessionUpdate: (update: Record<string, unknown>) => void }) => {
        // Simulate the agent's SessionStart hook writing agentSessionId to meta.json
        await updateSession(tempDir, sessionId, { agentSessionId: "claude-session-abc123" });
        opts.onSessionUpdate({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Done." },
        });
        return { cancelled: false };
      },
    );

    await clientConn.prompt({
      sessionId,
      prompt: [{ type: "text", text: "scaffold API" }],
    });

    // Second prompt — should detect agentSessionId and use resume
    await clientConn.prompt({
      sessionId,
      prompt: [{ type: "text", text: "add auth" }],
    });

    expect(mockExecutePromptStreaming).toHaveBeenCalledTimes(2);

    // First call: no masonSessionId
    const firstCallArgs = mockExecutePromptStreaming.mock.calls[0][0];
    expect(firstCallArgs.masonSessionId).toBeUndefined();

    // Second call: masonSessionId should be the session ID
    const secondCallArgs = mockExecutePromptStreaming.mock.calls[1][0];
    expect(secondCallArgs.masonSessionId).toBe(sessionId);
  });

  it("second prompt does not pass masonSessionId when agentSessionId is still null", async () => {
    const sessionId = await initAndCreateSession(clientConn, tempDir);

    // First prompt — no agent hook writes agentSessionId
    await clientConn.prompt({
      sessionId,
      prompt: [{ type: "text", text: "scaffold API" }],
    });

    // Second prompt — agentSessionId still null, should not resume
    await clientConn.prompt({
      sessionId,
      prompt: [{ type: "text", text: "add auth" }],
    });

    expect(mockExecutePromptStreaming).toHaveBeenCalledTimes(2);

    // Both calls: no masonSessionId
    const firstCallArgs = mockExecutePromptStreaming.mock.calls[0][0];
    expect(firstCallArgs.masonSessionId).toBeUndefined();

    const secondCallArgs = mockExecutePromptStreaming.mock.calls[1][0];
    expect(secondCallArgs.masonSessionId).toBeUndefined();
  });
});
