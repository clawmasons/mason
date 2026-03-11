/**
 * Stdio Bridge — Translates stdin/stdout JSON-RPC into HTTP requests
 * against the internal ACP HTTP bridge.
 *
 * ACP clients (VS Code, acpx, Zed) spawn the CLI as a subprocess and
 * communicate via newline-delimited JSON-RPC on stdin/stdout.  This
 * bridge reads each message from stdin, POSTs it to the HTTP bridge
 * running on a local port, and writes the response back to stdout.
 */

import { request as httpRequest } from "node:http";
import { createInterface, type Interface } from "node:readline";
import type { AcpLogger } from "./logger.js";

export interface StdioBridgeConfig {
  /** Port of the internal HTTP bridge (localhost). */
  httpPort: number;
  /** Logger for diagnostics (never writes to stdout). */
  logger: AcpLogger;
}

export class StdioBridge {
  private readonly config: StdioBridgeConfig;
  private rl: Interface | null = null;

  constructor(config: StdioBridgeConfig) {
    this.config = config;
  }

  /**
   * Begin reading JSON-RPC messages from stdin and relaying them.
   */
  start(): void {
    this.rl = createInterface({ input: process.stdin, terminal: false });

    this.rl.on("line", (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      // Log the JSON-RPC method being relayed
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const method = typeof parsed.method === "string" ? parsed.method : undefined;
        this.config.logger.log(`[stdio-bridge] → relay ${method ?? "response"} (${trimmed.length} bytes)`);
      } catch {
        this.config.logger.log(`[stdio-bridge] → relay unknown (${trimmed.length} bytes)`);
      }
      this.relay(trimmed);
    });

    this.rl.on("close", () => {
      this.config.logger.log("[stdio-bridge] stdin closed");
    });
  }

  stop(): void {
    this.rl?.close();
    this.rl = null;
  }

  /**
   * POST a single JSON-RPC message to the HTTP bridge and write the
   * response to stdout.
   */
  private relay(body: string): void {
    const { httpPort, logger } = this.config;
    const buf = Buffer.from(body, "utf-8");

    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port: httpPort,
        path: "/",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(buf.length),
        },
        timeout: 300_000, // 5 min — deferred session start can be slow
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString("utf-8");
          if (responseBody) {
            logger.log(`[stdio-bridge] ← response ${res.statusCode} (${responseBody.length} bytes)`);
            process.stdout.write(responseBody + "\n");
          }
        });
      },
    );

    req.on("error", (err) => {
      logger.error("[stdio-bridge] relay error:", err.message);
      // Write a JSON-RPC error response so the client gets feedback
      const errorResponse = JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: `Bridge relay error: ${err.message}` },
        id: null,
      });
      process.stdout.write(errorResponse + "\n");
    });

    req.on("timeout", () => {
      req.destroy(new Error("Bridge relay timed out"));
    });

    req.end(buf);
  }
}
