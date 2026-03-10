import WebSocket from "ws";
import { credentialRequestSchema } from "./schemas.js";
import type { CredentialService } from "./service.js";

export interface CredentialWSClientOptions {
  /** Maximum number of reconnect attempts. */
  maxRetries?: number;
  /** Delay between reconnect attempts in milliseconds. */
  retryDelayMs?: number;
}

/**
 * WebSocket client that connects to the proxy and handles credential
 * requests relayed from agents.
 */
export class CredentialWSClient {
  private readonly service: CredentialService;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private ws: WebSocket | null = null;
  private retryCount = 0;
  private proxyUrl = "";
  private token = "";
  private closed = false;

  constructor(service: CredentialService, options: CredentialWSClientOptions = {}) {
    this.service = service;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
  }

  /**
   * Connect to the proxy WebSocket endpoint.
   *
   * Resolves when the connection is established.
   * Rejects if the connection fails after all retries.
   */
  connect(proxyUrl: string, token: string): Promise<void> {
    this.proxyUrl = proxyUrl;
    this.token = token;
    this.closed = false;
    this.retryCount = 0;
    return this.attemptConnect();
  }

  /**
   * Disconnect from the proxy.
   */
  disconnect(): void {
    this.closed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private attemptConnect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.proxyUrl, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      ws.on("open", () => {
        this.ws = ws;
        this.retryCount = 0;
        resolve();
      });

      ws.on("message", (data: WebSocket.RawData) => {
        this.handleMessage(data).catch((err) => {
          console.error("[credential-service] Error handling message:", err);
        });
      });

      ws.on("close", () => {
        if (!this.closed) {
          this.handleReconnect().catch((err) => {
            console.error("[credential-service] Reconnect failed:", err);
          });
        }
      });

      ws.on("error", (err: Error) => {
        if (this.ws === null && this.retryCount === 0) {
          // Initial connection failure
          reject(err);
        }
        // Subsequent errors trigger close → reconnect
      });
    });
  }

  private async handleMessage(data: WebSocket.RawData): Promise<void> {
    const raw = data.toString("utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[credential-service] Invalid JSON received:", raw);
      return;
    }

    const result = credentialRequestSchema.safeParse(parsed);
    if (!result.success) {
      console.error("[credential-service] Invalid request:", result.error.message);
      return;
    }

    const response = await this.service.handleRequest(result.data);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(response));
    }
  }

  private async handleReconnect(): Promise<void> {
    if (this.closed) return;

    this.retryCount++;
    if (this.retryCount > this.maxRetries) {
      console.error(
        `[credential-service] Max reconnect attempts (${this.maxRetries}) reached. Giving up.`,
      );
      return;
    }

    console.log(
      `[credential-service] Reconnecting (attempt ${this.retryCount}/${this.maxRetries})...`,
    );

    await this.delay(this.retryDelayMs);

    try {
      await this.attemptConnect();
    } catch {
      // attemptConnect rejection triggers another reconnect via close handler
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
