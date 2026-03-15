import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  createAgentRegistry,
  getAgent,
  getRegisteredAgentNames,
  loadConfigAgents,
} from "../src/discovery.js";
import type { AgentPackage } from "../src/types.js";

function makeMockAgent(name: string, aliases?: string[]): AgentPackage {
  return {
    name,
    aliases,
    materializer: {
      name,
      materializeWorkspace: () => new Map(),
    },
  };
}

describe("createAgentRegistry", () => {
  it("registers built-in agents by name", async () => {
    const agent = makeMockAgent("my-agent");
    const registry = await createAgentRegistry([agent]);

    expect(registry.has("my-agent")).toBe(true);
    expect(registry.get("my-agent")).toBe(agent);
  });

  it("registers built-in agents by each alias", async () => {
    const agent = makeMockAgent("claude-code", ["claude", "cc"]);
    const registry = await createAgentRegistry([agent]);

    expect(registry.get("claude")).toBe(agent);
    expect(registry.get("cc")).toBe(agent);
  });

  it("registers multiple built-in agents", async () => {
    const a = makeMockAgent("agent-a", ["aa"]);
    const b = makeMockAgent("agent-b");
    const registry = await createAgentRegistry([a, b]);

    expect(registry.get("agent-a")).toBe(a);
    expect(registry.get("aa")).toBe(a);
    expect(registry.get("agent-b")).toBe(b);
  });

  it("returns empty registry when no built-ins provided", async () => {
    const registry = await createAgentRegistry([]);
    expect(registry.size).toBe(0);
  });

  it("does not load config agents when projectDir is omitted", async () => {
    const agent = makeMockAgent("my-agent");
    const registry = await createAgentRegistry([agent]);
    // Only the one built-in registered by name (no aliases)
    expect(registry.size).toBe(1);
  });
});

describe("getAgent", () => {
  it("retrieves agent by name", async () => {
    const agent = makeMockAgent("test-agent");
    const registry = await createAgentRegistry([agent]);

    expect(getAgent(registry, "test-agent")).toBe(agent);
  });

  it("retrieves agent by alias", async () => {
    const agent = makeMockAgent("claude-code", ["claude"]);
    const registry = await createAgentRegistry([agent]);

    expect(getAgent(registry, "claude")).toBe(agent);
  });

  it("returns undefined for unknown name", async () => {
    const registry = await createAgentRegistry([makeMockAgent("agent-a")]);

    expect(getAgent(registry, "unknown")).toBeUndefined();
  });

  it("returns undefined from empty registry", async () => {
    const registry = await createAgentRegistry([]);
    expect(getAgent(registry, "anything")).toBeUndefined();
  });
});

describe("getRegisteredAgentNames", () => {
  it("returns canonical names only (no aliases)", async () => {
    const agent = makeMockAgent("claude-code", ["claude", "cc"]);
    const registry = await createAgentRegistry([agent]);

    const names = getRegisteredAgentNames(registry);
    expect(names).toEqual(["claude-code"]);
  });

  it("deduplicates when multiple aliases point to same agent", async () => {
    const a = makeMockAgent("agent-a", ["aa", "aaa"]);
    const b = makeMockAgent("agent-b");
    const registry = await createAgentRegistry([a, b]);

    const names = getRegisteredAgentNames(registry);
    expect(names).toHaveLength(2);
    expect(names).toContain("agent-a");
    expect(names).toContain("agent-b");
  });

  it("returns empty array for empty registry", async () => {
    const registry = await createAgentRegistry([]);
    expect(getRegisteredAgentNames(registry)).toEqual([]);
  });
});

describe("loadConfigAgents", () => {
  function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "agent-sdk-test-"));
  }

  function writeMasonConfig(dir: string, content: unknown): void {
    const masonDir = path.join(dir, ".mason");
    fs.mkdirSync(masonDir, { recursive: true });
    fs.writeFileSync(path.join(masonDir, "config.json"), JSON.stringify(content));
  }

  it("returns empty array when .mason/config.json does not exist", async () => {
    const tmpDir = makeTmpDir();
    try {
      const result = await loadConfigAgents(tmpDir);
      expect(result).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty array when config.json has invalid JSON", async () => {
    const tmpDir = makeTmpDir();
    try {
      fs.mkdirSync(path.join(tmpDir, ".mason"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, ".mason", "config.json"), "not-valid-json{{{");

      const result = await loadConfigAgents(tmpDir);
      expect(result).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty array when config has no agents field", async () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, { someOtherField: true });

      const result = await loadConfigAgents(tmpDir);
      expect(result).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty array when agents field is empty object", async () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, { agents: {} });

      const result = await loadConfigAgents(tmpDir);
      expect(result).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("skips agent entries missing the package field", async () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "bad-agent": { notPackage: "something" },
        },
      });

      const result = await loadConfigAgents(tmpDir);
      expect(result).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("skips agent packages that cannot be imported", async () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "missing-agent": { package: "@nonexistent/package-xyz-12345" },
        },
      });

      const result = await loadConfigAgents(tmpDir);
      expect(result).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
