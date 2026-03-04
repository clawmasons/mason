import { describe, expect, it } from "vitest";
import { generateProxyDockerfile } from "../../src/generator/proxy-dockerfile.js";
import type { ResolvedAgent, ResolvedApp, ResolvedRole } from "../../src/resolver/types.js";

function makeStdioApp(): ResolvedApp {
  return {
    name: "@test/app-filesystem",
    version: "1.0.0",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
    tools: ["read_file", "write_file"],
    capabilities: ["tools"],
  };
}

function makeRemoteApp(): ResolvedApp {
  return {
    name: "@test/app-remote",
    version: "1.0.0",
    transport: "sse",
    url: "http://remote-server:8080/sse",
    tools: ["search"],
    capabilities: ["tools"],
  };
}

function makeAgent(apps: ResolvedApp[], proxyImage?: string): ResolvedAgent {
  const role: ResolvedRole = {
    name: "@test/role-worker",
    version: "1.0.0",
    permissions: {},
    tasks: [],
    apps,
    skills: [],
  };

  return {
    name: "@test/agent-test",
    version: "1.0.0",
    runtimes: ["claude-code"],
    roles: [role],
    proxy: proxyImage ? { image: proxyImage, port: 9090, type: "sse" } : undefined,
  };
}

describe("generateProxyDockerfile", () => {
  it("returns Dockerfile string when agent has stdio apps", () => {
    const agent = makeAgent([makeStdioApp()]);
    const result = generateProxyDockerfile(agent);

    expect(result).not.toBeNull();
    expect(result).toContain("FROM node:22-slim");
    expect(result).toContain("COPY --from=proxy /main /usr/local/bin/mcp-proxy");
  });

  it("returns null when all apps are remote", () => {
    const agent = makeAgent([makeRemoteApp()]);
    const result = generateProxyDockerfile(agent);

    expect(result).toBeNull();
  });

  it("returns Dockerfile when mix of stdio and remote apps", () => {
    const agent = makeAgent([makeStdioApp(), makeRemoteApp()]);
    const result = generateProxyDockerfile(agent);

    expect(result).not.toBeNull();
  });

  it("contains multi-stage build with correct proxy image", () => {
    const agent = makeAgent([makeStdioApp()]);
    const result = generateProxyDockerfile(agent)!;

    expect(result).toContain("FROM ghcr.io/tbxark/mcp-proxy:latest AS proxy");
    expect(result).toContain("FROM node:22-slim");
    expect(result).toContain('ENTRYPOINT ["mcp-proxy"]');
    expect(result).toContain('CMD ["--config", "/config/config.json"]');
  });

  it("respects custom agent.proxy.image", () => {
    const agent = makeAgent([makeStdioApp()], "custom/proxy:v2");
    const result = generateProxyDockerfile(agent)!;

    expect(result).toContain("FROM custom/proxy:v2 AS proxy");
    expect(result).not.toContain("ghcr.io/tbxark/mcp-proxy");
  });

  it("uses default image when agent has no proxy field", () => {
    const agent = makeAgent([makeStdioApp()]);
    delete agent.proxy;
    const result = generateProxyDockerfile(agent)!;

    expect(result).toContain("FROM ghcr.io/tbxark/mcp-proxy:latest AS proxy");
  });
});
