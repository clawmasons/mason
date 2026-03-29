import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  CallToolResultSchema,
  type Tool,
  type Resource,
  type Prompt,
  type CallToolResult,
  type ReadResourceResult,
  type GetPromptResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { ResolvedMcpServer } from "@clawmasons/shared";

// ── Types ──────────────────────────────────────────────────────────────

export interface UpstreamMcpConfig {
  /** Full package name, e.g., "@clawmasons/app-github". Used as lookup key. */
  name: string;
  server: ResolvedMcpServer;
  env?: Record<string, string>;
  /** Working directory for stdio transport child processes. */
  cwd?: string;
}

// ── UpstreamManager ────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;

export class UpstreamManager {
  private configs: UpstreamMcpConfig[];
  private clients = new Map<string, Client>();
  private initialized = false;

  constructor(servers: UpstreamMcpConfig[]) {
    const names = servers.map((a) => a.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) {
      throw new Error(
        `Duplicate server names: ${[...new Set(dupes)].join(", ")}`,
      );
    }
    this.configs = servers;
  }

  async initialize(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<void> {
    if (this.initialized) {
      throw new Error(
        "UpstreamManager is already initialized. Call shutdown() first.",
      );
    }

    const connectPromises = this.configs.map(async (config) => {
      const transport = createTransport(config);

      // Capture stderr for stdio transports to include in error messages
      let stderrOutput = "";
      if (transport instanceof StdioClientTransport && transport.stderr) {
        transport.stderr.on("data", (chunk: Buffer) => {
          stderrOutput += chunk.toString();
          const lines = chunk.toString().trimEnd();
          if (lines) {
            console.error(`[upstream:${config.name}] ${lines}`);
          }
        });
      }

      try {
        const client = new Client(
          { name: "mason-upstream", version: "0.1.0" },
        );
        await client.connect(transport);
        this.clients.set(config.name, client);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const detail =
          config.server.transport === "stdio"
            ? ` (command: ${config.server.command} ${(config.server.args ?? []).join(" ")})`
            : config.server.url
              ? ` (url: ${config.server.url})`
              : "";
        const stderrInfo = stderrOutput.trim()
          ? `\nChild process stderr:\n${stderrOutput.trim()}`
          : "";
        throw new Error(
          `Failed to connect to upstream "${config.name}"${detail}: ${message}${stderrInfo}`,
        );
      }
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const connected = new Set(this.clients.keys());
        const failed = this.configs
          .map((c) => c.name)
          .filter((name) => !connected.has(name));
        reject(
          new Error(
            `Upstream initialization timed out after ${timeoutMs}ms. Failed: ${failed.join(", ")}`,
          ),
        );
      }, timeoutMs);
    });

    try {
      await Promise.race([Promise.all(connectPromises), timeout]);
      this.initialized = true;
    } catch (err) {
      await this.shutdown();
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async getTools(appName: string): Promise<Tool[]> {
    const client = this.requireClient(appName);
    const tools: Tool[] = [];
    let cursor: string | undefined;
    do {
      const result = await client.listTools({ cursor });
      tools.push(...result.tools);
      cursor = result.nextCursor;
    } while (cursor);
    return tools;
  }

  async getResources(appName: string): Promise<Resource[]> {
    const client = this.requireClient(appName);
    const resources: Resource[] = [];
    let cursor: string | undefined;
    do {
      const result = await client.listResources({ cursor });
      resources.push(...result.resources);
      cursor = result.nextCursor;
    } while (cursor);
    return resources;
  }

  async getPrompts(appName: string): Promise<Prompt[]> {
    const client = this.requireClient(appName);
    const prompts: Prompt[] = [];
    let cursor: string | undefined;
    do {
      const result = await client.listPrompts({ cursor });
      prompts.push(...result.prompts);
      cursor = result.nextCursor;
    } while (cursor);
    return prompts;
  }

  async callTool(
    appName: string,
    toolName: string,
    args?: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const client = this.requireClient(appName);
    return client.callTool({ name: toolName, arguments: args }, CallToolResultSchema) as Promise<CallToolResult>;
  }

  async readResource(
    appName: string,
    uri: string,
  ): Promise<ReadResourceResult> {
    const client = this.requireClient(appName);
    return client.readResource({ uri });
  }

  async getPrompt(
    appName: string,
    name: string,
    args?: Record<string, string>,
  ): Promise<GetPromptResult> {
    const client = this.requireClient(appName);
    return client.getPrompt({ name, arguments: args });
  }

  async shutdown(): Promise<void> {
    const closePromises = Array.from(this.clients.entries()).map(
      async ([name, client]) => {
        try {
          await client.close();
        } catch {
          // Swallow shutdown errors — best-effort close
          console.error(`Error closing upstream client "${name}"`);
        }
      },
    );
    await Promise.all(closePromises);
    this.clients.clear();
    this.initialized = false;
  }

  private requireClient(appName: string): Client {
    const client = this.clients.get(appName);
    if (!client) {
      throw new Error(`Unknown app: ${appName}`);
    }
    return client;
  }
}

// ── Transport Factory ──────────────────────────────────────────────────

export function createTransport(
  config: UpstreamMcpConfig,
): StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport {
  const { server, env } = config;

  switch (server.transport) {
    case "stdio": {
      if (!server.command) {
        throw new Error(
          `Server "${config.name}" has transport "stdio" but no command specified`,
        );
      }
      return new StdioClientTransport({
        command: server.command,
        args: server.args,
        env: env
          ? {
              ...Object.fromEntries(
                Object.entries(process.env).filter(
                  (e): e is [string, string] => e[1] != null,
                ),
              ),
              ...env,
            }
          : undefined,
        cwd: config.cwd,
        stderr: "pipe",
      });
    }
    case "sse": {
      if (!server.url) {
        throw new Error(
          `Server "${config.name}" has transport "sse" but no url specified`,
        );
      }
      return new SSEClientTransport(new URL(server.url));
    }
    case "streamable-http": {
      if (!server.url) {
        throw new Error(
          `Server "${config.name}" has transport "streamable-http" but no url specified`,
        );
      }
      return new StreamableHTTPClientTransport(new URL(server.url));
    }
    default:
      throw new Error(
        `Server "${config.name}" has unsupported transport: ${server.transport as string}`,
      );
  }
}
