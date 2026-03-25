import {
  type Agent,
  type AgentSideConnection,
  type InitializeRequest,
  type InitializeResponse,
  type ClientCapabilities,
  type Implementation,
  PROTOCOL_VERSION,
  RequestError,
} from "@agentclientprotocol/sdk";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, "..", "..", "package.json");
const { version: CLI_VERSION } = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };

/**
 * Stored client capabilities from the most recent `initialize` request.
 * Future handlers use this to check which client features are available.
 */
let storedClientCapabilities: ClientCapabilities | undefined;
let storedClientInfo: Implementation | null | undefined;

/**
 * Returns the client capabilities from the last `initialize` call,
 * or undefined if `initialize` has not been called yet.
 */
export function getClientCapabilities(): ClientCapabilities | undefined {
  return storedClientCapabilities;
}

/**
 * Returns the client info from the last `initialize` call,
 * or undefined if `initialize` has not been called yet.
 */
export function getClientInfo(): Implementation | null | undefined {
  return storedClientInfo;
}

/**
 * Creates the mason ACP agent handler.
 *
 * Implements the `Agent` interface from `@agentclientprotocol/sdk`.
 * Currently only the `initialize` handler is fully implemented;
 * all other handlers are stubs for future changes.
 */
export function createMasonAcpAgent(conn: AgentSideConnection): Agent {
  // Store connection reference for future use (sessionUpdate notifications, etc.)
  void conn;

  return {
    async initialize(params: InitializeRequest): Promise<InitializeResponse> {
      // Store client capabilities for future use
      storedClientCapabilities = params.clientCapabilities ?? undefined;
      storedClientInfo = params.clientInfo ?? undefined;

      return {
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: {
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
        },
        agentInfo: {
          name: "mason",
          title: "Mason",
          version: CLI_VERSION,
        },
      };
    },

    async newSession() {
      throw RequestError.methodNotFound("session/new");
    },

    async prompt() {
      throw RequestError.methodNotFound("session/prompt");
    },

    async cancel() {
      // Notification — no response expected. Stub for now.
    },

    async authenticate() {
      // No auth needed for local stdio transport
      return {};
    },

    async setSessionMode() {
      throw RequestError.methodNotFound("session/setSessionMode");
    },
  };
}
