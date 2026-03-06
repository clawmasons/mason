import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  readMembersRegistry,
  writeMembersRegistry,
  addMember,
  updateMemberStatus,
  getMember,
} from "../../src/registry/members.js";
import type { MemberEntry, MembersRegistry } from "../../src/registry/types.js";

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

  const agentEntry: MemberEntry = {
    package: "@test/member-ops",
    memberType: "agent",
    status: "enabled",
    installedAt: "2026-03-06T10:30:00.000Z",
  };

  const humanEntry: MemberEntry = {
    package: "@test/member-alice",
    memberType: "human",
    status: "enabled",
    installedAt: "2026-03-06T11:00:00.000Z",
  };

  describe("readMembersRegistry", () => {
    it("returns empty registry when file does not exist", () => {
      const registry = readMembersRegistry(chapterDir);
      expect(registry).toEqual({ members: {} });
    });

    it("returns empty registry when directory does not exist", () => {
      const nonExistent = path.join(tmpDir, "does-not-exist");
      const registry = readMembersRegistry(nonExistent);
      expect(registry).toEqual({ members: {} });
    });

    it("parses valid registry file", () => {
      const expected: MembersRegistry = {
        members: {
          ops: agentEntry,
          alice: humanEntry,
        },
      };
      fs.mkdirSync(chapterDir, { recursive: true });
      fs.writeFileSync(
        path.join(chapterDir, "members.json"),
        JSON.stringify(expected, null, 2),
      );

      const registry = readMembersRegistry(chapterDir);
      expect(registry).toEqual(expected);
    });

    it("throws on malformed JSON", () => {
      fs.mkdirSync(chapterDir, { recursive: true });
      fs.writeFileSync(path.join(chapterDir, "members.json"), "not json");

      expect(() => readMembersRegistry(chapterDir)).toThrow();
    });
  });

  describe("writeMembersRegistry", () => {
    it("creates file with proper JSON format", () => {
      const registry: MembersRegistry = { members: { ops: agentEntry } };
      writeMembersRegistry(chapterDir, registry);

      const filePath = path.join(chapterDir, "members.json");
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed).toEqual(registry);

      // Verify pretty-printed with trailing newline
      expect(content).toBe(JSON.stringify(registry, null, 2) + "\n");
    });

    it("creates directory if it does not exist", () => {
      const deepDir = path.join(tmpDir, "deep", "nested", ".chapter");
      const registry: MembersRegistry = { members: { ops: agentEntry } };
      writeMembersRegistry(deepDir, registry);

      expect(fs.existsSync(path.join(deepDir, "members.json"))).toBe(true);
    });

    it("overwrites existing file", () => {
      const registry1: MembersRegistry = { members: { ops: agentEntry } };
      writeMembersRegistry(chapterDir, registry1);

      const registry2: MembersRegistry = { members: { alice: humanEntry } };
      writeMembersRegistry(chapterDir, registry2);

      const content = fs.readFileSync(path.join(chapterDir, "members.json"), "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed).toEqual(registry2);
    });
  });

  describe("addMember", () => {
    it("adds a new member entry", () => {
      addMember(chapterDir, "ops", agentEntry);

      const registry = readMembersRegistry(chapterDir);
      expect(registry.members.ops).toEqual(agentEntry);
    });

    it("adds multiple members", () => {
      addMember(chapterDir, "ops", agentEntry);
      addMember(chapterDir, "alice", humanEntry);

      const registry = readMembersRegistry(chapterDir);
      expect(Object.keys(registry.members)).toHaveLength(2);
      expect(registry.members.ops).toEqual(agentEntry);
      expect(registry.members.alice).toEqual(humanEntry);
    });

    it("overwrites existing member entry", () => {
      addMember(chapterDir, "ops", agentEntry);

      const updatedEntry: MemberEntry = {
        ...agentEntry,
        installedAt: "2026-03-06T12:00:00.000Z",
      };
      addMember(chapterDir, "ops", updatedEntry);

      const registry = readMembersRegistry(chapterDir);
      expect(Object.keys(registry.members)).toHaveLength(1);
      expect(registry.members.ops.installedAt).toBe("2026-03-06T12:00:00.000Z");
    });
  });

  describe("updateMemberStatus", () => {
    it("changes status from enabled to disabled", () => {
      addMember(chapterDir, "ops", agentEntry);
      updateMemberStatus(chapterDir, "ops", "disabled");

      const registry = readMembersRegistry(chapterDir);
      expect(registry.members.ops.status).toBe("disabled");
    });

    it("changes status from disabled to enabled", () => {
      addMember(chapterDir, "ops", { ...agentEntry, status: "disabled" });
      updateMemberStatus(chapterDir, "ops", "enabled");

      const registry = readMembersRegistry(chapterDir);
      expect(registry.members.ops.status).toBe("enabled");
    });

    it("throws when slug is not found", () => {
      expect(() => updateMemberStatus(chapterDir, "nonexistent", "disabled")).toThrow(
        'Member "nonexistent" not found in registry',
      );
    });

    it("preserves other member fields when updating status", () => {
      addMember(chapterDir, "ops", agentEntry);
      updateMemberStatus(chapterDir, "ops", "disabled");

      const registry = readMembersRegistry(chapterDir);
      expect(registry.members.ops.package).toBe(agentEntry.package);
      expect(registry.members.ops.memberType).toBe(agentEntry.memberType);
      expect(registry.members.ops.installedAt).toBe(agentEntry.installedAt);
    });
  });

  describe("getMember", () => {
    it("returns entry for existing member", () => {
      addMember(chapterDir, "ops", agentEntry);

      const entry = getMember(chapterDir, "ops");
      expect(entry).toEqual(agentEntry);
    });

    it("returns undefined for non-existent member", () => {
      const entry = getMember(chapterDir, "nonexistent");
      expect(entry).toBeUndefined();
    });

    it("returns undefined when registry file does not exist", () => {
      const entry = getMember(chapterDir, "ops");
      expect(entry).toBeUndefined();
    });
  });
});
