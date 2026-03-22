/**
 * Integration tests: Config Storage Round-Trip
 *
 * Verifies that saveAgentConfig and getAgentConfig work together correctly,
 * including deep merges, field preservation, and consistency with
 * loadConfigAgentEntry.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  getAgentConfig,
  saveAgentConfig,
  loadConfigAgentEntry,
} from "../src/discovery.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "config-roundtrip-test-"));
}

function writeMasonConfig(dir: string, content: unknown): void {
  const masonDir = path.join(dir, ".mason");
  fs.mkdirSync(masonDir, { recursive: true });
  fs.writeFileSync(path.join(masonDir, "config.json"), JSON.stringify(content, null, 2));
}

function readRawConfig(dir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, ".mason", "config.json"), "utf-8"));
}

// ── Tests ────────────────────────────────────────────────────────────

describe("config storage round-trip", () => {
  it("save then getAgentConfig returns same values", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": { package: "@clawmasons/pi-coding-agent" },
        },
      });

      const toSave = {
        llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
      };
      saveAgentConfig(tmpDir, "pi-coding-agent", toSave);

      const loaded = getAgentConfig(tmpDir, "pi-coding-agent");
      expect(loaded).toEqual(toSave);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("save then loadConfigAgentEntry includes config field", () => {
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
        llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("multiple saves with deep merge preserves all groups", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "my-agent": { package: "@acme/my-agent" },
        },
      });

      // First save: LLM group
      saveAgentConfig(tmpDir, "my-agent", {
        llm: { provider: "openai", model: "gpt-4o" },
      });

      // Second save: Database group
      saveAgentConfig(tmpDir, "my-agent", {
        database: { dialect: "postgres", host: "localhost" },
      });

      // Both groups should be present
      const config = getAgentConfig(tmpDir, "my-agent");
      expect(config).toEqual({
        llm: { provider: "openai", model: "gpt-4o" },
        database: { dialect: "postgres", host: "localhost" },
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("partial group update preserves existing fields within group", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "my-agent": {
            package: "@acme/my-agent",
            config: { llm: { provider: "openai" } },
          },
        },
      });

      // Add model to existing llm group
      saveAgentConfig(tmpDir, "my-agent", {
        llm: { model: "gpt-4o" },
      });

      const config = getAgentConfig(tmpDir, "my-agent");
      expect(config).toEqual({
        llm: { provider: "openai", model: "gpt-4o" },
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("save preserves non-config fields (package, credentials)", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": {
            package: "@clawmasons/pi-coding-agent",
            credentials: ["OPENROUTER_API_KEY"],
            mode: "terminal",
          },
        },
        aliases: {
          dev: { agent: "pi-coding-agent", role: "developer" },
        },
      });

      saveAgentConfig(tmpDir, "pi-coding-agent", {
        llm: { provider: "openrouter" },
      });

      const raw = readRawConfig(tmpDir);

      // Agent entry fields preserved
      const agentEntry = (raw.agents as Record<string, Record<string, unknown>>)["pi-coding-agent"];
      expect(agentEntry.package).toBe("@clawmasons/pi-coding-agent");
      expect(agentEntry.credentials).toEqual(["OPENROUTER_API_KEY"]);
      expect(agentEntry.config).toEqual({ llm: { provider: "openrouter" } });

      // Other top-level fields preserved
      expect(raw.aliases).toEqual({
        dev: { agent: "pi-coding-agent", role: "developer" },
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("config deletion and re-save works cleanly", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": {
            package: "@clawmasons/pi-coding-agent",
            config: { llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" } },
          },
        },
      });

      // Verify initial config
      const config1 = getAgentConfig(tmpDir, "pi-coding-agent");
      expect(config1.llm).toBeDefined();

      // Delete config by overwriting the entry without config
      const raw = readRawConfig(tmpDir);
      const agents = raw.agents as Record<string, Record<string, unknown>>;
      delete agents["pi-coding-agent"].config;
      fs.writeFileSync(
        path.join(tmpDir, ".mason", "config.json"),
        JSON.stringify(raw, null, 2),
      );

      // Config should be empty now
      const config2 = getAgentConfig(tmpDir, "pi-coding-agent");
      expect(config2).toEqual({});

      // Re-save with new values
      saveAgentConfig(tmpDir, "pi-coding-agent", {
        llm: { provider: "together", model: "some-model" },
      });

      const config3 = getAgentConfig(tmpDir, "pi-coding-agent");
      expect(config3).toEqual({
        llm: { provider: "together", model: "some-model" },
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("getAgentConfig and loadConfigAgentEntry are consistent after save", () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": { package: "@clawmasons/pi-coding-agent" },
        },
      });

      const config = {
        llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
      };
      saveAgentConfig(tmpDir, "pi-coding-agent", config);

      // Both access methods should return the same config
      const viaGetConfig = getAgentConfig(tmpDir, "pi-coding-agent");
      const viaEntry = loadConfigAgentEntry(tmpDir, "pi-coding-agent");

      expect(viaGetConfig).toEqual(config);
      expect(viaEntry?.config).toEqual(config);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
