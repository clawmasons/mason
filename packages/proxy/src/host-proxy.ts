import { RelayClient } from "./relay/client.js";
import { CredentialResolver } from "./credentials/resolver.js";
import { CredentialService } from "./credentials/service.js";
import { CredentialRelayHandler } from "./credentials/relay-handler.js";
import { ApprovalHandler } from "./approvals/handler.js";
import { AuditWriter } from "./audit/writer.js";
import type { AuditEventMessage, RelayMessage } from "./relay/messages.js";

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
}

// ── HostProxy ───────────────────────────────────────────────────────────

/**
 * Host-side orchestrator that combines relay client, credential service,
 * approval handler, and audit writer into a single entry point.
 *
 * The host proxy is purely a WebSocket client — it does NOT listen on any
 * port. It connects to the Docker proxy's `/ws/relay` endpoint and handles
 * credential requests, approval dialogs, and audit event persistence.
 */
export class HostProxy {
  private readonly config: HostProxyConfig;

  private relayClient: RelayClient | null = null;
  private credentialService: CredentialService | null = null;
  private auditWriter: AuditWriter | null = null;

  constructor(config: HostProxyConfig) {
    this.config = config;
  }

  /**
   * Initialize all host-side services and connect to the Docker proxy.
   *
   * 1. Create CredentialResolver + CredentialService
   * 2. Create AuditWriter
   * 3. Create RelayClient
   * 4. Wire credential, approval, and audit handlers onto the relay client
   * 5. Connect to the Docker proxy's /ws/relay
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

    // 3. Relay client
    this.relayClient = new RelayClient({
      url: this.config.relayUrl,
      token: this.config.token,
    });

    // 4. Wire handlers
    // 4a. Credential requests
    const credentialHandler = new CredentialRelayHandler(
      this.relayClient,
      this.credentialService,
    );
    credentialHandler.register();

    // 4b. Approval requests
    const approvalHandler = new ApprovalHandler(this.relayClient);
    approvalHandler.register();

    // 4c. Audit events (fire-and-forget — no response sent back)
    const auditWriter = this.auditWriter;
    this.relayClient.registerHandler("audit_event", (msg: RelayMessage) => {
      auditWriter.write(msg as AuditEventMessage);
    });

    // 5. Connect
    await this.relayClient.connect();
  }

  /**
   * Clean shutdown: disconnect relay, close audit writer, close credential service.
   * Idempotent — calling multiple times is safe.
   */
  async stop(): Promise<void> {
    if (this.relayClient) {
      this.relayClient.disconnect();
      this.relayClient = null;
    }

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
}
