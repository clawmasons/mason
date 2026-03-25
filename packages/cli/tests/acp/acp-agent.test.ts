import { describe, it, expect, beforeEach } from "vitest";
import {
  AgentSideConnection,
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import { createMasonAcpAgent, getClientCapabilities, getClientInfo } from "../../src/acp/acp-agent.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = require("../../package.json") as { version: string };

/**
 * Helper: create in-memory connected client + agent pair using TransformStreams.
 */
function createConnectionPair() {
  const clientToAgent = new TransformStream<Uint8Array>();
  const agentToClient = new TransformStream<Uint8Array>();

  // Agent side: reads from clientToAgent, writes to agentToClient
  const agentStream = ndJsonStream(agentToClient.writable, clientToAgent.readable);
  const agentConn = new AgentSideConnection(
    (conn) => createMasonAcpAgent(conn),
    agentStream,
  );

  // Client side: reads from agentToClient, writes to clientToAgent
  const clientStream = ndJsonStream(clientToAgent.writable, agentToClient.readable);

  // Minimal client implementation — only needs sessionUpdate and requestPermission
  const clientConn = new ClientSideConnection(
    () => ({
      async requestPermission() {
        return { outcome: { outcome: "cancelled" as const } };
      },
      async sessionUpdate() {
        // no-op
      },
    }),
    clientStream,
  );

  return { agentConn, clientConn };
}

describe("createMasonAcpAgent — initialize handler", () => {
  let clientConn: ClientSideConnection;

  beforeEach(() => {
    const pair = createConnectionPair();
    clientConn = pair.clientConn;
  });

  it("returns the correct protocol version", async () => {
    const response = await clientConn.initialize({
      protocolVersion: PROTOCOL_VERSION,
    });

    expect(response.protocolVersion).toBe(PROTOCOL_VERSION);
  });

  it("returns correct agent capabilities", async () => {
    const response = await clientConn.initialize({
      protocolVersion: PROTOCOL_VERSION,
    });

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
  });

  it("returns correct agentInfo with CLI version", async () => {
    const response = await clientConn.initialize({
      protocolVersion: PROTOCOL_VERSION,
    });

    expect(response.agentInfo).toEqual({
      name: "mason",
      title: "Mason",
      version: CLI_VERSION,
    });
  });

  it("stores client capabilities from the request", async () => {
    const clientCapabilities = {
      fs: {
        readTextFile: true,
        writeTextFile: true,
      },
    };

    await clientConn.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities,
      clientInfo: {
        name: "test-editor",
        title: "Test Editor",
        version: "1.0.0",
      },
    });

    // The SDK may add default capability values; verify our specified values are present
    expect(getClientCapabilities()).toMatchObject(clientCapabilities);
    expect(getClientInfo()).toEqual({
      name: "test-editor",
      title: "Test Editor",
      version: "1.0.0",
    });
  });
});
