import { describe, it, expect, beforeEach } from "vitest";
import {
  setPinnedArgs,
  getPinnedArgs,
  clearPinnedArgs,
  buildConfigOptions,
} from "../../src/acp/acp-agent.js";

// ---------------------------------------------------------------------------
// Pinned args state management
// ---------------------------------------------------------------------------

describe("setPinnedArgs / getPinnedArgs / clearPinnedArgs", () => {
  beforeEach(() => {
    clearPinnedArgs();
  });

  it("returns empty object when no args are set", () => {
    expect(getPinnedArgs()).toEqual({});
  });

  it("stores agent and role", () => {
    setPinnedArgs({ agent: "claude", role: "writer" });
    expect(getPinnedArgs()).toEqual({ agent: "claude", role: "writer" });
  });

  it("stores source", () => {
    setPinnedArgs({ source: "/abs/path/src" });
    expect(getPinnedArgs()).toEqual({ source: "/abs/path/src" });
  });

  it("stores all three fields", () => {
    setPinnedArgs({ agent: "claude", role: "writer", source: "/src" });
    expect(getPinnedArgs()).toEqual({ agent: "claude", role: "writer", source: "/src" });
  });

  it("unset fields are undefined", () => {
    setPinnedArgs({ agent: "claude" });
    expect(getPinnedArgs().agent).toBe("claude");
    expect(getPinnedArgs().role).toBeUndefined();
    expect(getPinnedArgs().source).toBeUndefined();
  });

  it("clearPinnedArgs resets to empty", () => {
    setPinnedArgs({ agent: "claude", role: "writer" });
    clearPinnedArgs();
    expect(getPinnedArgs()).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// buildConfigOptions with pinned args filtering
// ---------------------------------------------------------------------------

const mockDiscovery = {
  roles: [
    { metadata: { name: "writer" }, source: { type: "local" as const } },
    { metadata: { name: "editor" }, source: { type: "package" as const, packageName: "@test/editor" } },
  ],
  agentNames: ["claude-code-agent", "mcp-agent"],
};

describe("buildConfigOptions — pinned args filtering", () => {
  it("returns both options when nothing is pinned", () => {
    const options = buildConfigOptions(mockDiscovery, "writer", "claude-code-agent");
    const ids = options.map((o) => o.id);
    expect(ids).toContain("role");
    expect(ids).toContain("agent");
  });

  it("excludes agent option when agent is pinned", () => {
    const options = buildConfigOptions(mockDiscovery, "writer", "claude-code-agent", { agent: "claude-code-agent" });
    const ids = options.map((o) => o.id);
    expect(ids).toContain("role");
    expect(ids).not.toContain("agent");
  });

  it("excludes role option when role is pinned", () => {
    const options = buildConfigOptions(mockDiscovery, "writer", "claude-code-agent", { role: "writer" });
    const ids = options.map((o) => o.id);
    expect(ids).not.toContain("role");
    expect(ids).toContain("agent");
  });

  it("returns empty array when both are pinned", () => {
    const options = buildConfigOptions(mockDiscovery, "writer", "claude-code-agent", {
      agent: "claude-code-agent",
      role: "writer",
    });
    expect(options).toEqual([]);
  });

  it("source pinning does not affect config options", () => {
    const options = buildConfigOptions(mockDiscovery, "writer", "claude-code-agent", { source: "/some/path" });
    const ids = options.map((o) => o.id);
    expect(ids).toContain("role");
    expect(ids).toContain("agent");
  });
});
