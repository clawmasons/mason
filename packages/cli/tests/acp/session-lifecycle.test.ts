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
  clearSessionStates,
} from "../../src/acp/acp-agent.js";
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

// Mock resolveRole for setConfigOption tests
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

/** Create in-memory connected client + agent pair using TransformStreams. */
function createConnectionPair() {
  const clientToAgent = new TransformStream<Uint8Array>();
  const agentToClient = new TransformStream<Uint8Array>();

  const agentStream = ndJsonStream(agentToClient.writable, clientToAgent.readable);
  const _agentConn = new AgentSideConnection(
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

  return { agentConn: _agentConn, clientConn, sessionUpdates };
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("session lifecycle handlers", () => {
  let tempDir: string;
  let clientConn: ClientSideConnection;
  let sessionUpdates: SessionNotification[];

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mason-acp-lifecycle-"));
    clearSessionStates();

    const pair = createConnectionPair();
    clientConn = pair.clientConn;
    sessionUpdates = pair.sessionUpdates;

    mockDiscoverForCwd.mockResolvedValue(defaultDiscovery());

    // Initialize the connection first
    await clientConn.initialize({
      protocolVersion: PROTOCOL_VERSION,
    });
  });

  afterEach(async () => {
    mockDiscoverForCwd.mockReset();
    mockResolveRole.mockReset();
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  // -----------------------------------------------------------------------
  // listSessions
  // -----------------------------------------------------------------------

  describe("session/list", () => {
    it("returns sessions created via newSession", async () => {
      const s1 = await clientConn.newSession({ cwd: tempDir, mcpServers: [] });
      const s2 = await clientConn.newSession({ cwd: tempDir, mcpServers: [] });

      const result = await clientConn.listSessions({ cwd: tempDir });

      expect(result.sessions).toHaveLength(2);
      const ids = result.sessions.map((s: { sessionId: string }) => s.sessionId);
      expect(ids).toContain(s1.sessionId);
      expect(ids).toContain(s2.sessionId);
    });

    it("returns correct SessionInfo fields", async () => {
      const s1 = await clientConn.newSession({ cwd: tempDir, mcpServers: [] });
      const result = await clientConn.listSessions({ cwd: tempDir });

      expect(result.sessions).toHaveLength(1);
      const info = result.sessions[0];
      expect(info.sessionId).toBe(s1.sessionId);
      expect(info.cwd).toBe(tempDir);
      // firstPrompt is null initially, so title should be null
      expect(info.title).toBeNull();
      expect(info.updatedAt).toBeDefined();
    });

    it("returns empty array when no sessions exist", async () => {
      const result = await clientConn.listSessions({ cwd: tempDir });
      expect(result.sessions).toHaveLength(0);
    });

    it("returns empty array when no cwd provided", async () => {
      await clientConn.newSession({ cwd: tempDir, mcpServers: [] });
      const result = await clientConn.listSessions({});
      expect(result.sessions).toHaveLength(0);
    });

    it("returns nextCursor as null", async () => {
      const result = await clientConn.listSessions({ cwd: tempDir });
      expect(result.nextCursor).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // loadSession
  // -----------------------------------------------------------------------

  describe("session/load", () => {
    it("restores in-memory session state from meta.json", async () => {
      const s1 = await clientConn.newSession({ cwd: tempDir, mcpServers: [] });

      // Clear in-memory state to simulate a fresh process
      clearSessionStates();
      expect(getSessionState(s1.sessionId)).toBeUndefined();

      await clientConn.loadSession({
        sessionId: s1.sessionId,
        cwd: tempDir,
        mcpServers: [],
      });

      const state = getSessionState(s1.sessionId);
      expect(state).toBeDefined();
      expect(state!.sessionId).toBe(s1.sessionId);
      expect(state!.cwd).toBe(tempDir);
      expect(state!.role).toBe("project");
      expect(state!.agent).toBe("claude-code-agent");
    });

    it("returns configOptions", async () => {
      const s1 = await clientConn.newSession({ cwd: tempDir, mcpServers: [] });
      clearSessionStates();

      const result = await clientConn.loadSession({
        sessionId: s1.sessionId,
        cwd: tempDir,
        mcpServers: [],
      });

      expect(result.configOptions).toBeDefined();
      expect(Array.isArray(result.configOptions)).toBe(true);

      const roleConfig = result.configOptions!.find(
        (opt: Record<string, unknown>) => "id" in opt && opt.id === "role",
      );
      expect(roleConfig).toBeDefined();
      expect(roleConfig).toMatchObject({
        id: "role",
        currentValue: "project",
      });

      const agentConfig = result.configOptions!.find(
        (opt: Record<string, unknown>) => "id" in opt && opt.id === "agent",
      );
      expect(agentConfig).toBeDefined();
      expect(agentConfig).toMatchObject({
        id: "agent",
        currentValue: "claude-code-agent",
      });
    });

    it("throws for non-existent sessionId", async () => {
      await expect(
        clientConn.loadSession({
          sessionId: "non-existent-id",
          cwd: tempDir,
          mcpServers: [],
        }),
      ).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // closeSession
  // -----------------------------------------------------------------------

  describe("session/close", () => {
    it("persists closed state to meta.json", async () => {
      const s1 = await clientConn.newSession({ cwd: tempDir, mcpServers: [] });

      await clientConn.unstable_closeSession({ sessionId: s1.sessionId });

      const meta = await readSession(tempDir, s1.sessionId);
      expect(meta).toBeDefined();
      expect(meta!.closed).toBe(true);
      expect(meta!.closedAt).toBeDefined();
    });

    it("removes session from in-memory state", async () => {
      const s1 = await clientConn.newSession({ cwd: tempDir, mcpServers: [] });
      expect(getSessionState(s1.sessionId)).toBeDefined();

      await clientConn.unstable_closeSession({ sessionId: s1.sessionId });
      expect(getSessionState(s1.sessionId)).toBeUndefined();
    });

    it("excludes closed sessions from listSessions", async () => {
      const s1 = await clientConn.newSession({ cwd: tempDir, mcpServers: [] });
      const s2 = await clientConn.newSession({ cwd: tempDir, mcpServers: [] });

      await clientConn.unstable_closeSession({ sessionId: s1.sessionId });

      const result = await clientConn.listSessions({ cwd: tempDir });
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].sessionId).toBe(s2.sessionId);
    });

    it("throws for non-existent sessionId", async () => {
      await expect(
        clientConn.unstable_closeSession({ sessionId: "non-existent-id" }),
      ).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // setConfigOption
  // -----------------------------------------------------------------------

  describe("session/set_config_option", () => {
    it("updates agent in memory and meta.json", async () => {
      const s1 = await clientConn.newSession({ cwd: tempDir, mcpServers: [] });

      const result = await clientConn.setSessionConfigOption({
        sessionId: s1.sessionId,
        configId: "agent",
        value: "codex",
      });

      // Verify in-memory state
      const state = getSessionState(s1.sessionId);
      expect(state!.agent).toBe("codex");

      // Verify meta.json
      const meta = await readSession(tempDir, s1.sessionId);
      expect(meta!.agent).toBe("codex");

      // Verify response has configOptions
      expect(result.configOptions).toBeDefined();
      const agentConfig = result.configOptions.find(
        (opt: Record<string, unknown>) => "id" in opt && opt.id === "agent",
      );
      expect(agentConfig).toMatchObject({
        id: "agent",
        currentValue: "codex",
      });
    });

    it("updates role and sends available_commands_update", async () => {
      const newRoleTasks = [{ name: "deploy", ref: "Deploy to production" }];
      const newRole = fakeRole("ops", "local", newRoleTasks);
      mockResolveRole.mockResolvedValue(newRole);

      const s1 = await clientConn.newSession({ cwd: tempDir, mcpServers: [] });

      // Clear previous sessionUpdates from newSession
      sessionUpdates.length = 0;

      await clientConn.setSessionConfigOption({
        sessionId: s1.sessionId,
        configId: "role",
        value: "ops",
      });

      // Verify in-memory state
      const state = getSessionState(s1.sessionId);
      expect(state!.role).toBe("ops");

      // Verify meta.json
      const meta = await readSession(tempDir, s1.sessionId);
      expect(meta!.role).toBe("ops");

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

    it("returns complete configOptions with updated values", async () => {
      const s1 = await clientConn.newSession({ cwd: tempDir, mcpServers: [] });

      const result = await clientConn.setSessionConfigOption({
        sessionId: s1.sessionId,
        configId: "agent",
        value: "codex",
      });

      // Both role and agent options should be present
      expect(result.configOptions).toHaveLength(2);

      const roleConfig = result.configOptions.find(
        (opt: Record<string, unknown>) => "id" in opt && opt.id === "role",
      );
      expect(roleConfig).toMatchObject({ currentValue: "project" });

      const agentConfig = result.configOptions.find(
        (opt: Record<string, unknown>) => "id" in opt && opt.id === "agent",
      );
      expect(agentConfig).toMatchObject({ currentValue: "codex" });
    });

    it("throws for non-existent sessionId", async () => {
      await expect(
        clientConn.setSessionConfigOption({
          sessionId: "non-existent-id",
          configId: "agent",
          value: "codex",
        }),
      ).rejects.toThrow();
    });
  });
});
