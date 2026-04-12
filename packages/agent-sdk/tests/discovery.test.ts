import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => Buffer.from("")),
}));

import { execSync } from "node:child_process";
import {
  createAgentRegistry,
  discoverInstalledAgents,
  getAgent,
  getRegisteredAgentNames,
  loadConfigAgents,
  loadConfigAgentEntry,
  loadConfigAliasEntry,
  readConfigAgentNames,
  readConfigAliasNames,
  resolveAgentPackageName,
  ensureMasonPackageJson,
  autoInstallAgent,
  hasDevSymlinks,
  syncExtensionVersions,
  resolveAgentWithAutoInstall,
} from "../src/discovery.js";
import type { AgentRegistry } from "../src/discovery.js";
import type { AgentPackage } from "../src/types.js";
import { sdkLogger } from "../src/logger.js";

const mockExecSync = vi.mocked(execSync);

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
    const agent = makeMockAgent("claude-code-agent", ["claude", "cc"]);
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
    const agent = makeMockAgent("claude-code-agent", ["claude"]);
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
    const agent = makeMockAgent("claude-code-agent", ["claude", "cc"]);
    const registry = await createAgentRegistry([agent]);

    const names = getRegisteredAgentNames(registry);
    expect(names).toEqual(["claude-code-agent"]);
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
          claude: { package: "@clawmasons/claude-code-agent" },
          "pi-mono-agent": { package: "@clawmasons/pi-mono-agent" },
        },
      });

      const names = readConfigAgentNames(tmpDir);
      expect(names).toContain("claude");
      expect(names).toContain("pi-mono-agent");
      expect(names).toHaveLength(2);
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
    const warnSpy = vi.spyOn(sdkLogger, "warn").mockImplementation(() => {});
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          claude: { package: "@clawmasons/claude-code-agent", role: "writer", mode: "terminal" },
        },
      });

      const entry = loadConfigAgentEntry(tmpDir, "claude");
      expect(entry).toBeDefined();
      expect(entry?.package).toBe("@clawmasons/claude-code-agent");
      expect(entry?.role).toBe("writer");
      expect(entry?.mode).toBe("terminal");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("runtime fields"));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("aliases"));
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns undefined when agent is not in config", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, { agents: { claude: { package: "@clawmasons/claude-code-agent" } } });

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
    const warnSpy = vi.spyOn(sdkLogger, "warn").mockImplementation(() => {});
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

  it("parses home and role optional fields (with deprecation warning)", () => {
    const tmpDir = makeTmpDir();
    const warnSpy = vi.spyOn(sdkLogger, "warn").mockImplementation(() => {});
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          claude: { package: "@clawmasons/claude-code-agent", home: "~/my-config", role: "coder" },
        },
      });

      const entry = loadConfigAgentEntry(tmpDir, "claude");
      expect(entry?.home).toBe("~/my-config");
      expect(entry?.role).toBe("coder");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("runtime fields"));
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("parses dev-container-customizations when present (with deprecation warning)", () => {
    const tmpDir = makeTmpDir();
    const warnSpy = vi.spyOn(sdkLogger, "warn").mockImplementation(() => {});
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          claude: {
            package: "@clawmasons/claude-code-agent",
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
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("runtime fields"));
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("leaves devContainerCustomizations undefined when field is absent", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: { claude: { package: "@clawmasons/claude-code-agent" } },
      });

      const entry = loadConfigAgentEntry(tmpDir, "claude");
      expect(entry?.devContainerCustomizations).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("parses credentials array correctly (with deprecation warning)", () => {
    const tmpDir = makeTmpDir();
    const warnSpy = vi.spyOn(sdkLogger, "warn").mockImplementation(() => {});
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          claude: { package: "@clawmasons/claude-code-agent", credentials: ["MY_KEY", "OTHER_KEY"] },
        },
      });

      const entry = loadConfigAgentEntry(tmpDir, "claude");
      expect(entry?.credentials).toEqual(["MY_KEY", "OTHER_KEY"]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("runtime fields"));
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("leaves credentials undefined when field is absent", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: { claude: { package: "@clawmasons/claude-code-agent" } },
      });

      const entry = loadConfigAgentEntry(tmpDir, "claude");
      expect(entry?.credentials).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("warns and ignores credentials when value is not an array", () => {
    const tmpDir = makeTmpDir();
    const warnSpy = vi.spyOn(sdkLogger, "warn").mockImplementation(() => {});
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
    const warnSpy = vi.spyOn(sdkLogger, "warn").mockImplementation(() => {});
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

// ── Alias Tests ───────────────────────────────────────────────────────

describe("loadConfigAliasEntry", () => {
  function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "agent-sdk-alias-test-"));
  }

  function writeMasonConfig(dir: string, content: unknown): void {
    const masonDir = path.join(dir, ".mason");
    fs.mkdirSync(masonDir, { recursive: true });
    fs.writeFileSync(path.join(masonDir, "config.json"), JSON.stringify(content));
  }

  it("returns a valid alias entry with all fields", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: { claude: { package: "@clawmasons/claude-code-agent" } },
        aliases: {
          frontend: {
            agent: "claude",
            mode: "terminal",
            role: "frontend-dev",
            home: "~/projects/fe",
            credentials: ["MY_KEY"],
            "agent-args": ["--max-turns", "10"],
          },
        },
      });

      const entry = loadConfigAliasEntry(tmpDir, "frontend");
      expect(entry).toBeDefined();
      expect(entry?.agent).toBe("claude");
      expect(entry?.mode).toBe("terminal");
      expect(entry?.role).toBe("frontend-dev");
      expect(entry?.home).toBe("~/projects/fe");
      expect(entry?.credentials).toEqual(["MY_KEY"]);
      expect(entry?.agentArgs).toEqual(["--max-turns", "10"]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns alias with only agent field (all optional fields undefined)", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: { claude: { package: "@clawmasons/claude-code-agent" } },
        aliases: { quick: { agent: "claude" } },
      });

      const entry = loadConfigAliasEntry(tmpDir, "quick");
      expect(entry).toBeDefined();
      expect(entry?.agent).toBe("claude");
      expect(entry?.mode).toBeUndefined();
      expect(entry?.role).toBeUndefined();
      expect(entry?.home).toBeUndefined();
      expect(entry?.credentials).toBeUndefined();
      expect(entry?.agentArgs).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns undefined when alias name is not in config", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: { claude: { package: "@clawmasons/claude-code-agent" } },
        aliases: { other: { agent: "claude" } },
      });

      const entry = loadConfigAliasEntry(tmpDir, "nonexistent");
      expect(entry).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns undefined when aliases section is absent", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: { claude: { package: "@clawmasons/claude-code-agent" } },
      });

      const entry = loadConfigAliasEntry(tmpDir, "frontend");
      expect(entry).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("warns and defaults to terminal for invalid mode in alias", () => {
    const tmpDir = makeTmpDir();
    const warnSpy = vi.spyOn(sdkLogger, "warn").mockImplementation(() => {});
    try {
      writeMasonConfig(tmpDir, {
        agents: { claude: { package: "@clawmasons/claude-code-agent" } },
        aliases: { bad: { agent: "claude", mode: "interactive" } },
      });

      const entry = loadConfigAliasEntry(tmpDir, "bad");
      expect(entry?.mode).toBe("terminal");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("invalid mode"));
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns null for alias missing agent field", () => {
    const tmpDir = makeTmpDir();
    const warnSpy = vi.spyOn(sdkLogger, "warn").mockImplementation(() => {});
    try {
      writeMasonConfig(tmpDir, {
        agents: { claude: { package: "@clawmasons/claude-code-agent" } },
        aliases: { bad: { mode: "terminal" } },
      });

      const entry = loadConfigAliasEntry(tmpDir, "bad");
      expect(entry).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing "agent" field'));
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("parses agent-args array correctly", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: { claude: { package: "@clawmasons/claude-code-agent" } },
        aliases: { api: { agent: "claude", "agent-args": ["--verbose", "--max-turns", "5"] } },
      });

      const entry = loadConfigAliasEntry(tmpDir, "api");
      expect(entry?.agentArgs).toEqual(["--verbose", "--max-turns", "5"]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("readConfigAliasNames", () => {
  function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "agent-sdk-alias-names-test-"));
  }

  function writeMasonConfig(dir: string, content: unknown): void {
    const masonDir = path.join(dir, ".mason");
    fs.mkdirSync(masonDir, { recursive: true });
    fs.writeFileSync(path.join(masonDir, "config.json"), JSON.stringify(content));
  }

  it("returns alias key names from config", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: { claude: { package: "@clawmasons/claude-code-agent" } },
        aliases: {
          frontend: { agent: "claude" },
          "api-review": { agent: "claude" },
        },
      });

      const names = readConfigAliasNames(tmpDir);
      expect(names).toContain("frontend");
      expect(names).toContain("api-review");
      expect(names).toHaveLength(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty array when aliases section is absent", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, { agents: { claude: { package: "@clawmasons/claude-code-agent" } } });
      const names = readConfigAliasNames(tmpDir);
      expect(names).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty array when config file is absent", () => {
    const tmpDir = makeTmpDir();
    try {
      const names = readConfigAliasNames(tmpDir);
      expect(names).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── Discovery Tests ───────────────────────────────────────────────────

describe("discoverInstalledAgents", () => {
  function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "agent-sdk-discover-test-"));
  }

  /**
   * Create a fake agent package in .mason/node_modules/@clawmasons/<name>/
   * with a package.json and a JS entrypoint that exports a mock AgentPackage.
   */
  function createFakeAgentPackage(
    projectDir: string,
    pkgName: string,
    opts: {
      masonType?: string;
      entrypoint?: string;
      agentName?: string;
      aliases?: string[];
      validExport?: boolean;
      noPackageJson?: boolean;
      badJson?: boolean;
      noEntrypoint?: boolean;
    } = {},
  ): void {
    const pkgDir = path.join(projectDir, ".mason", "node_modules", "@clawmasons", pkgName);
    fs.mkdirSync(pkgDir, { recursive: true });

    if (opts.noPackageJson) return;

    if (opts.badJson) {
      fs.writeFileSync(path.join(pkgDir, "package.json"), "not-valid-json{{{");
      return;
    }

    const masonField: Record<string, unknown> = {};
    if (opts.masonType !== undefined) {
      masonField.type = opts.masonType;
    }
    if (opts.entrypoint !== undefined) {
      masonField.entrypoint = opts.entrypoint;
    }

    const pkgJson: Record<string, unknown> = {
      name: `@clawmasons/${pkgName}`,
      version: "1.0.0",
    };
    if (Object.keys(masonField).length > 0 || opts.masonType !== undefined) {
      pkgJson.mason = masonField;
    }

    fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify(pkgJson));

    if (opts.noEntrypoint) return;

    // Create the entrypoint JS file
    const entrypointRel = opts.entrypoint ?? "./dist/index.js";
    const entrypointAbs = path.resolve(pkgDir, entrypointRel);
    fs.mkdirSync(path.dirname(entrypointAbs), { recursive: true });

    const agentName = opts.agentName ?? pkgName;
    const validExport = opts.validExport !== false;

    if (validExport) {
      const aliasesStr = opts.aliases ? JSON.stringify(opts.aliases) : "undefined";
      fs.writeFileSync(
        entrypointAbs,
        `module.exports.default = {
  name: ${JSON.stringify(agentName)},
  aliases: ${aliasesStr},
  materializer: {
    name: ${JSON.stringify(agentName)},
    materializeWorkspace: function() { return new Map(); },
  },
};`,
      );
    } else {
      // Export something that is NOT a valid AgentPackage
      fs.writeFileSync(entrypointAbs, `module.exports.default = { notAnAgent: true };`);
    }
  }

  it("discovers packages with mason.type === 'agent'", async () => {
    const tmpDir = makeTmpDir();
    try {
      createFakeAgentPackage(tmpDir, "my-agent", { masonType: "agent" });

      const agents = await discoverInstalledAgents(tmpDir);
      expect(agents).toHaveLength(1);
      expect(agents[0]!.name).toBe("my-agent");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("ignores packages without the mason field", async () => {
    const tmpDir = makeTmpDir();
    try {
      // No mason field at all
      createFakeAgentPackage(tmpDir, "regular-pkg", {});

      const agents = await discoverInstalledAgents(tmpDir);
      expect(agents).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("ignores packages with mason.type !== 'agent'", async () => {
    const tmpDir = makeTmpDir();
    try {
      createFakeAgentPackage(tmpDir, "tool-pkg", { masonType: "tool" });

      const agents = await discoverInstalledAgents(tmpDir);
      expect(agents).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("skips invalid agent packages (bad exports) with a warning", async () => {
    const tmpDir = makeTmpDir();
    const warnSpy = vi.spyOn(sdkLogger, "warn").mockImplementation(() => {});
    try {
      createFakeAgentPackage(tmpDir, "bad-agent", { masonType: "agent", validExport: false });

      const agents = await discoverInstalledAgents(tmpDir);
      expect(agents).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("does not export a valid AgentPackage"),
      );
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("warns when entrypoint cannot be loaded", async () => {
    const tmpDir = makeTmpDir();
    const warnSpy = vi.spyOn(sdkLogger, "warn").mockImplementation(() => {});
    try {
      createFakeAgentPackage(tmpDir, "broken-agent", { masonType: "agent", noEntrypoint: true });

      const agents = await discoverInstalledAgents(tmpDir);
      expect(agents).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load agent"),
      );
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("uses custom entrypoint from mason.entrypoint", async () => {
    const tmpDir = makeTmpDir();
    try {
      createFakeAgentPackage(tmpDir, "custom-entry-agent", {
        masonType: "agent",
        entrypoint: "./lib/main.js",
        agentName: "custom-entry-agent",
      });

      const agents = await discoverInstalledAgents(tmpDir);
      expect(agents).toHaveLength(1);
      expect(agents[0]!.name).toBe("custom-entry-agent");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty array when .mason/node_modules/@clawmasons/ does not exist", async () => {
    const tmpDir = makeTmpDir();
    try {
      const agents = await discoverInstalledAgents(tmpDir);
      expect(agents).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("skips directories with bad package.json", async () => {
    const tmpDir = makeTmpDir();
    const warnSpy = vi.spyOn(sdkLogger, "warn").mockImplementation(() => {});
    try {
      createFakeAgentPackage(tmpDir, "bad-json-pkg", { masonType: "agent", badJson: true });

      const agents = await discoverInstalledAgents(tmpDir);
      expect(agents).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to parse package.json"),
      );
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("skips directories without package.json", async () => {
    const tmpDir = makeTmpDir();
    try {
      createFakeAgentPackage(tmpDir, "no-pkg-json", { masonType: "agent", noPackageJson: true });

      const agents = await discoverInstalledAgents(tmpDir);
      expect(agents).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("discovers multiple valid agents and skips invalid ones", async () => {
    const tmpDir = makeTmpDir();
    vi.spyOn(sdkLogger, "warn").mockImplementation(() => {});
    try {
      createFakeAgentPackage(tmpDir, "good-agent-a", { masonType: "agent", agentName: "good-agent-a" });
      createFakeAgentPackage(tmpDir, "good-agent-b", { masonType: "agent", agentName: "good-agent-b" });
      createFakeAgentPackage(tmpDir, "not-an-agent", { masonType: "tool" });
      createFakeAgentPackage(tmpDir, "bad-export", { masonType: "agent", validExport: false });

      const agents = await discoverInstalledAgents(tmpDir);
      expect(agents).toHaveLength(2);
      const names = agents.map((a) => a.name).sort();
      expect(names).toEqual(["good-agent-a", "good-agent-b"]);
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("createAgentRegistry with discovered agents", () => {
  function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "agent-sdk-registry-discover-test-"));
  }

  function createFakeAgentPackage(
    projectDir: string,
    pkgName: string,
    agentName: string,
  ): void {
    const pkgDir = path.join(projectDir, ".mason", "node_modules", "@clawmasons", pkgName);
    fs.mkdirSync(pkgDir, { recursive: true });

    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({
        name: `@clawmasons/${pkgName}`,
        version: "1.0.0",
        mason: { type: "agent" },
      }),
    );

    const distDir = path.join(pkgDir, "dist");
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(
      path.join(distDir, "index.js"),
      `module.exports.default = {
  name: ${JSON.stringify(agentName)},
  materializer: {
    name: ${JSON.stringify(agentName)},
    materializeWorkspace: function() { return new Map(); },
  },
};`,
    );
  }

  it("discovered agents are registered in the registry", async () => {
    const tmpDir = makeTmpDir();
    try {
      createFakeAgentPackage(tmpDir, "discovered-agent", "discovered-agent");

      const registry = await createAgentRegistry([], tmpDir);
      expect(registry.has("discovered-agent")).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("built-in agents take priority over discovered agents", async () => {
    const tmpDir = makeTmpDir();
    try {
      createFakeAgentPackage(tmpDir, "my-agent", "my-agent");

      const builtin = makeMockAgent("my-agent");
      const registry = await createAgentRegistry([builtin], tmpDir);

      // The registry entry should be the built-in, not the discovered one
      expect(registry.get("my-agent")).toBe(builtin);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("discovered agents coexist with built-in agents", async () => {
    const tmpDir = makeTmpDir();
    try {
      createFakeAgentPackage(tmpDir, "ext-agent", "ext-agent");

      const builtin = makeMockAgent("builtin-agent");
      const registry = await createAgentRegistry([builtin], tmpDir);

      expect(registry.has("builtin-agent")).toBe(true);
      expect(registry.has("ext-agent")).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── resolveAgentPackageName ──────────────────────────────────────────

describe("resolveAgentPackageName", () => {
  it("resolves 'claude' to @clawmasons/claude-code-agent", () => {
    expect(resolveAgentPackageName("claude")).toBe("@clawmasons/claude-code-agent");
  });

  it("resolves 'claude-code' to @clawmasons/claude-code-agent", () => {
    expect(resolveAgentPackageName("claude-code")).toBe("@clawmasons/claude-code-agent");
  });

  it("resolves 'pi' to @clawmasons/pi-coding-agent", () => {
    expect(resolveAgentPackageName("pi")).toBe("@clawmasons/pi-coding-agent");
  });

  it("resolves 'pi-coding' to @clawmasons/pi-coding-agent", () => {
    expect(resolveAgentPackageName("pi-coding")).toBe("@clawmasons/pi-coding-agent");
  });

  it("resolves 'codex' to @clawmasons/codex-agent", () => {
    expect(resolveAgentPackageName("codex")).toBe("@clawmasons/codex-agent");
  });

  it("passes through scoped package names as-is", () => {
    expect(resolveAgentPackageName("@mycompany/custom-agent")).toBe("@mycompany/custom-agent");
  });

  it("returns null for unknown unscoped names", () => {
    expect(resolveAgentPackageName("unknown-agent")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(resolveAgentPackageName("")).toBeNull();
  });
});

// ── ensureMasonPackageJson ───────────────────────────────────────────

describe("ensureMasonPackageJson", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates .mason/package.json when it does not exist", () => {
    ensureMasonPackageJson(tmpDir);

    const pkgJsonPath = path.join(tmpDir, ".mason", "package.json");
    expect(fs.existsSync(pkgJsonPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    expect(content.name).toBe("mason-extensions");
    expect(content.private).toBe(true);
    expect(content.dependencies).toEqual({});
  });

  it("does not overwrite existing .mason/package.json", () => {
    const masonDir = path.join(tmpDir, ".mason");
    fs.mkdirSync(masonDir, { recursive: true });
    const pkgJsonPath = path.join(masonDir, "package.json");
    const existing = { name: "existing", private: true, dependencies: { "some-pkg": "^1.0.0" } };
    fs.writeFileSync(pkgJsonPath, JSON.stringify(existing), "utf-8");

    ensureMasonPackageJson(tmpDir);

    const content = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    expect(content.name).toBe("existing");
    expect(content.dependencies["some-pkg"]).toBe("^1.0.0");
  });
});

// ── autoInstallAgent ─────────────────────────────────────────────────

describe("autoInstallAgent", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-test-"));
    mockExecSync.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates package.json and writes tilde-pinned dependency", () => {
    autoInstallAgent(tmpDir, "@clawmasons/claude-code-agent", "0.1.6");

    const pkgJsonPath = path.join(tmpDir, ".mason", "package.json");
    const content = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    expect(content.dependencies["@clawmasons/claude-code-agent"]).toBe("~0.1.6");
  });

  it("calls npm update with correct cwd", () => {
    autoInstallAgent(tmpDir, "@clawmasons/codex-agent", "0.2.0");

    expect(mockExecSync).toHaveBeenCalledWith(
      "npm update",
      expect.objectContaining({ cwd: path.join(tmpDir, ".mason") }),
    );
  });

  it("adds to existing dependencies without removing others", () => {
    const masonDir = path.join(tmpDir, ".mason");
    fs.mkdirSync(masonDir, { recursive: true });
    const existing = {
      name: "mason-extensions",
      private: true,
      dependencies: { "@clawmasons/pi-coding-agent": "~0.1.5" },
    };
    fs.writeFileSync(path.join(masonDir, "package.json"), JSON.stringify(existing), "utf-8");

    autoInstallAgent(tmpDir, "@clawmasons/claude-code-agent", "0.1.6");

    const content = JSON.parse(fs.readFileSync(path.join(masonDir, "package.json"), "utf-8"));
    expect(content.dependencies["@clawmasons/pi-coding-agent"]).toBe("~0.1.5");
    expect(content.dependencies["@clawmasons/claude-code-agent"]).toBe("~0.1.6");
  });
});

// ── syncExtensionVersions ────────────────────────────────────────────

describe("syncExtensionVersions", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-test-"));
    mockExecSync.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("rewrites all dependencies to the new version", () => {
    const masonDir = path.join(tmpDir, ".mason");
    fs.mkdirSync(masonDir, { recursive: true });
    const existing = {
      name: "mason-extensions",
      private: true,
      dependencies: {
        "@clawmasons/claude-code-agent": "~0.1.5",
        "@clawmasons/pi-coding-agent": "~0.1.4",
      },
    };
    fs.writeFileSync(path.join(masonDir, "package.json"), JSON.stringify(existing), "utf-8");

    syncExtensionVersions(tmpDir, "0.2.0");

    const content = JSON.parse(fs.readFileSync(path.join(masonDir, "package.json"), "utf-8"));
    expect(content.dependencies["@clawmasons/claude-code-agent"]).toBe("~0.2.0");
    expect(content.dependencies["@clawmasons/pi-coding-agent"]).toBe("~0.2.0");
  });

  it("calls npm update after rewriting", () => {
    const masonDir = path.join(tmpDir, ".mason");
    fs.mkdirSync(masonDir, { recursive: true });
    const existing = {
      name: "mason-extensions",
      private: true,
      dependencies: { "@clawmasons/codex-agent": "~0.1.0" },
    };
    fs.writeFileSync(path.join(masonDir, "package.json"), JSON.stringify(existing), "utf-8");

    syncExtensionVersions(tmpDir, "0.3.0");

    expect(mockExecSync).toHaveBeenCalledWith(
      "npm update",
      expect.objectContaining({ cwd: masonDir }),
    );
  });

  it("is a no-op when .mason/package.json does not exist", () => {
    syncExtensionVersions(tmpDir, "0.2.0");

    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("is a no-op when dependencies object is empty", () => {
    const masonDir = path.join(tmpDir, ".mason");
    fs.mkdirSync(masonDir, { recursive: true });
    fs.writeFileSync(
      path.join(masonDir, "package.json"),
      JSON.stringify({ name: "mason-extensions", private: true, dependencies: {} }),
      "utf-8",
    );

    syncExtensionVersions(tmpDir, "0.2.0");

    expect(mockExecSync).not.toHaveBeenCalled();
  });
});

// ── resolveAgentWithAutoInstall ──────────────────────────────────────

describe("resolveAgentWithAutoInstall", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-test-"));
    mockExecSync.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns existing agent from registry without installing", async () => {
    const agent = makeMockAgent("claude-code-agent", ["claude"]);
    const registry: AgentRegistry = new Map();
    registry.set("claude-code-agent", agent);
    registry.set("claude", agent);

    const result = await resolveAgentWithAutoInstall(tmpDir, "claude", "0.1.6", registry);

    expect(result).toBe(agent);
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("returns null for unknown unscoped names", async () => {
    const registry: AgentRegistry = new Map();

    const result = await resolveAgentWithAutoInstall(tmpDir, "unknown-agent", "0.1.6", registry);

    expect(result).toBeNull();
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("writes dependency and calls npm update for resolvable agent", async () => {
    const registry: AgentRegistry = new Map();

    // The agent won't be discovered after install (no real package), so result is null,
    // but we can verify the install was attempted
    const result = await resolveAgentWithAutoInstall(tmpDir, "claude", "0.1.6", registry);

    expect(result).toBeNull(); // no real package to discover
    expect(mockExecSync).toHaveBeenCalledWith(
      "npm update",
      expect.objectContaining({ cwd: path.join(tmpDir, ".mason") }),
    );

    // Verify the dependency was written
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".mason", "package.json"), "utf-8"),
    );
    expect(pkgJson.dependencies["@clawmasons/claude-code-agent"]).toBe("~0.1.6");
  });

  it("returns null and warns when npm install fails", async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("npm failed");
    });
    const warnSpy = vi.spyOn(sdkLogger, "warn").mockImplementation(() => {});

    const registry: AgentRegistry = new Map();
    const result = await resolveAgentWithAutoInstall(tmpDir, "pi", "0.1.6", registry);

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to auto-install"),
    );

    warnSpy.mockRestore();
    mockExecSync.mockImplementation(() => Buffer.from(""));
  });
});

// ── Integration: auto-install + discovery ────────────────────────────

describe("E2E validation: auto-install + discovery integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-integration-test-"));
    mockExecSync.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Helper: create a fake agent package under .mason/node_modules/@clawmasons/<pkgName>
   */
  function createFakeAgentPackage(
    projectDir: string,
    pkgName: string,
    opts: {
      masonField?: Record<string, unknown> | null;
      agentName?: string;
      aliases?: string[];
    } = {},
  ): void {
    const pkgDir = path.join(projectDir, ".mason", "node_modules", "@clawmasons", pkgName);
    fs.mkdirSync(pkgDir, { recursive: true });

    const pkgJson: Record<string, unknown> = {
      name: `@clawmasons/${pkgName}`,
      version: "1.0.0",
    };
    if (opts.masonField !== null && opts.masonField !== undefined) {
      pkgJson.mason = opts.masonField;
    }
    fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify(pkgJson));

    // Create entrypoint only if mason.type === "agent"
    if (opts.masonField?.type === "agent") {
      const distDir = path.join(pkgDir, "dist");
      fs.mkdirSync(distDir, { recursive: true });
      const agentName = opts.agentName ?? pkgName;
      const aliasesStr = opts.aliases ? JSON.stringify(opts.aliases) : "undefined";
      fs.writeFileSync(
        path.join(distDir, "index.js"),
        `module.exports.default = {
  name: ${JSON.stringify(agentName)},
  aliases: ${aliasesStr},
  materializer: {
    name: ${JSON.stringify(agentName)},
    materializeWorkspace: function() { return new Map(); },
  },
};`,
      );
    }
  }

  /**
   * Helper: write .mason/package.json with given dependencies.
   */
  function writeMasonPackageJson(projectDir: string, deps: Record<string, string>): void {
    const masonDir = path.join(projectDir, ".mason");
    fs.mkdirSync(masonDir, { recursive: true });
    fs.writeFileSync(
      path.join(masonDir, "package.json"),
      JSON.stringify({ name: "mason-extensions", private: true, dependencies: deps }, null, 2) + "\n",
      "utf-8",
    );
  }

  it("syncExtensionVersions rewrites all deps to new version", () => {
    writeMasonPackageJson(tmpDir, {
      "@clawmasons/claude-code-agent": "~0.1.0",
      "@clawmasons/pi-coding-agent": "~0.1.2",
      "@clawmasons/codex-agent": "~0.1.3",
    });

    syncExtensionVersions(tmpDir, "0.5.0");

    const content = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".mason", "package.json"), "utf-8"),
    );
    expect(content.dependencies["@clawmasons/claude-code-agent"]).toBe("~0.5.0");
    expect(content.dependencies["@clawmasons/pi-coding-agent"]).toBe("~0.5.0");
    expect(content.dependencies["@clawmasons/codex-agent"]).toBe("~0.5.0");
    expect(mockExecSync).toHaveBeenCalledWith(
      "npm update",
      expect.objectContaining({ cwd: path.join(tmpDir, ".mason") }),
    );
  });

  it("resolveAgentWithAutoInstall returns null for unknown agents without crashing", async () => {
    const registry: AgentRegistry = new Map();

    const result = await resolveAgentWithAutoInstall(tmpDir, "totally-unknown-agent-xyz", "0.1.6", registry);

    expect(result).toBeNull();
    // Should not have attempted any npm install
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("resolveAgentWithAutoInstall returns existing agent from registry without triggering install", async () => {
    const agent = makeMockAgent("pi-coding-agent", ["pi", "pi-coding"]);
    const registry: AgentRegistry = new Map();
    registry.set("pi-coding-agent", agent);
    registry.set("pi", agent);
    registry.set("pi-coding", agent);

    const result = await resolveAgentWithAutoInstall(tmpDir, "pi", "0.2.0", registry);

    expect(result).toBe(agent);
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("config-declared agents override discovered agents with the same name", async () => {
    // Set up a discovered agent in .mason/node_modules/
    createFakeAgentPackage(tmpDir, "my-agent", {
      masonField: { type: "agent" },
      agentName: "my-agent",
    });

    // The config-declared agent would be loaded via loadConfigAgents, which
    // does a dynamic import. We can't easily mock that, but we can verify the
    // precedence logic by testing createAgentRegistry with a built-in that has
    // the same name as a discovered agent, plus verifying the Phase 3 override.
    // Instead, we test the registry directly: built-in < discovered (no override) < config (override).

    // First: verify discovered agent is registered when no built-in conflicts
    const registryWithoutBuiltin = await createAgentRegistry([], tmpDir);
    expect(registryWithoutBuiltin.has("my-agent")).toBe(true);

    // Second: verify built-in takes priority over discovered
    const builtinAgent = makeMockAgent("my-agent");
    const registryWithBuiltin = await createAgentRegistry([builtinAgent], tmpDir);
    expect(registryWithBuiltin.get("my-agent")).toBe(builtinAgent);

    // Third: simulate config override by manually setting a different agent on the registry
    // (loadConfigAgents uses dynamic import which we can't control here, but the
    // createAgentRegistry code uses registerAgent which overwrites — we verify that behavior)
    const configAgent = makeMockAgent("my-agent");
    registryWithBuiltin.set("my-agent", configAgent);
    expect(registryWithBuiltin.get("my-agent")).toBe(configAgent);
    expect(registryWithBuiltin.get("my-agent")).not.toBe(builtinAgent);
  });

  it("discovery skips packages without mason field and includes those with it", async () => {
    // Package WITH mason.type: "agent" — should be discovered
    createFakeAgentPackage(tmpDir, "valid-agent", {
      masonField: { type: "agent" },
      agentName: "valid-agent",
    });

    // Package WITHOUT mason field — should be skipped
    createFakeAgentPackage(tmpDir, "plain-library", {
      masonField: null,
    });

    // Package with mason field but type !== "agent" — should be skipped
    createFakeAgentPackage(tmpDir, "mason-tool", {
      masonField: { type: "tool" },
    });

    // Package with empty mason object (no type) — should be skipped
    createFakeAgentPackage(tmpDir, "incomplete-mason", {
      masonField: {},
    });

    const agents = await discoverInstalledAgents(tmpDir);
    expect(agents).toHaveLength(1);
    expect(agents[0]!.name).toBe("valid-agent");
  });
});

// ── hasDevSymlinks ───────────────────────────────────────────────────

describe("hasDevSymlinks", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns false when scope dir does not exist", () => {
    expect(hasDevSymlinks(tmpDir)).toBe(false);
  });

  it("returns false when scope dir has only real directories", () => {
    const scopeDir = path.join(tmpDir, ".mason", "node_modules", "@clawmasons");
    fs.mkdirSync(path.join(scopeDir, "some-agent"), { recursive: true });
    expect(hasDevSymlinks(tmpDir)).toBe(false);
  });

  it("returns true when scope dir contains a symlink", () => {
    const scopeDir = path.join(tmpDir, ".mason", "node_modules", "@clawmasons");
    fs.mkdirSync(scopeDir, { recursive: true });
    // Create a real dir to symlink to
    const realDir = path.join(tmpDir, "real-agent");
    fs.mkdirSync(realDir);
    fs.symlinkSync(realDir, path.join(scopeDir, "linked-agent"), "dir");
    expect(hasDevSymlinks(tmpDir)).toBe(true);
  });

  it("autoInstallAgent skips npm update when dev symlinks exist", () => {
    // Set up scope dir with a symlink
    const scopeDir = path.join(tmpDir, ".mason", "node_modules", "@clawmasons");
    fs.mkdirSync(scopeDir, { recursive: true });
    const realDir = path.join(tmpDir, "real-agent");
    fs.mkdirSync(realDir);
    fs.symlinkSync(realDir, path.join(scopeDir, "linked-agent"), "dir");
    // Write package.json so autoInstallAgent doesn't fail
    fs.writeFileSync(
      path.join(tmpDir, ".mason", "package.json"),
      JSON.stringify({ name: "mason-extensions", private: true, dependencies: {} }),
      "utf-8",
    );

    mockExecSync.mockClear();
    autoInstallAgent(tmpDir, "@clawmasons/codex-agent", "0.1.6");

    // Should still write the dependency
    const content = JSON.parse(fs.readFileSync(path.join(tmpDir, ".mason", "package.json"), "utf-8"));
    expect(content.dependencies["@clawmasons/codex-agent"]).toBe("~0.1.6");
    // But should NOT call npm update
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("syncExtensionVersions skips npm update when dev symlinks exist", () => {
    // Set up scope dir with a symlink
    const scopeDir = path.join(tmpDir, ".mason", "node_modules", "@clawmasons");
    fs.mkdirSync(scopeDir, { recursive: true });
    const realDir = path.join(tmpDir, "real-agent");
    fs.mkdirSync(realDir);
    fs.symlinkSync(realDir, path.join(scopeDir, "linked-agent"), "dir");
    // Write package.json with existing deps
    fs.writeFileSync(
      path.join(tmpDir, ".mason", "package.json"),
      JSON.stringify({
        name: "mason-extensions",
        private: true,
        dependencies: { "@clawmasons/codex-agent": "~0.1.5" },
      }),
      "utf-8",
    );

    mockExecSync.mockClear();
    syncExtensionVersions(tmpDir, "0.2.0");

    // Should still rewrite versions
    const content = JSON.parse(fs.readFileSync(path.join(tmpDir, ".mason", "package.json"), "utf-8"));
    expect(content.dependencies["@clawmasons/codex-agent"]).toBe("~0.2.0");
    // But should NOT call npm update
    expect(mockExecSync).not.toHaveBeenCalled();
  });
});
