import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ResolvedApp } from "@clawmasons/shared";
import { RelayClient } from "./relay/client.js";
import { CredentialResolver } from "./credentials/resolver.js";
import { CredentialService } from "./credentials/service.js";
import { CredentialRelayHandler } from "./credentials/relay-handler.js";
import { ApprovalHandler } from "./approvals/handler.js";
import { AuditWriter } from "./audit/writer.js";
import { createRelayMessage } from "./relay/messages.js";
import type { AuditEventMessage, RelayMessage } from "./relay/messages.js";
import { createTransport } from "./upstream.js";

// ── Config ──────────────────────────────────────────────────────────────

export interface HostProxyConfig {
  /** WebSocket URL for the Docker proxy's relay endpoint (e.g. ws://localhost:9090/ws/relay). */
  relayUrl: string;
  /** Bearer token for relay authentication. */
  token: string;
  /** Path to .env file for credential resolution. Optional. */
  envFilePath?: string;
  /** macOS Keychain service name. Optional, defaults to "clawmasons". */
  keychainService?: string;
  /** Path for JSONL audit log. Optional, defaults to ~/.mason/data/audit.jsonl. */
  auditFilePath?: string;
  /** Environment credential overrides (e.g. from ACP client mcpServers config). */
  envCredentials?: Record<string, string>;
  /** Host-side MCP server apps to start and manage. */
  hostApps?: ResolvedApp[];
}

// ── Discovered tools per app ─────────────────────────────────────────────

interface HostAppTools {
  appName: string;
  tools: Tool[];
}

// ── HostProxy ───────────────────────────────────────────────────────────

/**
 * Host-side orchestrator that combines relay client, credential service,
 * approval handler, audit writer, and host MCP server management into a
 * single entry point.
 *
 * The host proxy is purely a WebSocket client — it does NOT listen on any
 * port. It connects to the Docker proxy's `/ws/relay` endpoint and handles
 * credential requests, approval dialogs, audit event persistence, and
 * host MCP server lifecycle.
 */
export class HostProxy {
  private readonly config: HostProxyConfig;

  private relayClient: RelayClient | null = null;
  private credentialService: CredentialService | null = null;
  private auditWriter: AuditWriter | null = null;
  /** MCP clients for host-side MCP servers, keyed by app name. */
  private hostClients = new Map<string, Client>();

  constructor(config: HostProxyConfig) {
    this.config = config;
  }

  /**
   * Initialize all host-side services and connect to the Docker proxy.
   *
   * 1. Create CredentialResolver + CredentialService
   * 2. Create AuditWriter
   * 3. Start host MCP servers (if any) — spawn, connect, discover tools
   * 4. Create RelayClient
   * 5. Wire credential, approval, and audit handlers onto the relay client
   * 6. Connect to the Docker proxy's /ws/relay
   * 7. Register host MCP server tools via relay
   */
  async start(): Promise<void> {
    // 1. Credential resolution
    const resolver = new CredentialResolver({
      envFilePath: this.config.envFilePath,
      keychainService: this.config.keychainService,
    });
    this.credentialService = new CredentialService(
      {
        envFilePath: this.config.envFilePath,
        keychainService: this.config.keychainService ?? "clawmasons",
      },
      resolver,
    );

    // 1b. Apply session overrides (e.g. env credentials from ACP client)
    if (this.config.envCredentials && Object.keys(this.config.envCredentials).length > 0) {
      this.credentialService.setSessionOverrides(this.config.envCredentials);
    }

    // 2. Audit writer
    this.auditWriter = new AuditWriter(
      this.config.auditFilePath ? { filePath: this.config.auditFilePath } : undefined,
    );

    // 3. Start host MCP servers and discover tools
    const discoveredApps = await this.startHostMcpServers();

    // 4. Relay client
    this.relayClient = new RelayClient({
      url: this.config.relayUrl,
      token: this.config.token,
    });

    // 5. Wire handlers
    // 5a. Credential requests
    const credentialHandler = new CredentialRelayHandler(
      this.relayClient,
      this.credentialService,
    );
    credentialHandler.register();

    // 5b. Approval requests
    const approvalHandler = new ApprovalHandler(this.relayClient);
    approvalHandler.register();

    // 5c. Audit events (fire-and-forget — no response sent back)
    const auditWriter = this.auditWriter;
    this.relayClient.registerHandler("audit_event", (msg: RelayMessage) => {
      auditWriter.write(msg as AuditEventMessage);
    });

    // 6. Connect
    await this.relayClient.connect();

    // 7. Register host MCP server tools with Docker proxy via relay
    await this.registerHostTools(discoveredApps);
  }

  /**
   * Clean shutdown: disconnect relay, close host MCP clients, close audit writer,
   * close credential service. Idempotent — calling multiple times is safe.
   */
  async stop(): Promise<void> {
    if (this.relayClient) {
      this.relayClient.disconnect();
      this.relayClient = null;
    }

    // Close host MCP clients
    for (const [name, client] of this.hostClients) {
      try {
        await client.close();
      } catch {
        console.error(`Error closing host MCP client "${name}"`);
      }
    }
    this.hostClients.clear();

    if (this.auditWriter) {
      this.auditWriter.close();
      this.auditWriter = null;
    }

    if (this.credentialService) {
      this.credentialService.close();
      this.credentialService = null;
    }
  }

  /** Whether the relay client is currently connected. */
  isConnected(): boolean {
    return this.relayClient?.isConnected() ?? false;
  }

  // ── Private: Host MCP Server Lifecycle ──────────────────────────────

  /**
   * Start host MCP servers and discover their tools.
   * Returns the list of apps with their discovered tools.
   * Errors for individual apps are logged and skipped.
   */
  private async startHostMcpServers(): Promise<HostAppTools[]> {
    const hostApps = this.config.hostApps ?? [];
    if (hostApps.length === 0) return [];

    const discovered: HostAppTools[] = [];

    for (const app of hostApps) {
      try {
        const transport = createTransport({
          name: app.name,
          app,
        });

        const client = new Client(
          { name: "mason-host-mcp", version: "0.1.0" },
        );

        await client.connect(transport);
        this.hostClients.set(app.name, client);

        // Discover tools
        const tools: Tool[] = [];
        let cursor: string | undefined;
        do {
          const result = await client.listTools({ cursor });
          tools.push(...result.tools);
          cursor = result.nextCursor;
        } while (cursor);

        discovered.push({ appName: app.name, tools });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Failed to start host MCP server "${app.name}": ${message}`);
        // Skip this app, continue with others
      }
    }

    return discovered;
  }

  /**
   * Register discovered host MCP server tools with the Docker proxy via relay.
   * Sends mcp_tools_register and awaits mcp_tools_registered confirmation.
   */
  private async registerHostTools(apps: HostAppTools[]): Promise<void> {
    if (!this.relayClient || apps.length === 0) return;

    for (const { appName, tools } of apps) {
      if (tools.length === 0) continue;

      try {
        const registerMsg = createRelayMessage("mcp_tools_register", {
          app_name: appName,
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema as Record<string, unknown>,
          })),
        });

        await this.relayClient.request(registerMsg);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Failed to register host tools for "${appName}": ${message}`);
      }
    }
  }
}
