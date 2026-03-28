import { describe, expect, it } from "vitest";
import { mockClaudeCodeAgent, mockClaudeCodeMaterializer } from "./mock-agent-packages.js";
import type { ResolvedAgent } from "@clawmasons/shared";

// Minimal resolved agent fixture for materializer calls
const minimalAgent = {
  name: "test-agent",
  version: "1.0.0",
  agentName: "claude-code-agent",
  slug: "test-agent",
  runtimes: ["claude-code-agent"],
  roles: [],
  credentials: [],
} as ResolvedAgent;

describe("mockClaudeCodeAgent resume config", () => {
  it("has resume field with --resume flag", () => {
    expect(mockClaudeCodeAgent.resume).toBeDefined();
    expect(mockClaudeCodeAgent.resume!.flag).toBe("--resume");
  });

  it("has resume field with agentSessionId sessionIdField", () => {
    expect(mockClaudeCodeAgent.resume!.sessionIdField).toBe("agentSessionId");
  });
});

describe("mockClaudeCodeMaterializer SessionStart hook", () => {
  function getSettings(): Record<string, unknown> {
    const files = mockClaudeCodeMaterializer.materializeWorkspace(
      minimalAgent,
      "http://proxy:3100",
    );
    const settingsJson = files.get(".claude/settings.json");
    expect(settingsJson).toBeDefined();
    return JSON.parse(settingsJson!);
  }

  it("includes SessionStart hook in settings.json", () => {
    const settings = getSettings();
    expect(settings.hooks).toBeDefined();

    const hooks = settings.hooks as Record<string, unknown[]>;
    expect(hooks.SessionStart).toBeDefined();
    expect(Array.isArray(hooks.SessionStart)).toBe(true);
    expect(hooks.SessionStart.length).toBeGreaterThan(0);
  });

  it("hook command references /home/mason/.mason/session/meta.json", () => {
    const settings = getSettings();
    const hooks = settings.hooks as { SessionStart: Array<{ hooks: Array<{ command: string }> }> };
    const command = hooks.SessionStart[0].hooks[0].command;
    expect(command).toContain("/home/mason/.mason/session/meta.json");
  });

  it("hook command reads session_id from stdin JSON", () => {
    const settings = getSettings();
    const hooks = settings.hooks as { SessionStart: Array<{ hooks: Array<{ command: string }> }> };
    const command = hooks.SessionStart[0].hooks[0].command;
    expect(command).toContain("i.session_id");
  });

  it("preserves permissions alongside hooks", () => {
    const settings = getSettings();
    expect(settings.permissions).toBeDefined();

    const permissions = settings.permissions as { allow: string[]; deny: string[] };
    expect(permissions.allow).toContain("mcp__mason__*");
    expect(permissions.deny).toEqual([]);
  });

  it("hook sets agentSessionId field in meta.json", () => {
    const settings = getSettings();
    const hooks = settings.hooks as { SessionStart: Array<{ hooks: Array<{ command: string }> }> };
    const command = hooks.SessionStart[0].hooks[0].command;
    expect(command).toContain("m.agentSessionId=i.session_id");
  });
});
