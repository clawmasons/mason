import { describe, it, expect } from "vitest";
import {
  resolveDialectName,
  registerAgentDialect,
  getDialect,
  getAllDialects,
  getKnownDirectories,
} from "@clawmasons/shared";

// Agent dialects (claude, pi, mcp) are registered by the vitest setup file
// (packages/shared/tests/setup-dialects.ts) which mirrors what the CLI does
// at init time via registerAgentDialect().

// ---------------------------------------------------------------------------
// registerAgentDialect
// ---------------------------------------------------------------------------

describe("registerAgentDialect", () => {
  it("registers a dialect entry from agent info", () => {
    const entry = getDialect("claude-code-agent");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("claude-code-agent");
    expect(entry!.directory).toBe("claude");
    expect(entry!.fieldMapping.tasks).toBe("commands");
    expect(entry!.fieldMapping.apps).toBe("mcp_servers");
    expect(entry!.fieldMapping.skills).toBe("skills");
  });

  it("propagates taskConfig from agent info", () => {
    const entry = getDialect("pi-coding-agent");
    expect(entry).toBeDefined();
    expect(entry!.taskConfig).toBeDefined();
    expect(entry!.taskConfig!.projectFolder).toBe(".pi/prompts");
    expect(entry!.taskConfig!.nameFormat).toBe("{scopeKebab}-{taskName}.md");
  });

  it("propagates skillConfig from agent info", () => {
    const entry = getDialect("claude-code-agent");
    expect(entry!.skillConfig).toBeDefined();
    expect(entry!.skillConfig!.projectFolder).toBe(".claude/skills");
  });

  it("uses default field mapping when dialectFields not provided", () => {
    registerAgentDialect({
      name: "test-default-agent",
      dialect: "testdefault",
    });
    const entry = getDialect("test-default-agent");
    expect(entry).toBeDefined();
    expect(entry!.fieldMapping.tasks).toBe("tasks");
    expect(entry!.fieldMapping.apps).toBe("mcp_servers");
    expect(entry!.fieldMapping.skills).toBe("skills");
  });

  it("allows custom apps and skills field names", () => {
    registerAgentDialect({
      name: "test-custom-agent",
      dialect: "testcustom",
      dialectFields: { tasks: "instructions", apps: "tools", skills: "modules" },
    });
    const entry = getDialect("test-custom-agent");
    expect(entry).toBeDefined();
    expect(entry!.fieldMapping.tasks).toBe("instructions");
    expect(entry!.fieldMapping.apps).toBe("tools");
    expect(entry!.fieldMapping.skills).toBe("modules");
  });

  it("overwrites on duplicate registration (idempotent)", () => {
    registerAgentDialect({
      name: "test-dup-agent",
      dialect: "testdup",
      dialectFields: { tasks: "old" },
    });
    registerAgentDialect({
      name: "test-dup-agent",
      dialect: "testdup",
      dialectFields: { tasks: "new" },
    });
    const entry = getDialect("test-dup-agent");
    expect(entry!.fieldMapping.tasks).toBe("new");
  });
});

// ---------------------------------------------------------------------------
// resolveDialectName (static + dynamically registered)
// ---------------------------------------------------------------------------

describe("resolveDialectName", () => {
  it("resolves exact registry key 'claude-code-agent'", () => {
    expect(resolveDialectName("claude-code-agent")).toBe("claude-code-agent");
  });

  it("resolves short directory name 'claude' to 'claude-code-agent'", () => {
    expect(resolveDialectName("claude")).toBe("claude-code-agent");
  });

  it("resolves dot-prefixed '.claude' to 'claude-code-agent'", () => {
    expect(resolveDialectName(".claude")).toBe("claude-code-agent");
  });

  it("resolves 'codex' to 'codex'", () => {
    expect(resolveDialectName("codex")).toBe("codex");
  });

  it("resolves '.codex' to 'codex'", () => {
    expect(resolveDialectName(".codex")).toBe("codex");
  });

  it("resolves 'aider' to 'aider'", () => {
    expect(resolveDialectName("aider")).toBe("aider");
  });

  it("resolves '.aider' to 'aider'", () => {
    expect(resolveDialectName(".aider")).toBe("aider");
  });

  it("resolves 'mcp' to 'mcp-agent'", () => {
    expect(resolveDialectName("mcp")).toBe("mcp-agent");
  });

  it("resolves '.mcp' to 'mcp-agent'", () => {
    expect(resolveDialectName(".mcp")).toBe("mcp-agent");
  });

  it("resolves 'mcp-agent' to 'mcp-agent'", () => {
    expect(resolveDialectName("mcp-agent")).toBe("mcp-agent");
  });

  it("resolves 'mason' to 'mason'", () => {
    expect(resolveDialectName("mason")).toBe("mason");
  });

  it("resolves '.mason' to 'mason'", () => {
    expect(resolveDialectName(".mason")).toBe("mason");
  });

  it("returns undefined for unknown input 'gpt'", () => {
    expect(resolveDialectName("gpt")).toBeUndefined();
  });

  it("returns undefined for unknown input '.unknown'", () => {
    expect(resolveDialectName(".unknown")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(resolveDialectName("")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getAllDialects / getKnownDirectories
// ---------------------------------------------------------------------------

describe("getAllDialects", () => {
  it("includes both static and dynamically registered dialects", () => {
    const names = getAllDialects().map((d) => d.name);
    // Static
    expect(names).toContain("mason");
    expect(names).toContain("codex");
    expect(names).toContain("aider");
    // Dynamic (from agent packages)
    expect(names).toContain("claude-code-agent");
    expect(names).toContain("pi-coding-agent");
    expect(names).toContain("mcp-agent");
  });
});

describe("getKnownDirectories", () => {
  it("includes directories from both static and dynamic dialects", () => {
    const dirs = getKnownDirectories();
    expect(dirs).toContain("mason");
    expect(dirs).toContain("codex");
    expect(dirs).toContain("aider");
    expect(dirs).toContain("claude");
    expect(dirs).toContain("pi");
    expect(dirs).toContain("mcp");
  });
});
