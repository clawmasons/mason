import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  getAgentConfig,
  saveAgentConfig,
  loadConfigAgentEntry,
} from "../src/discovery.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agent-config-storage-test-"));
}

function writeMasonConfig(dir: string, content: unknown): void {
  const masonDir = path.join(dir, ".mason");
  fs.mkdirSync(masonDir, { recursive: true });
  fs.writeFileSync(path.join(masonDir, "config.json"), JSON.stringify(content, null, 2));
}

function readMasonConfigRaw(dir: string): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(dir, ".mason", "config.json"), "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("getAgentConfig", () => {
  it("returns config when present", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": {
            package: "@clawmasons/pi-coding-agent",
            config: {
              llm: {
                provider: "openrouter",
                model: "anthropic/claude-sonnet-4",
              },
            },
          },
        },
      });

      const config = getAgentConfig(tmpDir, "pi-coding-agent");
      expect(config).toEqual({
        llm: {
          provider: "openrouter",
          model: "anthropic/claude-sonnet-4",
        },
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty object when config file does not exist", () => {
    const tmpDir = makeTmpDir();
    try {
      const config = getAgentConfig(tmpDir, "pi-coding-agent");
      expect(config).toEqual({});
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty object when agent entry does not exist", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          claude: { package: "@clawmasons/claude-code-agent" },
        },
      });

      const config = getAgentConfig(tmpDir, "pi-coding-agent");
      expect(config).toEqual({});
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty object when agent has no config field", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": { package: "@clawmasons/pi-coding-agent" },
        },
      });

      const config = getAgentConfig(tmpDir, "pi-coding-agent");
      expect(config).toEqual({});
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty object when agents section is absent", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, { someOther: true });

      const config = getAgentConfig(tmpDir, "pi-coding-agent");
      expect(config).toEqual({});
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("filters out non-string values in config fields", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": {
            package: "@clawmasons/pi-coding-agent",
            config: {
              llm: {
                provider: "openrouter",
                badField: 123,
                nullField: null,
              },
            },
          },
        },
      });

      const config = getAgentConfig(tmpDir, "pi-coding-agent");
      expect(config).toEqual({
        llm: { provider: "openrouter" },
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("saveAgentConfig", () => {
  it("round-trips: save then read returns the same values", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": { package: "@clawmasons/pi-coding-agent" },
        },
      });

      const toSave = {
        llm: {
          provider: "openrouter",
          model: "anthropic/claude-sonnet-4",
        },
      };
      saveAgentConfig(tmpDir, "pi-coding-agent", toSave);

      const loaded = getAgentConfig(tmpDir, "pi-coding-agent");
      expect(loaded).toEqual(toSave);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("preserves existing agent entry fields (package, credentials)", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": {
            package: "@clawmasons/pi-coding-agent",
            credentials: ["OPENROUTER_API_KEY"],
          },
        },
      });

      saveAgentConfig(tmpDir, "pi-coding-agent", {
        llm: { provider: "openrouter" },
      });

      const raw = readMasonConfigRaw(tmpDir);
      const agentEntry = (raw.agents as Record<string, unknown>)["pi-coding-agent"] as Record<string, unknown>;
      expect(agentEntry.package).toBe("@clawmasons/pi-coding-agent");
      expect(agentEntry.credentials).toEqual(["OPENROUTER_API_KEY"]);
      expect(agentEntry.config).toEqual({ llm: { provider: "openrouter" } });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("preserves other agents' entries when saving", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          claude: { package: "@clawmasons/claude-code-agent" },
          "pi-coding-agent": { package: "@clawmasons/pi-coding-agent" },
        },
      });

      saveAgentConfig(tmpDir, "pi-coding-agent", {
        llm: { provider: "openrouter" },
      });

      const raw = readMasonConfigRaw(tmpDir);
      const agents = raw.agents as Record<string, unknown>;
      const claudeEntry = agents.claude as Record<string, unknown>;
      expect(claudeEntry.package).toBe("@clawmasons/claude-code-agent");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("deep-merges config: partial update preserves existing fields", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": {
            package: "@clawmasons/pi-coding-agent",
            config: {
              llm: { provider: "openrouter" },
            },
          },
        },
      });

      saveAgentConfig(tmpDir, "pi-coding-agent", {
        llm: { model: "anthropic/claude-sonnet-4" },
      });

      const config = getAgentConfig(tmpDir, "pi-coding-agent");
      expect(config).toEqual({
        llm: {
          provider: "openrouter",
          model: "anthropic/claude-sonnet-4",
        },
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("deep-merges config: adding a new group preserves existing groups", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "my-agent": {
            package: "@acme/my-agent",
            config: {
              llm: { provider: "openai" },
            },
          },
        },
      });

      saveAgentConfig(tmpDir, "my-agent", {
        database: { dialect: "postgres" },
      });

      const config = getAgentConfig(tmpDir, "my-agent");
      expect(config).toEqual({
        llm: { provider: "openai" },
        database: { dialect: "postgres" },
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates .mason directory and config.json when they do not exist", () => {
    const tmpDir = makeTmpDir();
    try {
      // No .mason directory
      saveAgentConfig(tmpDir, "pi-coding-agent", {
        llm: { provider: "openrouter" },
      });

      expect(fs.existsSync(path.join(tmpDir, ".mason", "config.json"))).toBe(true);
      const config = getAgentConfig(tmpDir, "pi-coding-agent");
      expect(config).toEqual({ llm: { provider: "openrouter" } });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates agent entry when agent is not in config", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          claude: { package: "@clawmasons/claude-code-agent" },
        },
      });

      saveAgentConfig(tmpDir, "pi-coding-agent", {
        llm: { provider: "openrouter" },
      });

      const raw = readMasonConfigRaw(tmpDir);
      const agents = raw.agents as Record<string, unknown>;
      const piEntry = agents["pi-coding-agent"] as Record<string, unknown>;
      expect(piEntry).toBeDefined();
      expect(piEntry.package).toBe("pi-coding-agent");
      expect(piEntry.config).toEqual({ llm: { provider: "openrouter" } });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("preserves non-agents fields in config.json (e.g., aliases)", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          claude: { package: "@clawmasons/claude-code-agent" },
        },
        aliases: {
          dev: { agent: "claude", role: "developer" },
        },
      });

      saveAgentConfig(tmpDir, "claude", {
        llm: { provider: "anthropic" },
      });

      const raw = readMasonConfigRaw(tmpDir);
      expect(raw.aliases).toEqual({
        dev: { agent: "claude", role: "developer" },
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("uses atomic write (no .tmp file left behind)", () => {
    const tmpDir = makeTmpDir();
    try {
      saveAgentConfig(tmpDir, "pi-coding-agent", {
        llm: { provider: "openrouter" },
      });

      const masonDir = path.join(tmpDir, ".mason");
      const files = fs.readdirSync(masonDir);
      expect(files).not.toContain("config.json.tmp");
      expect(files).toContain("config.json");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("loadConfigAgentEntry with config field", () => {
  it("returns config field after save via loadConfigAgentEntry", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": { package: "@clawmasons/pi-coding-agent" },
        },
      });

      saveAgentConfig(tmpDir, "pi-coding-agent", {
        llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
      });

      const entry = loadConfigAgentEntry(tmpDir, "pi-coding-agent");
      expect(entry).toBeDefined();
      expect(entry?.package).toBe("@clawmasons/pi-coding-agent");
      expect(entry?.config).toEqual({
        llm: {
          provider: "openrouter",
          model: "anthropic/claude-sonnet-4",
        },
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns undefined config when agent entry has no config field", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          claude: { package: "@clawmasons/claude-code-agent" },
        },
      });

      const entry = loadConfigAgentEntry(tmpDir, "claude");
      expect(entry).toBeDefined();
      expect(entry?.config).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
