/**
 * ACP Protocol Lifecycle Integration Test
 *
 * Exercises the complete ACP protocol lifecycle through in-memory streams:
 * initialize -> session/new -> prompt -> list -> close -> load -> set_config_option -> cancel
 *
 * Uses ClientSideConnection to drive the protocol from the client side against
 * the agent handlers via in-memory TransformStream pairs. Mocks discovery and
 * prompt execution but does NOT mock the agent handler layer itself.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  AgentSideConnection,
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import {
  createMasonAcpAgent,
  clearSessionStates,
  getSessionState,
} from "../../src/acp/acp-agent.js";
import { readSession } from "@clawmasons/shared";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = require("../../package.json") as { version: string };

// ---------------------------------------------------------------------------
// Mock discovery-cache
// ---------------------------------------------------------------------------
const mockDiscoverForCwd = vi.fn();

vi.mock("../../src/acp/discovery-cache.js", () => ({
  discoverForCwd: (...args: unknown[]) => mockDiscoverForCwd(...args),
  invalidateCache: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock prompt-executor
// ---------------------------------------------------------------------------
const mockExecutePromptStreaming = vi.fn();

vi.mock("../../src/acp/prompt-executor.js", () => ({
  executePromptStreaming: (...args: unknown[]) => mockExecutePromptStreaming(...args),
}));

// ---------------------------------------------------------------------------
// Mock resolveRole for setConfigOption role-change scenario
// ---------------------------------------------------------------------------
const mockResolveRole = vi.fn();

vi.mock("@clawmasons/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    resolveRole: (...args: unknown[]) => mockResolveRole(...args),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function defaultDiscovery() {
  return {
    roles: [
      fakeRole("project", "local", [
        { name: "build", ref: "Run the build" },
        { name: "test" },
      ]),
      fakeRole("configure-project", "package"),
    ],
    registry: new Map(),
    agentNames: ["claude-code-agent", "codex"],
    defaultRole: fakeRole("project", "local", [
      { name: "build", ref: "Run the build" },
      { name: "test" },
    ]),
    defaultAgent: "claude-code-agent",
  };
}

function createConnectionPair() {
  const clientToAgent = new TransformStream<Uint8Array>();
  const agentToClient = new TransformStream<Uint8Array>();

  const agentStream = ndJsonStream(agentToClient.writable, clientToAgent.readable);
  const _agentConn = new AgentSideConnection(
    (conn) => createMasonAcpAgent(conn),
    agentStream,
  );

  const clientStream = ndJsonStream(clientToAgent.writable, agentToClient.readable);

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

  return { agentConn: _agentConn, clientConn, sessionUpdates };
}

// ---------------------------------------------------------------------------
// Integration test suite
// ---------------------------------------------------------------------------

describe("ACP protocol lifecycle integration", () => {
  let tempDir: string;
  let clientConn: ClientSideConnection;
  let sessionUpdates: SessionNotification[];
  let sessionId: string;
  let secondSessionId: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mason-acp-integration-"));
    clearSessionStates();

    const pair = createConnectionPair();
    clientConn = pair.clientConn;
    sessionUpdates = pair.sessionUpdates;

    mockDiscoverForCwd.mockResolvedValue(defaultDiscovery());
    mockExecutePromptStreaming.mockImplementation(
      (opts: { onSessionUpdate: (update: Record<string, unknown>) => void }) => {
        opts.onSessionUpdate({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Agent response for integration test." },
        });
        return Promise.resolve({ cancelled: false });
      },
    );
  });

  afterAll(async () => {
    mockDiscoverForCwd.mockReset();
    mockExecutePromptStreaming.mockReset();
    mockResolveRole.mockReset();
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  // -----------------------------------------------------------------------
  // 1. initialize
  // -----------------------------------------------------------------------

  it("1. initialize — returns correct capabilities", async () => {
    const response = await clientConn.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
      clientInfo: {
        name: "integration-test",
        title: "Integration Test Client",
        version: "1.0.0",
      },
    });

    expect(response.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(response.agentCapabilities).toEqual({
      loadSession: true,
      promptCapabilities: {
        image: true,
        audio: false,
        embeddedContext: true,
      },
      mcpCapabilities: {
        http: true,
        sse: false,
      },
      sessionCapabilities: {
        list: {},
        stop: {},
      },
    });
    expect(response.agentInfo).toEqual({
      name: "mason",
      title: "Mason",
      version: CLI_VERSION,
    });
  });

  // -----------------------------------------------------------------------
  // 2. session/new
  // -----------------------------------------------------------------------

  it("2. session/new — returns sessionId + configOptions", async () => {
    const response = await clientConn.newSession({
      cwd: tempDir,
      mcpServers: [],
    });

    sessionId = response.sessionId;

    // Valid UUID v7
    expect(sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    // configOptions present
    expect(response.configOptions).toBeDefined();
    const roleConfig = response.configOptions!.find(
      (opt: Record<string, unknown>) => "id" in opt && opt.id === "role",
    );
    expect(roleConfig).toMatchObject({
      id: "role",
      type: "select",
      category: "role",
      currentValue: "project",
    });

    const agentConfig = response.configOptions!.find(
      (opt: Record<string, unknown>) => "id" in opt && opt.id === "agent",
    );
    expect(agentConfig).toMatchObject({
      id: "agent",
      type: "select",
      category: "model",
      currentValue: "claude-code-agent",
    });

    // Wait for available_commands_update notification
    await new Promise((resolve) => setTimeout(resolve, 200));

    const commandsUpdate = sessionUpdates.find(
      (u) => u.update.sessionUpdate === "available_commands_update",
    );
    expect(commandsUpdate).toBeDefined();
    expect(commandsUpdate!.sessionId).toBe(sessionId);

    const update = commandsUpdate!.update as {
      sessionUpdate: string;
      availableCommands: { name: string; description: string }[];
    };
    expect(update.availableCommands).toHaveLength(2);
    expect(update.availableCommands[0]).toMatchObject({ name: "build" });
    expect(update.availableCommands[1]).toMatchObject({ name: "test" });
  });

  // -----------------------------------------------------------------------
  // 3. session/prompt
  // -----------------------------------------------------------------------

  it("3. session/prompt — returns end_turn + agent_message_chunk", async () => {
    // Clear previous updates
    sessionUpdates.length = 0;

    const response = await clientConn.prompt({
      sessionId,
      prompt: [{ type: "text", text: "hello from integration test" }],
    });

    expect(response.stopReason).toBe("end_turn");

    // Verify executePromptStreaming was called with correct args
    expect(mockExecutePromptStreaming).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "claude-code-agent",
        role: "project",
        text: "hello from integration test",
        cwd: tempDir,
        onSessionUpdate: expect.any(Function),
      }),
    );

    // Wait for notifications
    await new Promise((resolve) => setTimeout(resolve, 200));

    // agent_message_chunk
    const messageChunk = sessionUpdates.find(
      (u) => u.update.sessionUpdate === "agent_message_chunk",
    );
    expect(messageChunk).toBeDefined();
    const chunkUpdate = messageChunk!.update as {
      sessionUpdate: string;
      content: { type: string; text: string };
    };
    expect(chunkUpdate.content).toEqual({
      type: "text",
      text: "Agent response for integration test.",
    });

    // session_info_update
    const infoUpdate = sessionUpdates.find(
      (u) => u.update.sessionUpdate === "session_info_update",
    );
    expect(infoUpdate).toBeDefined();
    const info = infoUpdate!.update as {
      sessionUpdate: string;
      title: string;
      updatedAt: string;
    };
    expect(info.title).toBe("hello from integration test");
    expect(info.updatedAt).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 4. session/list
  // -----------------------------------------------------------------------

  it("4. session/list — returns created sessions", async () => {
    const result = await clientConn.listSessions({ cwd: tempDir });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].sessionId).toBe(sessionId);
    expect(result.sessions[0].cwd).toBe(tempDir);
    expect(result.sessions[0].title).toBe("hello from integration test");
    expect(result.sessions[0].updatedAt).toBeDefined();
    expect(result.nextCursor).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 5. session/close
  // -----------------------------------------------------------------------

  it("5. session/close — marks session closed, excluded from list", async () => {
    // Create a second session before closing the first
    const s2 = await clientConn.newSession({ cwd: tempDir, mcpServers: [] });
    secondSessionId = s2.sessionId;

    // Close the first session
    await clientConn.unstable_closeSession({ sessionId });

    // Verify meta.json has closed: true
    const meta = await readSession(tempDir, sessionId);
    expect(meta).toBeDefined();
    expect(meta!.closed).toBe(true);
    expect(meta!.closedAt).toBeDefined();

    // Verify list excludes the closed session
    const result = await clientConn.listSessions({ cwd: tempDir });
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].sessionId).toBe(secondSessionId);
  });

  // -----------------------------------------------------------------------
  // 6. session/load
  // -----------------------------------------------------------------------

  it("6. session/load — restores session state", async () => {
    // Clear in-memory state to simulate a fresh process
    clearSessionStates();
    expect(getSessionState(secondSessionId)).toBeUndefined();

    const result = await clientConn.loadSession({
      sessionId: secondSessionId,
      cwd: tempDir,
      mcpServers: [],
    });

    // Verify in-memory state is restored
    const state = getSessionState(secondSessionId);
    expect(state).toBeDefined();
    expect(state!.sessionId).toBe(secondSessionId);
    expect(state!.cwd).toBe(tempDir);
    expect(state!.role).toBe("project");
    expect(state!.agent).toBe("claude-code-agent");

    // Verify configOptions returned
    expect(result.configOptions).toBeDefined();
    expect(Array.isArray(result.configOptions)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 7. session/set_config_option — role change
  // -----------------------------------------------------------------------

  it("7. session/set_config_option — role change triggers available_commands_update", async () => {
    const opsRole = fakeRole("ops", "local", [
      { name: "deploy", ref: "Deploy to production" },
    ]);
    mockResolveRole.mockResolvedValue(opsRole);

    // Clear previous updates
    sessionUpdates.length = 0;

    const result = await clientConn.setSessionConfigOption({
      sessionId: secondSessionId,
      configId: "role",
      value: "ops",
    });

    // Verify response has configOptions with updated role
    expect(result.configOptions).toBeDefined();
    const roleConfig = result.configOptions.find(
      (opt: Record<string, unknown>) => "id" in opt && opt.id === "role",
    );
    expect(roleConfig).toMatchObject({
      id: "role",
      currentValue: "ops",
    });

    // Verify in-memory state updated
    const state = getSessionState(secondSessionId);
    expect(state!.role).toBe("ops");

    // Wait for fire-and-forget notifications
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify available_commands_update was sent
    const commandsUpdate = sessionUpdates.find(
      (u) => u.update.sessionUpdate === "available_commands_update",
    );
    expect(commandsUpdate).toBeDefined();
    const update = commandsUpdate!.update as {
      sessionUpdate: string;
      availableCommands: { name: string; description: string }[];
    };
    expect(update.availableCommands).toHaveLength(1);
    expect(update.availableCommands[0]).toMatchObject({
      name: "deploy",
      description: "Deploy to production",
    });
  });

  // -----------------------------------------------------------------------
  // 8. session/cancel during prompt
  // -----------------------------------------------------------------------

  it("8. session/cancel during prompt — returns stopReason cancelled", async () => {
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
      sessionId: secondSessionId,
      prompt: [{ type: "text", text: "long running task" }],
    });

    // Wait a tick for prompt to start, then cancel
    await new Promise((resolve) => setTimeout(resolve, 50));
    await clientConn.cancel({ sessionId: secondSessionId });

    const response = await promptPromise;
    expect(response.stopReason).toBe("cancelled");
  });
});
