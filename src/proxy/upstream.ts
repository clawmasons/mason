import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  Tool,
  Resource,
  Prompt,
  CallToolResult,
  ReadResourceResult,
  GetPromptResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { ResolvedApp } from "../resolver/types.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface UpstreamAppConfig {
  name: string;
  app: ResolvedApp;
  env?: Record<string, string>;
}

// ── UpstreamManager ────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;

export class UpstreamManager {
  private configs: UpstreamAppConfig[];
  private clients = new Map<string, Client>();

  constructor(apps: UpstreamAppConfig[]) {
    this.configs = apps;
  }

  async initialize(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<void> {
    const connectPromises = this.configs.map(async (config) => {
      const transport = createTransport(config);
      const client = new Client(
        { name: "forge-upstream", version: "0.1.0" },
      );
      await client.connect(transport);
      this.clients.set(config.name, client);
    });

    let timer: ReturnType<typeof setTimeout>;
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
    } finally {
      clearTimeout(timer!);
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
    return client.callTool({ name: toolName, arguments: args });
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
  config: UpstreamAppConfig,
): StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport {
  const { app, env } = config;

  switch (app.transport) {
    case "stdio": {
      if (!app.command) {
        throw new Error(
          `App "${config.name}" has transport "stdio" but no command specified`,
        );
      }
      return new StdioClientTransport({
        command: app.command,
        args: app.args,
        env: env ? { ...process.env, ...env } as Record<string, string> : undefined,
      });
    }
    case "sse": {
      if (!app.url) {
        throw new Error(
          `App "${config.name}" has transport "sse" but no url specified`,
        );
      }
      return new SSEClientTransport(new URL(app.url));
    }
    case "streamable-http": {
      if (!app.url) {
        throw new Error(
          `App "${config.name}" has transport "streamable-http" but no url specified`,
        );
      }
      return new StreamableHTTPClientTransport(new URL(app.url));
    }
    default:
      throw new Error(
        `App "${config.name}" has unsupported transport: ${app.transport as string}`,
      );
  }
}
