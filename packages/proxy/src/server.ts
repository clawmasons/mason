import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
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
import type Database from "better-sqlite3";
import type { ToolRouter, ResourceRouter, PromptRouter } from "./router.js";
import type { UpstreamManager } from "./upstream.js";
import { auditPreHook, auditPostHook } from "./hooks/audit.js";
import type { HookContext } from "./hooks/audit.js";
import { matchesApprovalPattern, requestApproval } from "./hooks/approval.js";
import type { ApprovalOptions } from "./hooks/approval.js";
import { SessionStore, handleConnectAgent, type RiskLevel } from "./handlers/connect-agent.js";
import { CredentialRelay } from "./handlers/credential-relay.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface ChapterProxyServerConfig {
  port?: number;
  transport: "sse" | "streamable-http";
  router: ToolRouter;
  upstream: UpstreamManager;
  db?: Database.Database;
  agentName?: string;
  authToken?: string;
  approvalPatterns?: string[];
  approvalOptions?: ApprovalOptions;
  resourceRouter?: ResourceRouter;
  promptRouter?: PromptRouter;
  /** Token for authenticating credential service WebSocket connections. */
  credentialProxyToken?: string;
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

// ── ChapterProxyServer ──────────────────────────────────────────────────

const DEFAULT_PORT = 9090;

export class ChapterProxyServer {
  private config: Required<Pick<ChapterProxyServerConfig, "port" | "transport">> & ChapterProxyServerConfig;
  private httpServer: HttpServer | null = null;
  private activeTransports: Set<SSEServerTransport | StreamableHTTPServerTransport> = new Set();
  private sessionStore: SessionStore;
  private credentialRelay: CredentialRelay | null = null;
  constructor(config: ChapterProxyServerConfig) {
    this.config = { ...config, port: config.port ?? DEFAULT_PORT };
    this.sessionStore = new SessionStore(config.riskLevel);

    if (config.credentialProxyToken) {
      this.credentialRelay = new CredentialRelay({
        credentialProxyToken: config.credentialProxyToken,
        requestTimeoutMs: config.credentialRequestTimeoutMs,
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

  /** Expose the credential relay for external access. */
  getCredentialRelay(): CredentialRelay | null {
    return this.credentialRelay;
  }

  async start(): Promise<void> {
    const { port, transport } = this.config;

    this.httpServer = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      // Health endpoint — no auth required
      if (req.method === "GET" && url.pathname === "/health") {
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

    // WebSocket upgrade handler for credential service
    if (this.credentialRelay) {
      const relay = this.credentialRelay;
      this.httpServer.on("upgrade", (req, socket, head) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        if (url.pathname === "/ws/credentials") {
          relay.handleUpgrade(req, socket, head as Buffer);
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
    // Close credential relay first
    if (this.credentialRelay) {
      this.credentialRelay.close();
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
    // Destructure only stable (non-late-bound) fields.
    // router, upstream, resourceRouter, promptRouter are accessed via
    // this.config.* so they pick up values set by setRouting().
    const { db, agentName, approvalPatterns, approvalOptions } = this.config;

    const capabilities: Record<string, Record<string, never>> = {
      tools: {},
      resources: {},
      prompts: {},
    };

    const server = new Server(
      { name: "chapter", version: "0.1.0" },
      { capabilities },
    );

    // ── Tool Handlers ───────────────────────────────────────────────

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      // Wait for upstream MCP servers to connect and routing tables to be built
      if (this.config.readyGate) await this.config.readyGate;

      const tools = this.config.router.listTools();
      if (this.credentialRelay) {
        tools.push(CREDENTIAL_REQUEST_TOOL);
      }
      return { tools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Handle internal credential_request tool — no readyGate needed
      if (name === "credential_request" && this.credentialRelay) {
        const key = (args as Record<string, unknown> | undefined)?.key as string | undefined;
        const sessionToken = (args as Record<string, unknown> | undefined)?.session_token as string | undefined;

        if (!key || !sessionToken) {
          return {
            content: [{ type: "text" as const, text: "Missing required arguments: key, session_token" }],
            isError: true,
          };
        }

        const result = await this.credentialRelay.handleCredentialRequest(
          this.sessionStore,
          key,
          sessionToken,
          this.config.declaredCredentials,
        );

        if (result.error) {
          return {
            content: [{ type: "text" as const, text: `Credential error: ${result.error}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ key: result.key, value: result.value }) }],
        };
      }

      // All other tools require upstreams to be ready
      if (this.config.readyGate) await this.config.readyGate;

      const { router, upstream } = this.config;
      const route = router.resolve(name);
      if (!route) {
        if (db) {
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
          auditPostHook(ctx, pre, `Unknown tool: ${name}`, "denied", db);
        }
        return {
          content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }

      const ctx: HookContext | undefined = db
        ? {
            agentName: agentName ?? "unknown",
            roleName: "unknown",
            appName: route.appName,
            toolName: route.originalToolName,
            prefixedToolName: route.prefixedToolName,
            arguments: args,
            sessionType: this.config.sessionType,
            acpClient: this.config.acpClient,
          }
        : undefined;
      const pre = ctx ? auditPreHook(ctx) : undefined;

      // Approval check — between audit pre-hook and upstream call
      if (db && ctx && approvalPatterns?.length && matchesApprovalPattern(route.prefixedToolName, approvalPatterns)) {
        const approval = await requestApproval(ctx, db, approvalOptions);
        if (approval === "denied") {
          const msg = `Tool call denied: ${route.prefixedToolName} requires approval`;
          if (pre) {
            auditPostHook(ctx, pre, msg, "denied", db);
          }
          return {
            content: [{ type: "text" as const, text: msg }],
            isError: true,
          };
        }
        if (approval === "timeout") {
          const ttl = approvalOptions?.ttlSeconds ?? 300;
          const msg = `Tool call timed out: ${route.prefixedToolName} approval expired after ${ttl} seconds`;
          if (pre) {
            auditPostHook(ctx, pre, msg, "timeout", db);
          }
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
        if (db && ctx && pre) {
          auditPostHook(ctx, pre, result, "success", db);
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (db && ctx && pre) {
          auditPostHook(ctx, pre, message, "error", db);
        }
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
