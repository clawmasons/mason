import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketServer, type WebSocket as WSType } from "ws";
import { CredentialWSClient } from "../src/ws-client.js";
import { CredentialService } from "../src/service.js";
import type { CredentialRequest } from "../src/schemas.js";

// Mock the keychain module
vi.mock("../src/keychain.js", () => ({
  queryKeychain: vi.fn().mockResolvedValue(undefined),
}));

describe("CredentialWSClient", () => {
  let wss: WebSocketServer;
  let service: CredentialService;
  let client: CredentialWSClient;
  let port: number;
  const envKeysToClean: string[] = [];

  function setEnv(key: string, value: string): void {
    process.env[key] = value;
    envKeysToClean.push(key);
  }

  function startServer(
    onConnection?: (ws: WSType, token: string | undefined) => void,
  ): Promise<number> {
    return new Promise((resolve) => {
      wss = new WebSocketServer({ port: 0 });
      wss.on("listening", () => {
        const addr = wss.address();
        const p = typeof addr === "object" && addr ? addr.port : 0;
        resolve(p);
      });
      if (onConnection) {
        wss.on("connection", (ws, req) => {
          const auth = req.headers.authorization;
          const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
          onConnection(ws, token);
        });
      }
    });
  }

  beforeEach(() => {
    service = new CredentialService({
      dbPath: ":memory:",
      envFilePath: "/nonexistent/.env",
      keychainService: "test",
    });
  });

  afterEach(async () => {
    client?.disconnect();
    service?.close();
    if (wss) {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    }
    for (const key of envKeysToClean) {
      process.env[key] = undefined;
    }
    envKeysToClean.length = 0;
  });

  it("connects to the WebSocket server with auth token", async () => {
    let receivedToken: string | undefined;
    port = await startServer((_ws, token) => {
      receivedToken = token;
    });

    client = new CredentialWSClient(service);
    await client.connect(`ws://localhost:${port}`, "my-secret-token");

    expect(receivedToken).toBe("my-secret-token");
  });

  it("handles incoming requests and sends responses", async () => {
    setEnv("TEST_KEY", "test-value");

    const responsePromise = new Promise<string>((resolve) => {
      startServer((ws) => {
        const request: CredentialRequest = {
          id: "req-123",
          key: "TEST_KEY",
          agentId: "agent-1",
          role: "role-1",
          sessionId: "sess-1",
          declaredCredentials: ["TEST_KEY"],
        };
        ws.send(JSON.stringify(request));
        ws.on("message", (data) => {
          resolve(data.toString());
        });
      }).then((p) => {
        port = p;
      });
    });

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 50));

    client = new CredentialWSClient(service);
    await client.connect(`ws://localhost:${port}`, "token");

    const responseStr = await responsePromise;
    const response = JSON.parse(responseStr);

    expect(response).toEqual({
      id: "req-123",
      key: "TEST_KEY",
      value: "test-value",
      source: "env",
    });
  });

  it("handles ACCESS_DENIED for undeclared credentials", async () => {
    const responsePromise = new Promise<string>((resolve) => {
      startServer((ws) => {
        const request: CredentialRequest = {
          id: "req-456",
          key: "FORBIDDEN_KEY",
          agentId: "agent-1",
          role: "role-1",
          sessionId: "sess-1",
          declaredCredentials: ["OTHER_KEY"],
        };
        ws.send(JSON.stringify(request));
        ws.on("message", (data) => {
          resolve(data.toString());
        });
      }).then((p) => {
        port = p;
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    client = new CredentialWSClient(service);
    await client.connect(`ws://localhost:${port}`, "token");

    const responseStr = await responsePromise;
    const response = JSON.parse(responseStr);

    expect(response.code).toBe("ACCESS_DENIED");
    expect(response.key).toBe("FORBIDDEN_KEY");
  });

  it("rejects connection when server is not available", async () => {
    client = new CredentialWSClient(service, { maxRetries: 0, retryDelayMs: 10 });

    await expect(
      client.connect("ws://localhost:19999", "token"),
    ).rejects.toThrow();
  });
});
