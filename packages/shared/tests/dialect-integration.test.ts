/**
 * Integration tests: Dialect Self-Registration
 *
 * Verifies that registerAgentDialect correctly populates the dialect
 * registry from agent package metadata, and that lookup functions
 * (getDialect, getDialectByDirectory, resolveDialectName) work with
 * dynamically registered entries.
 */

import { describe, it, expect } from "vitest";
import {
  registerAgentDialect,
  getDialect,
  getDialectByDirectory,
  resolveDialectName,
  getAllDialects,
  getKnownDirectories,
  type AgentDialectInfo,
} from "@clawmasons/shared";

// Agent dialects (claude, pi, mcp) are registered by the vitest setup file
// (packages/shared/tests/setup-dialects.ts) which mirrors what the CLI does
// at init time via registerAgentDialect().

// ── Pi Agent Dialect Integration ──────────────────────────────────────

describe("Pi agent dialect integration", () => {
  it("registers with correct name and directory", () => {
    const entry = getDialect("pi-coding-agent");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("pi-coding-agent");
    expect(entry!.directory).toBe("pi");
  });

  it("uses custom tasks field mapping (prompts)", () => {
    const entry = getDialect("pi-coding-agent");
    expect(entry!.fieldMapping.tasks).toBe("prompts");
    expect(entry!.fieldMapping.apps).toBe("mcp_servers");
    expect(entry!.fieldMapping.skills).toBe("skills");
  });

  it("propagates taskConfig from agent metadata", () => {
    const entry = getDialect("pi-coding-agent");
    expect(entry!.taskConfig).toBeDefined();
    expect(entry!.taskConfig!.projectFolder).toBe(".pi/prompts");
    expect(entry!.taskConfig!.nameFormat).toBe("{scopeKebab}-{taskName}.md");
    expect(entry!.taskConfig!.scopeFormat).toBe("kebab-case-prefix");
  });

  it("propagates skillConfig from agent metadata", () => {
    const entry = getDialect("pi-coding-agent");
    expect(entry!.skillConfig).toBeDefined();
    expect(entry!.skillConfig!.projectFolder).toBe("skills");
  });

  it("resolves by directory name 'pi'", () => {
    const entry = getDialectByDirectory("pi");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("pi-coding-agent");
  });

  it("resolves by dot-prefixed directory '.pi'", () => {
    const name = resolveDialectName(".pi");
    expect(name).toBe("pi-coding-agent");
  });

  it("resolves by short directory name 'pi'", () => {
    const name = resolveDialectName("pi");
    expect(name).toBe("pi-coding-agent");
  });

  it("resolves by exact registry key", () => {
    const name = resolveDialectName("pi-coding-agent");
    expect(name).toBe("pi-coding-agent");
  });
});

// ── Claude Agent Dialect Integration ──────────────────────────────────

describe("Claude agent dialect integration", () => {
  it("registers with correct name and directory", () => {
    const entry = getDialect("claude-code-agent");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("claude-code-agent");
    expect(entry!.directory).toBe("claude");
  });

  it("uses custom tasks field mapping (commands)", () => {
    const entry = getDialect("claude-code-agent");
    expect(entry!.fieldMapping.tasks).toBe("commands");
    expect(entry!.fieldMapping.apps).toBe("mcp_servers");
    expect(entry!.fieldMapping.skills).toBe("skills");
  });

  it("propagates taskConfig with commands layout", () => {
    const entry = getDialect("claude-code-agent");
    expect(entry!.taskConfig).toBeDefined();
    expect(entry!.taskConfig!.projectFolder).toBe(".claude/commands");
  });

  it("propagates skillConfig with skills layout", () => {
    const entry = getDialect("claude-code-agent");
    expect(entry!.skillConfig).toBeDefined();
    expect(entry!.skillConfig!.projectFolder).toBe(".claude/skills");
  });

  it("resolves by directory name 'claude'", () => {
    const entry = getDialectByDirectory("claude");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("claude-code-agent");
  });
});

// ── Cross-Dialect Integration ─────────────────────────────────────────

describe("cross-dialect integration", () => {
  it("getAllDialects includes both static and dynamic dialects", () => {
    const allNames = getAllDialects().map(d => d.name);

    // Static (registered in dialect-registry.ts module-level code)
    expect(allNames).toContain("mason");
    expect(allNames).toContain("codex");
    expect(allNames).toContain("aider");

    // Dynamic (registered via registerAgentDialect from agent packages)
    expect(allNames).toContain("claude-code-agent");
    expect(allNames).toContain("pi-coding-agent");
    expect(allNames).toContain("mcp-agent");
  });

  it("getKnownDirectories includes directories from all dialects", () => {
    const dirs = getKnownDirectories();

    // Static
    expect(dirs).toContain("mason");
    expect(dirs).toContain("codex");
    expect(dirs).toContain("aider");

    // Dynamic
    expect(dirs).toContain("claude");
    expect(dirs).toContain("pi");
    expect(dirs).toContain("mcp");
  });

  it("simulated third-party agent registers and resolves", () => {
    const thirdPartyInfo: AgentDialectInfo = {
      name: "acme-agent",
      dialect: "acme",
      dialectFields: { tasks: "instructions" },
      tasks: {
        projectFolder: ".acme/instructions",
        nameFormat: "{taskName}.md",
        scopeFormat: "path",
        supportedFields: "all",
        prompt: "markdown-body",
      },
      skills: {
        projectFolder: ".acme/skills",
      },
    };

    registerAgentDialect(thirdPartyInfo);

    // Verify registration
    const entry = getDialect("acme-agent");
    expect(entry).toBeDefined();
    expect(entry!.directory).toBe("acme");
    expect(entry!.fieldMapping.tasks).toBe("instructions");
    expect(entry!.fieldMapping.apps).toBe("mcp_servers"); // default
    expect(entry!.taskConfig!.projectFolder).toBe(".acme/instructions");
    expect(entry!.skillConfig!.projectFolder).toBe(".acme/skills");

    // Verify lookup
    expect(getDialectByDirectory("acme")?.name).toBe("acme-agent");
    expect(resolveDialectName("acme")).toBe("acme-agent");
    expect(resolveDialectName(".acme")).toBe("acme-agent");
  });
});
