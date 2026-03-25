import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AgentSideConnection,
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import { createMasonAcpAgent, getSessionState } from "../../src/acp/acp-agent.js";
import { readSession } from "@clawmasons/shared";
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
    apps: [],
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("session/new handler", () => {
  let tempDir: string;
  let clientConn: ClientSideConnection;
  let sessionUpdates: SessionNotification[];

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mason-acp-test-"));

    const pair = createConnectionPair();
    clientConn = pair.clientConn;
    sessionUpdates = pair.sessionUpdates;

    // Default mock: return discovery result with one local role and one agent
    mockDiscoverForCwd.mockResolvedValue({
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
    });

    // Initialize the connection first
    await clientConn.initialize({
      protocolVersion: PROTOCOL_VERSION,
    });
  });

  afterEach(async () => {
    mockDiscoverForCwd.mockReset();
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("creates a session with a valid UUID", async () => {
    const response = await clientConn.newSession({
      cwd: tempDir,
      mcpServers: [],
    });

    expect(response.sessionId).toBeDefined();
    expect(typeof response.sessionId).toBe("string");
    // UUID v7 format: 8-4-4-4-12 hex chars
    expect(response.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("calls discovery with the correct cwd", async () => {
    await clientConn.newSession({
      cwd: tempDir,
      mcpServers: [],
    });

    expect(mockDiscoverForCwd).toHaveBeenCalledWith(tempDir);
  });

  it("returns configOptions with role select", async () => {
    const response = await clientConn.newSession({
      cwd: tempDir,
      mcpServers: [],
    });

    const configOptions = response.configOptions;
    expect(configOptions).toBeDefined();
    expect(Array.isArray(configOptions)).toBe(true);

    const roleConfig = configOptions!.find(
      (opt) => "id" in opt && opt.id === "role",
    );
    expect(roleConfig).toBeDefined();
    expect(roleConfig).toMatchObject({
      id: "role",
      name: "Role",
      type: "select",
      category: "role",
      currentValue: "project",
    });

    // Verify options array
    const options = (roleConfig as { options: { value: string; name: string }[] }).options;
    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({ value: "project", name: "project" });
    expect(options[1]).toMatchObject({ value: "configure-project", name: "configure-project" });
  });

  it("returns configOptions with agent select", async () => {
    const response = await clientConn.newSession({
      cwd: tempDir,
      mcpServers: [],
    });

    const configOptions = response.configOptions;
    const agentConfig = configOptions!.find(
      (opt) => "id" in opt && opt.id === "agent",
    );
    expect(agentConfig).toBeDefined();
    expect(agentConfig).toMatchObject({
      id: "agent",
      name: "Agent",
      type: "select",
      category: "model",
      currentValue: "claude-code-agent",
    });

    const options = (agentConfig as { options: { value: string; name: string }[] }).options;
    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({ value: "claude-code-agent", name: "claude-code-agent" });
    expect(options[1]).toMatchObject({ value: "codex", name: "codex" });
  });

  it("sends available_commands_update with role tasks", async () => {
    const response = await clientConn.newSession({
      cwd: tempDir,
      mcpServers: [],
    });

    // Wait a tick for the fire-and-forget notification to arrive
    await new Promise((resolve) => setTimeout(resolve, 200));

    const commandsUpdate = sessionUpdates.find(
      (u) => u.update.sessionUpdate === "available_commands_update",
    );
    expect(commandsUpdate).toBeDefined();
    expect(commandsUpdate!.sessionId).toBe(response.sessionId);

    const update = commandsUpdate!.update as {
      sessionUpdate: string;
      availableCommands: { name: string; description: string }[];
    };
    expect(update.availableCommands).toHaveLength(2);
    expect(update.availableCommands[0]).toMatchObject({
      name: "build",
      description: "Run the build",
    });
    expect(update.availableCommands[1]).toMatchObject({
      name: "test",
      description: "test",
    });
  });

  it("persists session to meta.json", async () => {
    const response = await clientConn.newSession({
      cwd: tempDir,
      mcpServers: [],
    });

    const session = await readSession(tempDir, response.sessionId);
    expect(session).toBeDefined();
    expect(session!.sessionId).toBe(response.sessionId);
    expect(session!.cwd).toBe(tempDir);
    expect(session!.agent).toBe("claude-code-agent");
    expect(session!.role).toBe("project");
    expect(session!.closed).toBe(false);
  });

  it("stores session state in memory", async () => {
    const response = await clientConn.newSession({
      cwd: tempDir,
      mcpServers: [],
    });

    const state = getSessionState(response.sessionId);
    expect(state).toBeDefined();
    expect(state!.sessionId).toBe(response.sessionId);
    expect(state!.cwd).toBe(tempDir);
    expect(state!.role).toBe("project");
    expect(state!.agent).toBe("claude-code-agent");
  });

  it("sends empty available_commands when role has no tasks", async () => {
    mockDiscoverForCwd.mockResolvedValue({
      roles: [fakeRole("project", "local", [])],
      registry: new Map(),
      agentNames: ["claude-code-agent"],
      defaultRole: fakeRole("project", "local", []),
      defaultAgent: "claude-code-agent",
    });

    await clientConn.newSession({
      cwd: tempDir,
      mcpServers: [],
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const commandsUpdate = sessionUpdates.find(
      (u) => u.update.sessionUpdate === "available_commands_update",
    );
    expect(commandsUpdate).toBeDefined();
    const update = commandsUpdate!.update as {
      sessionUpdate: string;
      availableCommands: unknown[];
    };
    expect(update.availableCommands).toHaveLength(0);
  });
});
