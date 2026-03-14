import { describe, expect, it } from "vitest";
import { generateCredentialServiceDockerfile } from "../../src/generator/credential-service-dockerfile.js";

describe("generateCredentialServiceDockerfile", () => {
  it("returns a non-empty Dockerfile string", () => {
    const result = generateCredentialServiceDockerfile();

    expect(result).toBeTypeOf("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("uses node:22-slim as base image", () => {
    const result = generateCredentialServiceDockerfile();

    expect(result).toContain("FROM node:22-slim");
  });

  it("sets USER mason", () => {
    const result = generateCredentialServiceDockerfile();

    expect(result).toContain("USER mason");
  });

  it("creates mason user with home directory", () => {
    const result = generateCredentialServiceDockerfile();

    expect(result).toContain("groupadd -r mason");
    expect(result).toContain("useradd -r -g mason -m mason");
  });

  it("installs build tools for native addons", () => {
    const result = generateCredentialServiceDockerfile();

    expect(result).toContain("python3 make g++");
  });

  it("rebuilds better-sqlite3 for container platform", () => {
    const result = generateCredentialServiceDockerfile();

    expect(result).toContain("npm rebuild better-sqlite3");
  });

  it("uses credential-service CLI as entrypoint", () => {
    const result = generateCredentialServiceDockerfile();

    expect(result).toContain('ENTRYPOINT ["node", "node_modules/.bin/credential-service"]');
  });

  it("copies node_modules from local build context", () => {
    const result = generateCredentialServiceDockerfile();

    expect(result).toContain("COPY node_modules/ ./node_modules/");
  });

  it("copies package.json from build context", () => {
    const result = generateCredentialServiceDockerfile();

    expect(result).toContain("COPY package.json ./");
  });

  it("does not reference any registry pull", () => {
    const result = generateCredentialServiceDockerfile();

    expect(result).not.toContain("docker.io");
    expect(result).not.toContain("ghcr.io");
    expect(result).not.toContain("registry");
  });

  it("includes header comment identifying the Dockerfile", () => {
    const result = generateCredentialServiceDockerfile();

    expect(result).toContain("Credential Service Dockerfile");
    expect(result).toContain("mason chapter build");
  });
});
