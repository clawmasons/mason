import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  createAgentRegistry,
  getAgent,
  getRegisteredAgentNames,
  loadConfigAgents,
  loadConfigAgentEntry,
  readConfigAgentNames,
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

describe("readConfigAgentNames", () => {
  function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "agent-sdk-names-test-"));
  }

  function writeMasonConfig(dir: string, content: unknown): void {
    const masonDir = path.join(dir, ".mason");
    fs.mkdirSync(masonDir, { recursive: true });
    fs.writeFileSync(path.join(masonDir, "config.json"), JSON.stringify(content));
  }

  it("returns agent key names from config", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          claude: { package: "@clawmasons/claude-code" },
          "pi-mono-agent": { package: "@clawmasons/pi-mono-agent" },
          mcp: { package: "@clawmasons/mcp-agent" },
        },
      });

      const names = readConfigAgentNames(tmpDir);
      expect(names).toContain("claude");
      expect(names).toContain("pi-mono-agent");
      expect(names).toContain("mcp");
      expect(names).toHaveLength(3);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty array when config file is absent", () => {
    const tmpDir = makeTmpDir();
    try {
      const names = readConfigAgentNames(tmpDir);
      expect(names).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty array when config has malformed JSON", () => {
    const tmpDir = makeTmpDir();
    try {
      fs.mkdirSync(path.join(tmpDir, ".mason"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, ".mason", "config.json"), "not-valid{{{");

      const names = readConfigAgentNames(tmpDir);
      expect(names).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty array when agents field is absent", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, { other: true });
      const names = readConfigAgentNames(tmpDir);
      expect(names).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("loadConfigAgentEntry", () => {
  function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "agent-sdk-entry-test-"));
  }

  function writeMasonConfig(dir: string, content: unknown): void {
    const masonDir = path.join(dir, ".mason");
    fs.mkdirSync(masonDir, { recursive: true });
    fs.writeFileSync(path.join(masonDir, "config.json"), JSON.stringify(content));
  }

  it("returns the entry for a named agent", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          claude: { package: "@clawmasons/claude-code", role: "writer", mode: "terminal" },
        },
      });

      const entry = loadConfigAgentEntry(tmpDir, "claude");
      expect(entry).toBeDefined();
      expect(entry?.package).toBe("@clawmasons/claude-code");
      expect(entry?.role).toBe("writer");
      expect(entry?.mode).toBe("terminal");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns undefined when agent is not in config", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, { agents: { claude: { package: "@clawmasons/claude-code" } } });

      const entry = loadConfigAgentEntry(tmpDir, "unknown");
      expect(entry).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns undefined when config file is absent", () => {
    const tmpDir = makeTmpDir();
    try {
      const entry = loadConfigAgentEntry(tmpDir, "claude");
      expect(entry).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("warns and defaults mode to terminal for invalid mode value", () => {
    const tmpDir = makeTmpDir();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      writeMasonConfig(tmpDir, {
        agents: { myagent: { package: "@foo/bar", mode: "interactive" } },
      });

      const entry = loadConfigAgentEntry(tmpDir, "myagent");
      expect(entry).toBeDefined();
      expect(entry?.mode).toBe("terminal");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("invalid mode"),
      );
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("parses home and role optional fields", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          claude: { package: "@clawmasons/claude-code", home: "~/my-config", role: "coder" },
        },
      });

      const entry = loadConfigAgentEntry(tmpDir, "claude");
      expect(entry?.home).toBe("~/my-config");
      expect(entry?.role).toBe("coder");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("parses dev-container-customizations when present", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          claude: {
            package: "@clawmasons/claude-code",
            "dev-container-customizations": {
              vscode: {
                extensions: ["my.extension"],
                settings: { "editor.fontSize": 14 },
              },
            },
          },
        },
      });

      const entry = loadConfigAgentEntry(tmpDir, "claude");
      expect(entry?.devContainerCustomizations).toBeDefined();
      expect(entry?.devContainerCustomizations?.vscode?.extensions).toEqual(["my.extension"]);
      expect(entry?.devContainerCustomizations?.vscode?.settings).toEqual({ "editor.fontSize": 14 });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("leaves devContainerCustomizations undefined when field is absent", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: { claude: { package: "@clawmasons/claude-code" } },
      });

      const entry = loadConfigAgentEntry(tmpDir, "claude");
      expect(entry?.devContainerCustomizations).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("parses credentials array correctly", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          claude: { package: "@clawmasons/claude-code", credentials: ["MY_KEY", "OTHER_KEY"] },
        },
      });

      const entry = loadConfigAgentEntry(tmpDir, "claude");
      expect(entry?.credentials).toEqual(["MY_KEY", "OTHER_KEY"]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("leaves credentials undefined when field is absent", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: { claude: { package: "@clawmasons/claude-code" } },
      });

      const entry = loadConfigAgentEntry(tmpDir, "claude");
      expect(entry?.credentials).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("warns and ignores credentials when value is not an array", () => {
    const tmpDir = makeTmpDir();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      writeMasonConfig(tmpDir, {
        agents: { myagent: { package: "@foo/bar", credentials: "MY_KEY" } },
      });

      const entry = loadConfigAgentEntry(tmpDir, "myagent");
      expect(entry?.credentials).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("invalid credentials"));
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("warns and skips non-string entries in credentials array", () => {
    const tmpDir = makeTmpDir();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      writeMasonConfig(tmpDir, {
        agents: { myagent: { package: "@foo/bar", credentials: ["VALID_KEY", 123, null] } },
      });

      const entry = loadConfigAgentEntry(tmpDir, "myagent");
      expect(entry?.credentials).toEqual(["VALID_KEY"]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("non-string entry"));
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
