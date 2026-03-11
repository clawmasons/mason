/**
 * ACP Agent — implements the ACP SDK `Agent` interface backed by a ToolCaller.
 *
 * Handles `initialize`, `newSession`, `prompt`, and `cancel` protocol messages.
 * The `prompt` handler lists available MCP tools and returns them as a text
 * response so the ACP client knows what tools the agent exposes.
 */

import type { AgentSideConnection, Agent } from "@agentclientprotocol/sdk";
import { PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type {
  InitializeRequest,
  InitializeResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  CancelNotification,
} from "@agentclientprotocol/sdk";
import type { ToolCaller } from "./tool-caller.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface AcpAgentConfig {
  /** ToolCaller for listing and calling MCP tools */
  caller: ToolCaller;
  /**
   * Optional callback invoked during newSession to resolve credentials
   * and connect to the MCP proxy. Called once per session.
   */
  onSessionSetup?: () => Promise<void>;
}

// ── Implementation ────────────────────────────────────────────────────

export class AcpAgent implements Agent {
  private connection: AgentSideConnection;
  private caller: ToolCaller;
  private onSessionSetup?: () => Promise<void>;
  private sessionId: string | null = null;

  constructor(connection: AgentSideConnection, config: AcpAgentConfig) {
    this.connection = connection;
    this.caller = config.caller;
    this.onSessionSetup = config.onSessionSetup;
  }

  async initialize(_params: InitializeRequest): Promise<InitializeResponse> {
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentInfo: {
        name: "mcp-agent",
        version: "0.1.0",
      },
      agentCapabilities: {
        loadSession: false,
      },
    };
  }

  async newSession(_params: NewSessionRequest): Promise<NewSessionResponse> {
    // Run credential resolution and proxy connection if configured
    if (this.onSessionSetup) {
      await this.onSessionSetup();
    }

    // Generate a random session ID
    this.sessionId = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return {
      sessionId: this.sessionId,
    };
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    // List available tools and return them as a text response
    const tools = await this.caller.listTools();

    const toolText =
      tools.length > 0
        ? tools
            .map((t) => {
              const desc = t.description ? ` — ${t.description}` : "";
              return `- ${t.name}${desc}`;
            })
            .join("\n")
        : "No tools available.";

    // Send the tool list as a session update notification
    await this.connection.sessionUpdate({
      sessionId: params.sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: `Available tools:\n${toolText}`,
        },
      },
    });

    return {
      stopReason: "end_turn",
    };
  }

  async cancel(_params: CancelNotification): Promise<void> {
    // No-op: prompt handler is synchronous, nothing to cancel
  }

  async authenticate(): Promise<Record<string, never>> {
    return {};
  }
}

// ── Factory ───────────────────────────────────────────────────────────

/**
 * Create a factory function suitable for passing to `AgentSideConnection`.
 *
 * Usage:
 *   new AgentSideConnection(createAcpAgentFactory(config), stream)
 */
export function createAcpAgentFactory(
  config: AcpAgentConfig,
): (conn: AgentSideConnection) => Agent {
  return (conn: AgentSideConnection): Agent => new AcpAgent(conn, config);
}
