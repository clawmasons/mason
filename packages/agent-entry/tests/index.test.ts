import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import { connectToProxy, requestCredentials } from "../src/index.js";

// ── Mock Proxy Server ──────────────────────────────────────────────────

let server: http.Server;
let serverPort: number;
let baseUrl: string;

// State for the mock proxy
const mockProxyToken = "test-proxy-token";
const mockSessionToken = "test-session-token-abc";
const mockSessionId = "test-session-id-123";
let mcpInitialized = false;
const mcpSessionId = "mock-mcp-session-1";

// Mock credentials store
const mockCredentials: Record<string, string> = {
  API_KEY: "sk-test-api-key",
  DB_PASSWORD: "secret-db-pass",
};

function createMockProxy(): http.Server {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost`);

    // POST /connect-agent
    if (url.pathname === "/connect-agent") {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }

      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${mockProxyToken}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          sessionToken: mockSessionToken,
          sessionId: mockSessionId,
        }),
      );
      return;
    }

    // POST /mcp — MCP Streamable HTTP
    if (url.pathname === "/mcp" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        const rpc = JSON.parse(body) as {
          jsonrpc: string;
          id?: number;
          method: string;
          params?: Record<string, unknown>;
        };

        // initialize
        if (rpc.method === "initialize") {
          mcpInitialized = true;
          res.writeHead(200, {
            "Content-Type": "application/json",
            "mcp-session-id": mcpSessionId,
          });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: rpc.id,
              result: {
                protocolVersion: "2025-03-26",
                capabilities: { tools: {} },
                serverInfo: { name: "mock-proxy", version: "0.1.0" },
              },
            }),
          );
          return;
        }

        // notifications/initialized
        if (rpc.method === "notifications/initialized") {
          res.writeHead(204);
          res.end();
          return;
        }

        // tools/call
        if (rpc.method === "tools/call" && mcpInitialized) {
          const params = rpc.params as {
            name: string;
            arguments: { key: string; session_token: string };
          };

          if (params.name === "credential_request") {
            const { key, session_token } = params.arguments;

            // Validate session token
            if (session_token !== mockSessionToken) {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: rpc.id,
                  result: {
                    content: [
                      {
                        type: "text",
                        text: JSON.stringify({
                          key,
                          error: "Invalid session token",
                          code: "INVALID_SESSION",
                        }),
                      },
                    ],
                    isError: true,
                  },
                }),
              );
              return;
            }

            // Look up credential
            const value = mockCredentials[key];
            if (value) {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: rpc.id,
                  result: {
                    content: [
                      {
                        type: "text",
                        text: JSON.stringify({ key, value, source: "env" }),
                      },
                    ],
                  },
                }),
              );
            } else {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: rpc.id,
                  result: {
                    content: [
                      {
                        type: "text",
                        text: JSON.stringify({
                          key,
                          error: `Credential '${key}' not found`,
                          code: "NOT_FOUND",
                        }),
                      },
                    ],
                  },
                }),
              );
            }
            return;
          }

          // Unknown tool
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: rpc.id,
              error: { code: -32601, message: `Unknown tool: ${params.name}` },
            }),
          );
          return;
        }

        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Bad request" }));
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });
}

beforeAll(async () => {
  server = createMockProxy();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      serverPort = addr.port;
      baseUrl = `http://127.0.0.1:${serverPort}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

beforeEach(() => {
  mcpInitialized = false;
});

// ── Tests ──────────────────────────────────────────────────────────────

describe("connectToProxy", () => {
  it("returns sessionToken and sessionId with valid token", async () => {
    const result = await connectToProxy(baseUrl, mockProxyToken);
    expect(result.sessionToken).toBe(mockSessionToken);
    expect(result.sessionId).toBe(mockSessionId);
  });

  it("throws on invalid token", async () => {
    await expect(connectToProxy(baseUrl, "bad-token")).rejects.toThrow("authentication failed");
  });

  it("retries on connection failure then throws", async () => {
    // Connect to a port that doesn't exist
    await expect(connectToProxy("http://127.0.0.1:1", "token")).rejects.toThrow();
  }, 10_000);
});

describe("requestCredentials", () => {
  it("retrieves credentials for valid keys", async () => {
    const creds = await requestCredentials(
      baseUrl,
      mockProxyToken,
      mockSessionToken,
      ["API_KEY", "DB_PASSWORD"],
    );
    expect(creds).toEqual({
      API_KEY: "sk-test-api-key",
      DB_PASSWORD: "secret-db-pass",
    });
  });

  it("returns empty object for empty keys array", async () => {
    const creds = await requestCredentials(baseUrl, mockProxyToken, mockSessionToken, []);
    expect(creds).toEqual({});
  });

  it("throws when a credential is not found", async () => {
    await expect(
      requestCredentials(baseUrl, mockProxyToken, mockSessionToken, ["NONEXISTENT_KEY"]),
    ).rejects.toThrow("Credential retrieval failed");
  });

  it("throws when session token is invalid", async () => {
    await expect(
      requestCredentials(baseUrl, mockProxyToken, "invalid-session", ["API_KEY"]),
    ).rejects.toThrow("Credential retrieval failed");
  });
});
