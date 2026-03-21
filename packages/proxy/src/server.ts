import { existsSync } from "node:fs";
import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CLI_NAME_LOWERCASE } from "@clawmasons/shared";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolRouter, ResourceRouter, PromptRouter } from "./router.js";
import type { UpstreamManager } from "./upstream.js";
import { auditPreHook, auditPostHook } from "./hooks/audit.js";
import type { HookContext } from "./hooks/audit.js";
import { matchesApprovalPattern, requestApproval } from "./hooks/approval.js";
import type { ApprovalOptions } from "./hooks/approval.js";
import { SessionStore, handleConnectAgent, type RiskLevel } from "./handlers/connect-agent.js";
import { RelayServer } from "./relay/server.js";
import { createRelayMessage, type CredentialResponseMessage } from "./relay/messages.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface ProxyServerConfig {
  port?: number;
  transport: "sse" | "streamable-http";
  router: ToolRouter;
  upstream: UpstreamManager;
  agentName?: string;
  authToken?: string;
  approvalPatterns?: string[];
  approvalOptions?: ApprovalOptions;
  resourceRouter?: ResourceRouter;
  promptRouter?: PromptRouter;
  /** Token for authenticating relay WebSocket connections (/ws/relay). */
  relayToken?: string;
  /** Timeout for credential requests in milliseconds. Default: 30000. */
  credentialRequestTimeoutMs?: number;
  /** Agent's declared credential keys (for credential_request tool). */
  declaredCredentials?: string[];
  /** Role name for the agent session. */
  roleName?: string;
  /** Risk level for the agent's role. Controls connection limits. */
  riskLevel?: RiskLevel;
  /** Session type for audit logging (e.g., "acp" for ACP sessions). */
  sessionType?: string;
  /** ACP client editor name for audit logging (e.g., "zed", "jetbrains"). */
  acpClient?: string;
  /** Promise that resolves when upstream MCP servers and routing are ready.
   *  Health + connect-agent + credential_request work immediately;
   *  tool/resource/prompt handlers await this before processing. */
  readyGate?: Promise<void>;
}

// ── credential_request Tool Definition ──────────────────────────────────

const CREDENTIAL_REQUEST_TOOL: Tool = {
  name: "credential_request",
  description: "Request a credential value from the credential service. Returns the resolved credential or an error.",
  inputSchema: {
    type: "object" as const,
    properties: {
      key: {
        type: "string",
        description: "The credential key to request (e.g., OPENAI_API_KEY)",
      },
      session_token: {
        type: "string",
        description: "The agent session token received from connect-agent",
      },
    },
    required: ["key", "session_token"],
  },
};

// ── ProxyServer ──────────────────────────────────────────────────

const DEFAULT_PORT = 9090;

export class ProxyServer {
  private config: Required<Pick<ProxyServerConfig, "port" | "transport">> & ProxyServerConfig;
  private httpServer: HttpServer | null = null;
  private activeTransports: Set<SSEServerTransport | StreamableHTTPServerTransport> = new Set();
  private sessionStore: SessionStore;
  private relayServer: RelayServer | null = null;
  constructor(config: ProxyServerConfig) {
    this.config = { ...config, port: config.port ?? DEFAULT_PORT };
    this.sessionStore = new SessionStore(config.riskLevel);

    if (config.relayToken) {
      this.relayServer = new RelayServer({
        token: config.relayToken,
      });
    }
  }

  /** Late-bind routing tables after upstream initialization completes. */
  setRouting(opts: { router: ToolRouter; resourceRouter?: ResourceRouter; promptRouter?: PromptRouter }): void {
    this.config = { ...this.config, ...opts };
  }

  /** Expose the session store for external access (e.g., risk-based limits in CHANGE 5). */
  getSessionStore(): SessionStore {
    return this.sessionStore;
  }

  /** Expose the relay server for external access (e.g., registering handlers). */
  getRelayServer(): RelayServer | null {
    return this.relayServer;
  }

  async start(): Promise<void> {
    const { port, transport } = this.config;

    this.httpServer = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      // Health endpoint — no auth required
      // Also checks PROJECT_DIR is accessible to ensure VirtioFS host_mark registration
      // is complete before the agent container starts mounting config files over it.
      if (req.method === "GET" && url.pathname === "/health") {
        const projectDir = process.env.PROJECT_DIR;
        if (projectDir && !existsSync(projectDir)) {
          res.writeHead(503, { "Content-Type": "text/plain" });
          res.end("filesystem not ready");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
        return;
      }

      // Connect-agent endpoint — uses its own auth (MCP_PROXY_TOKEN)
      if (url.pathname === "/connect-agent") {
        if (this.config.authToken) {
          handleConnectAgent(
            req,
            res,
            this.config.authToken,
            this.sessionStore,
            this.config.agentName,
            this.config.roleName,
          );
        } else {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Proxy not configured with auth token" }));
        }
        return;
      }

      // Auth check — before any MCP handling
      if (this.config.authToken && !this.checkAuth(req)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      if (transport === "sse") {
        this.handleSseRequest(req, res);
      } else {
        this.handleStreamableHttpRequest(req, res);
      }
    });

    // WebSocket upgrade handler for relay
    if (this.relayServer) {
      const relayServer = this.relayServer;
      this.httpServer.on("upgrade", (req, socket, head) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        if (url.pathname === "/ws/relay") {
          relayServer.handleUpgrade(req, socket, head as Buffer);
        } else {
          socket.destroy();
        }
      });
    }

    const server = this.httpServer;
    return new Promise<void>((resolve, reject) => {
      server.on("error", reject);
      server.listen(port, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // Shut down relay server
    if (this.relayServer) {
      this.relayServer.shutdown();
    }

    const closePromises = Array.from(this.activeTransports).map(async (t) => {
      try {
        await t.close();
      } catch {
        // Best-effort close
      }
    });
    await Promise.all(closePromises);
    this.activeTransports.clear();

    const httpServer = this.httpServer;
    if (httpServer) {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
      this.httpServer = null;
    }
  }

  // ── Auth ─────────────────────────────────────────────────────────

  private checkAuth(req: IncomingMessage): boolean {
    const auth = req.headers.authorization;
    if (!auth) return false;
    const [scheme, token] = auth.split(" ", 2);
    return scheme === "Bearer" && token === this.config.authToken;
  }

  // ── SSE Transport ──────────────────────────────────────────────────

  private handleSseRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/sse") {
      const transport = new SSEServerTransport("/messages", res);
      this.activeTransports.add(transport);
      transport.onclose = () => this.activeTransports.delete(transport);

      const server = this.createMcpServer();
      server.connect(transport).catch(() => {
        this.activeTransports.delete(transport);
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/messages") {
      const sessionId = url.searchParams.get("sessionId");
      const transport = this.findSseTransport(sessionId);
      if (!transport) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No active SSE session" }));
        return;
      }
      transport.handlePostMessage(req, res);
      return;
    }

    res.writeHead(404);
    res.end();
  }

  private findSseTransport(sessionId: string | null): SSEServerTransport | undefined {
    if (!sessionId) return undefined;
    for (const t of this.activeTransports) {
      if (t instanceof SSEServerTransport && t.sessionId === sessionId) {
        return t;
      }
    }
    return undefined;
  }

  // ── Streamable HTTP Transport ──────────────────────────────────────

  private handleStreamableHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/mcp") {
      // For streamable-http, we create a transport per session via the initialize request
      // The transport handles session management internally
      if (req.method === "POST" || req.method === "GET" || req.method === "DELETE") {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        let transport = this.findStreamableTransport(sessionId);

        if (!transport) {
          const newTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
          });
          this.activeTransports.add(newTransport);
          newTransport.onclose = () => this.activeTransports.delete(newTransport);

          const server = this.createMcpServer();
          server.connect(newTransport).catch(() => {
            this.activeTransports.delete(newTransport);
          });
          transport = newTransport;
        }

        transport.handleRequest(req, res);
        return;
      }
    }

    res.writeHead(404);
    res.end();
  }

  private findStreamableTransport(sessionId: string | undefined): StreamableHTTPServerTransport | undefined {
    if (!sessionId) return undefined;
    for (const t of this.activeTransports) {
      if (t instanceof StreamableHTTPServerTransport && t.sessionId === sessionId) {
        return t;
      }
    }
    return undefined;
  }

  // ── MCP Server Factory ────────────────────────────────────────────

  private createMcpServer(): Server {
    const { agentName, approvalPatterns, approvalOptions } = this.config;
    const relay = this.relayServer;

    const capabilities: Record<string, Record<string, never>> = {
      tools: {},
      resources: {},
      prompts: {},
    };

    const server = new Server(
      { name: CLI_NAME_LOWERCASE, version: "0.1.0" },
      { capabilities },
    );

    // ── Tool Handlers ───────────────────────────────────────────────

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      // Wait for upstream MCP servers to connect and routing tables to be built
      if (this.config.readyGate) await this.config.readyGate;

      const tools = this.config.router.listTools();
      if (this.relayServer) {
        tools.push(CREDENTIAL_REQUEST_TOOL);
      }
      return { tools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Handle internal credential_request tool — no readyGate needed
      if (name === "credential_request" && this.relayServer) {
        const key = (args as Record<string, unknown> | undefined)?.key as string | undefined;
        const sessionToken = (args as Record<string, unknown> | undefined)?.session_token as string | undefined;

        if (!key || !sessionToken) {
          return {
            content: [{ type: "text" as const, text: "Missing required arguments: key, session_token" }],
            isError: true,
          };
        }

        // Validate session token
        const session = this.sessionStore.getByToken(sessionToken);
        if (!session) {
          return {
            content: [{ type: "text" as const, text: "Credential error: Invalid session token" }],
            isError: true,
          };
        }

        if (!this.relayServer.isConnected()) {
          return {
            content: [{ type: "text" as const, text: "Credential error: Relay not connected" }],
            isError: true,
          };
        }

        try {
          const relayMsg = createRelayMessage("credential_request", {
            key,
            agentId: session.agentId,
            role: session.role,
            sessionId: session.sessionId,
            declaredCredentials: this.config.declaredCredentials ?? [],
          });

          const response = await this.relayServer.request(
            relayMsg,
            this.config.credentialRequestTimeoutMs,
          ) as CredentialResponseMessage;

          if (response.error) {
            return {
              content: [{ type: "text" as const, text: `Credential error: ${response.error}` }],
              isError: true,
            };
          }

          return {
            content: [{ type: "text" as const, text: JSON.stringify({ key: response.key, value: response.value }) }],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text" as const, text: `Credential error: ${message}` }],
            isError: true,
          };
        }
      }

      // All other tools require upstreams to be ready
      if (this.config.readyGate) await this.config.readyGate;

      const { router, upstream } = this.config;
      const route = router.resolve(name);
      if (!route) {
        const ctx: HookContext = {
          agentName: agentName ?? "unknown",
          roleName: "unknown",
          appName: "unknown",
          toolName: name,
          prefixedToolName: name,
          arguments: args,
          sessionType: this.config.sessionType,
          acpClient: this.config.acpClient,
        };
        const pre = auditPreHook(ctx);
        auditPostHook(ctx, pre, `Unknown tool: ${name}`, "denied", relay);
        return {
          content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }

      const ctx: HookContext = {
        agentName: agentName ?? "unknown",
        roleName: "unknown",
        appName: route.appName,
        toolName: route.originalToolName,
        prefixedToolName: route.prefixedToolName,
        arguments: args,
        sessionType: this.config.sessionType,
        acpClient: this.config.acpClient,
      };
      const pre = auditPreHook(ctx);

      // Approval check — between audit pre-hook and upstream call
      if (relay && approvalPatterns?.length && matchesApprovalPattern(route.prefixedToolName, approvalPatterns)) {
        const approval = await requestApproval(ctx, relay, approvalOptions);
        if (approval === "denied") {
          const msg = `Tool call denied: ${route.prefixedToolName} requires approval`;
          auditPostHook(ctx, pre, msg, "denied", relay);
          return {
            content: [{ type: "text" as const, text: msg }],
            isError: true,
          };
        }
        if (approval === "timeout") {
          const ttl = approvalOptions?.ttlSeconds ?? 300;
          const msg = `Tool call timed out: ${route.prefixedToolName} approval expired after ${ttl} seconds`;
          auditPostHook(ctx, pre, msg, "timeout", relay);
          return {
            content: [{ type: "text" as const, text: msg }],
            isError: true,
          };
        }
        // approval === "approved" — fall through to upstream call
      }

      try {
        const result = await upstream.callTool(
          route.appName,
          route.originalToolName,
          args as Record<string, unknown> | undefined,
        );
        auditPostHook(ctx, pre, result, "success", relay);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        auditPostHook(ctx, pre, message, "error", relay);
        return {
          content: [{ type: "text" as const, text: message }],
          isError: true,
        };
      }
    });

    // ── Resource Handlers ──────────────────────────────────────────────

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      if (this.config.readyGate) await this.config.readyGate;
      const { resourceRouter } = this.config;
      return { resources: resourceRouter ? resourceRouter.listResources() : [] };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      if (this.config.readyGate) await this.config.readyGate;
      const { resourceRouter, upstream } = this.config;
      const { uri } = request.params;
      const route = resourceRouter?.resolveUri(uri);
      if (!route) {
        throw new Error(`Unknown resource: ${uri}`);
      }
      return upstream.readResource(route.appName, route.originalUri);
    });

    // ── Prompt Handlers ────────────────────────────────────────────────

    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      if (this.config.readyGate) await this.config.readyGate;
      const { promptRouter } = this.config;
      return { prompts: promptRouter ? promptRouter.listPrompts() : [] };
    });

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      if (this.config.readyGate) await this.config.readyGate;
      const { promptRouter, upstream } = this.config;
      const { name, arguments: args } = request.params;
      const route = promptRouter?.resolve(name);
      if (!route) {
        throw new Error(`Unknown prompt: ${name}`);
      }
      return upstream.getPrompt(route.appName, route.originalName, args);
    });

    return server;
  }
}
