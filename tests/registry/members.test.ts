import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  readAgentsRegistry,
  writeAgentsRegistry,
  addAgent,
  updateAgentStatus,
  getAgent,
} from "../../src/registry/members.js";
import type { AgentEntry, AgentsRegistry } from "../../src/registry/types.js";

describe("members registry", () => {
  let tmpDir: string;
  let chapterDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-registry-test-"));
    chapterDir = path.join(tmpDir, ".chapter");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const agentEntry: AgentEntry = {
    package: "@test/member-ops",
        status: "enabled",
    installedAt: "2026-03-06T10:30:00.000Z",
  };

  const humanEntry: AgentEntry = {
    package: "@test/member-alice",
        status: "enabled",
    installedAt: "2026-03-06T11:00:00.000Z",
  };

  describe("readAgentsRegistry", () => {
    it("returns empty registry when file does not exist", () => {
      const registry = readAgentsRegistry(chapterDir);
      expect(registry).toEqual({ agents: {} });
    });

    it("returns empty registry when directory does not exist", () => {
      const nonExistent = path.join(tmpDir, "does-not-exist");
      const registry = readAgentsRegistry(nonExistent);
      expect(registry).toEqual({ agents: {} });
    });

    it("parses valid registry file", () => {
      const expected: AgentsRegistry = {
        agents: {
          ops: agentEntry,
          alice: humanEntry,
        },
      };
      fs.mkdirSync(chapterDir, { recursive: true });
      fs.writeFileSync(
        path.join(chapterDir, "agents.json"),
        JSON.stringify(expected, null, 2),
      );

      const registry = readAgentsRegistry(chapterDir);
      expect(registry).toEqual(expected);
    });

    it("throws on malformed JSON", () => {
      fs.mkdirSync(chapterDir, { recursive: true });
      fs.writeFileSync(path.join(chapterDir, "agents.json"), "not json");

      expect(() => readAgentsRegistry(chapterDir)).toThrow();
    });
  });

  describe("writeAgentsRegistry", () => {
    it("creates file with proper JSON format", () => {
      const registry: AgentsRegistry = { agents: { ops: agentEntry } };
      writeAgentsRegistry(chapterDir, registry);

      const filePath = path.join(chapterDir, "agents.json");
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed).toEqual(registry);

      // Verify pretty-printed with trailing newline
      expect(content).toBe(JSON.stringify(registry, null, 2) + "\n");
    });

    it("creates directory if it does not exist", () => {
      const deepDir = path.join(tmpDir, "deep", "nested", ".chapter");
      const registry: AgentsRegistry = { agents: { ops: agentEntry } };
      writeAgentsRegistry(deepDir, registry);

      expect(fs.existsSync(path.join(deepDir, "agents.json"))).toBe(true);
    });

    it("overwrites existing file", () => {
      const registry1: AgentsRegistry = { agents: { ops: agentEntry } };
      writeAgentsRegistry(chapterDir, registry1);

      const registry2: AgentsRegistry = { agents: { alice: humanEntry } };
      writeAgentsRegistry(chapterDir, registry2);

      const content = fs.readFileSync(path.join(chapterDir, "agents.json"), "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed).toEqual(registry2);
    });
  });

  describe("addAgent", () => {
    it("adds a new member entry", () => {
      addAgent(chapterDir, "ops", agentEntry);

      const registry = readAgentsRegistry(chapterDir);
      expect(registry.agents.ops).toEqual(agentEntry);
    });

    it("adds multiple members", () => {
      addAgent(chapterDir, "ops", agentEntry);
      addAgent(chapterDir, "alice", humanEntry);

      const registry = readAgentsRegistry(chapterDir);
      expect(Object.keys(registry.agents)).toHaveLength(2);
      expect(registry.agents.ops).toEqual(agentEntry);
      expect(registry.agents.alice).toEqual(humanEntry);
    });

    it("overwrites existing member entry", () => {
      addAgent(chapterDir, "ops", agentEntry);

      const updatedEntry: AgentEntry = {
        ...agentEntry,
        installedAt: "2026-03-06T12:00:00.000Z",
      };
      addAgent(chapterDir, "ops", updatedEntry);

      const registry = readAgentsRegistry(chapterDir);
      expect(Object.keys(registry.agents)).toHaveLength(1);
      expect(registry.agents.ops.installedAt).toBe("2026-03-06T12:00:00.000Z");
    });
  });

  describe("updateAgentStatus", () => {
    it("changes status from enabled to disabled", () => {
      addAgent(chapterDir, "ops", agentEntry);
      updateAgentStatus(chapterDir, "ops", "disabled");

      const registry = readAgentsRegistry(chapterDir);
      expect(registry.agents.ops.status).toBe("disabled");
    });

    it("changes status from disabled to enabled", () => {
      addAgent(chapterDir, "ops", { ...agentEntry, status: "disabled" });
      updateAgentStatus(chapterDir, "ops", "enabled");

      const registry = readAgentsRegistry(chapterDir);
      expect(registry.agents.ops.status).toBe("enabled");
    });

    it("throws when slug is not found", () => {
      expect(() => updateAgentStatus(chapterDir, "nonexistent", "disabled")).toThrow(
        'Agent "nonexistent" not found in registry',
      );
    });

    it("preserves other member fields when updating status", () => {
      addAgent(chapterDir, "ops", agentEntry);
      updateAgentStatus(chapterDir, "ops", "disabled");

      const registry = readAgentsRegistry(chapterDir);
      expect(registry.agents.ops.package).toBe(agentEntry.package);
      
      expect(registry.agents.ops.installedAt).toBe(agentEntry.installedAt);
    });
  });

  describe("getAgent", () => {
    it("returns entry for existing member", () => {
      addAgent(chapterDir, "ops", agentEntry);

      const entry = getAgent(chapterDir, "ops");
      expect(entry).toEqual(agentEntry);
    });

    it("returns undefined for non-existent member", () => {
      const entry = getAgent(chapterDir, "nonexistent");
      expect(entry).toBeUndefined();
    });

    it("returns undefined when registry file does not exist", () => {
      const entry = getAgent(chapterDir, "ops");
      expect(entry).toBeUndefined();
    });
  });
});
