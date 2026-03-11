import { describe, expect, it, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable, Writable, PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Agent,
  type SessionNotification,
  type PromptResponse,
} from "@agentclientprotocol/sdk";
import { AcpSdkBridge } from "../../src/acp/bridge.js";

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Create a pair of TransformStreams that connect an editor (client)
 * to the bridge (agent). Returns streams suitable for both the bridge
 * and a ClientSideConnection that acts as the editor.
 */
function createEditorStreamPair() {
  // Editor writes to bridge, bridge reads
  const editorToBridge = new TransformStream<Uint8Array, Uint8Array>();
  // Bridge writes to editor, editor reads
  const bridgeToEditor = new TransformStream<Uint8Array, Uint8Array>();

  return {
    // For the bridge (agent side)
    bridgeInput: editorToBridge.readable,
    bridgeOutput: bridgeToEditor.writable,
    // For the editor (client side)
    editorInput: bridgeToEditor.readable,
    editorOutput: editorToBridge.writable,
  };
}

/**
 * Create a mock ChildProcess that simulates a container agent.
 * Uses Node.js PassThrough streams for stdin/stdout and an EventEmitter
 * for process events.
 */
function createMockChildProcess(): {
  child: ChildProcess;
  /** The "stdin" the bridge writes to (mock container reads from) */
  containerInput: PassThrough;
  /** The "stdout" the bridge reads from (mock container writes to) */
  containerOutput: PassThrough;
  /** Simulate process exit */
  simulateExit: (code: number) => void;
  /** Simulate process error */
  simulateError: (err: Error) => void;
} {
  const containerInput = new PassThrough();
  const containerOutput = new PassThrough();
  const emitter = new EventEmitter();

  const child = Object.assign(emitter, {
    stdin: containerInput,
    stdout: containerOutput,
    stderr: new PassThrough(),
    pid: 12345,
    connected: true,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    killed: false,
    stdio: [containerInput, containerOutput, new PassThrough(), null, null] as ChildProcess["stdio"],
    channel: undefined,
    kill: vi.fn(() => {
      (child as unknown as { killed: boolean }).killed = true;
      containerInput.destroy();
      containerOutput.destroy();
      return true;
    }),
    send: vi.fn(),
    disconnect: vi.fn(),
    unref: vi.fn(),
    ref: vi.fn(),
    [Symbol.dispose]: vi.fn(),
  }) as unknown as ChildProcess;

  return {
    child,
    containerInput,
    containerOutput,
    simulateExit: (code: number) => {
      emitter.emit("exit", code, null);
    },
    simulateError: (err: Error) => {
      emitter.emit("error", err);
    },
  };
}

/**
 * Start a mock container agent that responds to ACP messages.
 * Runs an AgentSideConnection on the mock child process streams.
 */
function startMockContainerAgent(
  containerInput: PassThrough,
  containerOutput: PassThrough,
  agentOverrides?: Partial<Agent>,
) {
  // The container reads from containerInput (what bridge writes to child.stdin)
  // The container writes to containerOutput (what bridge reads from child.stdout)
  const { AgentSideConnection } = require("@agentclientprotocol/sdk") as typeof import("@agentclientprotocol/sdk");

  const inputWebStream = Readable.toWeb(containerInput) as ReadableStream<Uint8Array>;
  const outputWebStream = Writable.toWeb(containerOutput) as WritableStream<Uint8Array>;
  const stream = ndJsonStream(outputWebStream, inputWebStream);

  const defaultAgent: Agent = {
    async initialize() {
      return {
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: {},
        agentInfo: { name: "mock-agent", version: "0.1.0" },
      };
    },
    async newSession(params) {
      return {
        sessionId: "mock-session-123",
      };
    },
    async prompt(params) {
      return {
        stopReason: "end_turn",
      } satisfies PromptResponse;
    },
    async cancel() {},
    async authenticate() {
      return {};
    },
    ...agentOverrides,
  };

  const conn = new AgentSideConnection(() => defaultAgent, stream);
  return conn;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("AcpSdkBridge", () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    for (const cleanup of cleanups.reverse()) {
      await cleanup();
    }
    cleanups.length = 0;
  });

  describe("initialize", () => {
    it("returns capabilities without starting container", async () => {
      const streams = createEditorStreamPair();
      const onSessionNew = vi.fn();

      const bridge = new AcpSdkBridge({ onSessionNew });
      bridge.start(streams.bridgeInput, streams.bridgeOutput);
      cleanups.push(() => bridge.stop());

      // Create an editor ClientSideConnection
      const editorStream = ndJsonStream(streams.editorOutput, streams.editorInput);
      const sessionUpdates: SessionNotification[] = [];
      const editorConn = new ClientSideConnection(
        () => ({
          requestPermission: async () => ({ outcome: { outcome: "selected" as const, optionId: "allow" } }),
          sessionUpdate: async (params) => { sessionUpdates.push(params); },
        }),
        editorStream,
      );
      cleanups.push(() => void 0); // editorConn cleanup is handled by stream closure

      // Send initialize
      const response = await editorConn.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });

      expect(response.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(response.agentInfo?.name).toBe("clawmasons");
      expect(response.agentInfo?.version).toBe("1.0.0");
      // Container should NOT have been started
      expect(onSessionNew).not.toHaveBeenCalled();
    });
  });

  describe("session/new", () => {
    it("triggers onSessionNew callback with cwd and creates container connection", async () => {
      const streams = createEditorStreamPair();
      const { child, containerInput, containerOutput } = createMockChildProcess();

      let receivedCwd: string | undefined;
      const onSessionNew = vi.fn(async (cwd: string) => {
        receivedCwd = cwd;
        // Start mock agent on the container side
        startMockContainerAgent(containerInput, containerOutput);
        return child;
      });

      const bridge = new AcpSdkBridge({ onSessionNew });
      bridge.start(streams.bridgeInput, streams.bridgeOutput);
      cleanups.push(() => bridge.stop());

      // Create editor connection
      const editorStream = ndJsonStream(streams.editorOutput, streams.editorInput);
      const editorConn = new ClientSideConnection(
        () => ({
          requestPermission: async () => ({ outcome: { outcome: "selected" as const, optionId: "allow" } }),
          sessionUpdate: async () => {},
        }),
        editorStream,
      );

      // Initialize first
      await editorConn.initialize({
        protocolVersion: PROTOCOL_VERSION,
      });

      // Send session/new
      const response = await editorConn.newSession({
        cwd: "/projects/myapp",
        mcpServers: [],
      });

      expect(onSessionNew).toHaveBeenCalledWith("/projects/myapp");
      expect(receivedCwd).toBe("/projects/myapp");
      expect(response.sessionId).toBe("mock-session-123");
    });
  });

  describe("prompt forwarding", () => {
    it("forwards prompt to container and returns response", async () => {
      const streams = createEditorStreamPair();
      const { child, containerInput, containerOutput } = createMockChildProcess();

      const promptReceived = vi.fn();
      const onSessionNew = vi.fn(async () => {
        startMockContainerAgent(containerInput, containerOutput, {
          async prompt(params) {
            promptReceived(params);
            return {
              stopReason: "end_turn",
            } satisfies PromptResponse;
          },
        });
        return child;
      });

      const bridge = new AcpSdkBridge({ onSessionNew });
      bridge.start(streams.bridgeInput, streams.bridgeOutput);
      cleanups.push(() => bridge.stop());

      const editorStream = ndJsonStream(streams.editorOutput, streams.editorInput);
      const editorConn = new ClientSideConnection(
        () => ({
          requestPermission: async () => ({ outcome: { outcome: "selected" as const, optionId: "allow" } }),
          sessionUpdate: async () => {},
        }),
        editorStream,
      );

      await editorConn.initialize({ protocolVersion: PROTOCOL_VERSION });
      await editorConn.newSession({ cwd: "/test", mcpServers: [] });

      // Send prompt
      const response = await editorConn.prompt({
        sessionId: "mock-session-123",
        prompt: [{ type: "text", text: "hello" }],
      });

      expect(promptReceived).toHaveBeenCalled();
      expect(response.stopReason).toBe("end_turn");
    });

    it("throws error when prompt sent without active session", async () => {
      const streams = createEditorStreamPair();
      const onSessionNew = vi.fn();

      const bridge = new AcpSdkBridge({ onSessionNew });
      bridge.start(streams.bridgeInput, streams.bridgeOutput);
      cleanups.push(() => bridge.stop());

      const editorStream = ndJsonStream(streams.editorOutput, streams.editorInput);
      const editorConn = new ClientSideConnection(
        () => ({
          requestPermission: async () => ({ outcome: { outcome: "selected" as const, optionId: "allow" } }),
          sessionUpdate: async () => {},
        }),
        editorStream,
      );

      await editorConn.initialize({ protocolVersion: PROTOCOL_VERSION });

      // Send prompt without session/new
      await expect(
        editorConn.prompt({
          sessionId: "nonexistent",
          prompt: [{ type: "text", text: "hello" }],
        }),
      ).rejects.toThrow();
    });
  });

  describe("notification forwarding", () => {
    it("forwards sessionUpdate from container to editor", async () => {
      const streams = createEditorStreamPair();
      const { child, containerInput, containerOutput } = createMockChildProcess();

      let containerConn: import("@agentclientprotocol/sdk").AgentSideConnection | undefined;
      const onSessionNew = vi.fn(async () => {
        containerConn = startMockContainerAgent(containerInput, containerOutput);
        return child;
      });

      const bridge = new AcpSdkBridge({ onSessionNew });
      bridge.start(streams.bridgeInput, streams.bridgeOutput);
      cleanups.push(() => bridge.stop());

      const sessionUpdates: SessionNotification[] = [];
      const editorStream = ndJsonStream(streams.editorOutput, streams.editorInput);
      const editorConn = new ClientSideConnection(
        () => ({
          requestPermission: async () => ({ outcome: { outcome: "selected" as const, optionId: "allow" } }),
          sessionUpdate: async (params) => {
            sessionUpdates.push(params);
          },
        }),
        editorStream,
      );

      await editorConn.initialize({ protocolVersion: PROTOCOL_VERSION });
      await editorConn.newSession({ cwd: "/test", mcpServers: [] });

      // Send sessionUpdate from container
      if (containerConn) {
        await containerConn.sessionUpdate({
          sessionId: "mock-session-123",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "hello from container" },
          },
        });

        // Give time for the notification to propagate
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      expect(sessionUpdates.length).toBeGreaterThanOrEqual(1);
      expect(sessionUpdates[0]!.sessionId).toBe("mock-session-123");
    });
  });

  describe("container crash recovery", () => {
    it("detects container exit and allows new session", async () => {
      const streams = createEditorStreamPair();
      const { child: child1, containerInput: input1, containerOutput: output1, simulateExit } = createMockChildProcess();
      const { child: child2, containerInput: input2, containerOutput: output2 } = createMockChildProcess();

      let callCount = 0;
      const onSessionNew = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          startMockContainerAgent(input1, output1);
          return child1;
        }
        startMockContainerAgent(input2, output2);
        return child2;
      });

      const bridge = new AcpSdkBridge({ onSessionNew });
      bridge.start(streams.bridgeInput, streams.bridgeOutput);
      cleanups.push(() => bridge.stop());

      const editorStream = ndJsonStream(streams.editorOutput, streams.editorInput);
      const editorConn = new ClientSideConnection(
        () => ({
          requestPermission: async () => ({ outcome: { outcome: "selected" as const, optionId: "allow" } }),
          sessionUpdate: async () => {},
        }),
        editorStream,
      );

      await editorConn.initialize({ protocolVersion: PROTOCOL_VERSION });

      // First session
      const resp1 = await editorConn.newSession({ cwd: "/test1", mcpServers: [] });
      expect(resp1.sessionId).toBe("mock-session-123");

      // Simulate container crash
      simulateExit(1);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second session should work
      const resp2 = await editorConn.newSession({ cwd: "/test2", mcpServers: [] });
      expect(resp2.sessionId).toBe("mock-session-123");
      expect(onSessionNew).toHaveBeenCalledTimes(2);
    });
  });

  describe("stop()", () => {
    it("kills child process and cleans up", async () => {
      const streams = createEditorStreamPair();
      const { child, containerInput, containerOutput } = createMockChildProcess();

      const onSessionNew = vi.fn(async () => {
        startMockContainerAgent(containerInput, containerOutput);
        return child;
      });

      const bridge = new AcpSdkBridge({ onSessionNew });
      bridge.start(streams.bridgeInput, streams.bridgeOutput);

      const editorStream = ndJsonStream(streams.editorOutput, streams.editorInput);
      const editorConn = new ClientSideConnection(
        () => ({
          requestPermission: async () => ({ outcome: { outcome: "selected" as const, optionId: "allow" } }),
          sessionUpdate: async () => {},
        }),
        editorStream,
      );

      await editorConn.initialize({ protocolVersion: PROTOCOL_VERSION });
      await editorConn.newSession({ cwd: "/test", mcpServers: [] });

      await bridge.stop();

      expect(child.kill).toHaveBeenCalled();
    });

    it("is idempotent — calling stop twice does not throw", async () => {
      const streams = createEditorStreamPair();
      const bridge = new AcpSdkBridge({ onSessionNew: vi.fn() });
      bridge.start(streams.bridgeInput, streams.bridgeOutput);

      await bridge.stop();
      await expect(bridge.stop()).resolves.toBeUndefined();
    });
  });

  describe("connection lifecycle", () => {
    it("closed resolves when editor disconnects", async () => {
      const streams = createEditorStreamPair();
      const bridge = new AcpSdkBridge({ onSessionNew: vi.fn() });
      bridge.start(streams.bridgeInput, streams.bridgeOutput);

      // Close the editor output to simulate editor disconnect
      const writer = streams.editorOutput.getWriter();
      await writer.close();

      // The bridge's closed should resolve
      await expect(bridge.closed).resolves.toBeUndefined();
    });
  });
});
