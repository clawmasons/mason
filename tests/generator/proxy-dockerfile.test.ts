import { describe, expect, it } from "vitest";
import { generateProxyDockerfile } from "../../src/generator/proxy-dockerfile.js";

describe("generateProxyDockerfile", () => {
  it("returns a Dockerfile string", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).toBeTypeOf("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("uses Node.js 22-slim as base image", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).toContain("FROM node:22-slim AS builder");
    expect(result).toContain("FROM node:22-slim");
  });

  it("builds forge from source in builder stage", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).toContain("COPY forge/ ./forge/");
    expect(result).toContain("npm ci --ignore-scripts");
    expect(result).toContain("npm run build");
  });

  it("copies forge build artifacts to runtime stage", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).toContain("COPY --from=builder /build/forge/dist ./dist");
    expect(result).toContain("COPY --from=builder /build/forge/bin ./bin");
    expect(result).toContain("COPY --from=builder /build/forge/node_modules ./node_modules");
    expect(result).toContain("COPY --from=builder /build/forge/package.json ./");
  });

  it("copies workspace into the image", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).toContain("COPY workspace/ ./workspace/");
  });

  it("uses forge proxy as entrypoint with agent name", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).toContain('ENTRYPOINT ["node", "/app/bin/forge.js"]');
    expect(result).toContain('CMD ["proxy", "--agent", "@test/agent-test"]');
  });

  it("sets working directory to workspace", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).toContain("WORKDIR /app/workspace");
  });

  it("embeds the provided agent name in CMD", () => {
    const result = generateProxyDockerfile("@clawforge/agent-repo-ops");

    expect(result).toContain("@clawforge/agent-repo-ops");
  });

  it("does not reference mcp-proxy binary", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).not.toContain("mcp-proxy");
    expect(result).not.toContain("tbxark");
    expect(result).not.toContain("/main");
  });
});
