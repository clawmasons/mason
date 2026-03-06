import { describe, expect, it } from "vitest";
import { generateProxyDockerfile } from "../../src/generator/proxy-dockerfile.js";

describe("generateProxyDockerfile", () => {
  it("returns a Dockerfile string", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).toBeTypeOf("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("uses Node.js 22-slim as sole base image (single-stage)", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).toContain("FROM node:22-slim");
    expect(result).not.toContain("AS builder");
    expect(result).not.toContain("COPY --from=builder");
  });

  it("does not build forge from source", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).not.toContain("npm run build");
    expect(result).not.toContain("AS builder");
  });

  it("installs build tools for native addons", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).toContain("python3 make g++");
  });

  it("installs production dependencies with native compilation", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).toContain("npm install --omit=dev");
    expect(result).not.toContain("--ignore-scripts");
  });

  it("copies pre-built forge dist and bin into the image", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).toContain("COPY forge/dist ./dist");
    expect(result).toContain("COPY forge/bin ./bin");
  });

  it("copies package manifests for dependency install", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).toContain("COPY forge/package.json ./");
    expect(result).not.toContain("package-lock.json");
  });

  it("copies workspace into the image", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).toContain("COPY workspace/ ./workspace/");
  });

  it("uses forge proxy as entrypoint with agent name", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).toContain('ENTRYPOINT ["node", "/app/forge/bin/forge.js"]');
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

  it("runs as non-root node user", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).toContain("USER node");
  });

  it("creates and owns /home/node/data directory", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).toContain("mkdir -p /home/node/data");
    expect(result).toContain("chown -R node:node /app /home/node/data /logs");
  });

  it("does not reference mcp-proxy binary", () => {
    const result = generateProxyDockerfile("@test/agent-test");

    expect(result).not.toContain("mcp-proxy");
    expect(result).not.toContain("tbxark");
    expect(result).not.toContain("/main");
  });
});
