import {
  type Agent,
  type AgentSideConnection,
  type InitializeRequest,
  type InitializeResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type ClientCapabilities,
  type Implementation,
  type SessionConfigOption,
  PROTOCOL_VERSION,
  RequestError,
} from "@agentclientprotocol/sdk";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSession } from "@clawmasons/shared";
import { discoverForCwd } from "./discovery-cache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, "..", "..", "package.json");
const { version: CLI_VERSION } = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };

// ---------------------------------------------------------------------------
// In-memory session state (runtime data not persisted to meta.json)
// ---------------------------------------------------------------------------

export interface SessionState {
  sessionId: string;
  cwd: string;
  role: string;
  agent: string;
  abortController?: AbortController;
}

/** Runtime session state keyed by sessionId. */
const sessions = new Map<string, SessionState>();

/** Expose sessions map for testing. */
export function getSessionState(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

// ---------------------------------------------------------------------------
// Client capabilities storage
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Agent factory
// ---------------------------------------------------------------------------

/**
 * Creates the mason ACP agent handler.
 *
 * Implements the `Agent` interface from `@agentclientprotocol/sdk`.
 * The `initialize` and `newSession` handlers are fully implemented;
 * remaining handlers are stubs for future changes.
 */
export function createMasonAcpAgent(conn: AgentSideConnection): Agent {
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

    async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
      const { cwd } = params;
      if (!cwd) {
        throw RequestError.invalidParams("cwd is required for session/new");
      }

      // Discover roles and agents for this project directory
      const discovery = await discoverForCwd(cwd);
      const { roles, agentNames, defaultRole, defaultAgent } = discovery;

      // Persist session to disk
      const session = await createSession(cwd, defaultAgent, defaultRole.metadata.name);

      // Track in-memory state
      sessions.set(session.sessionId, {
        sessionId: session.sessionId,
        cwd,
        role: defaultRole.metadata.name,
        agent: defaultAgent,
      });

      // Build configOptions
      const configOptions: SessionConfigOption[] = [
        {
          id: "role",
          name: "Role",
          type: "select" as const,
          category: "role",
          currentValue: defaultRole.metadata.name,
          options: roles.map((r) => ({
            value: r.metadata.name,
            name: r.metadata.name,
            description:
              r.source.type === "package"
                ? `(packaged: ${r.source.packageName ?? "unknown"})`
                : "(local)",
          })),
        },
        {
          id: "agent",
          name: "Agent",
          type: "select" as const,
          category: "model",
          currentValue: defaultAgent,
          options: agentNames.map((name) => ({
            value: name,
            name,
          })),
        },
      ];

      const response: NewSessionResponse = {
        sessionId: session.sessionId,
        configOptions,
      };

      // Send available_commands_update after response (fire-and-forget)
      const availableCommands = (defaultRole.tasks ?? []).map((task) => ({
        name: task.name,
        description: task.ref ?? task.name,
        input: { hint: "command arguments" },
      }));

      // Use setImmediate-style scheduling so the response is sent first
      void conn.sessionUpdate({
        sessionId: session.sessionId,
        update: {
          sessionUpdate: "available_commands_update" as const,
          availableCommands,
        },
      });

      return response;
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
