import { describe, it, expect } from "vitest";
import type { Role } from "@clawmasons/shared";
import { mergeRoles } from "../../src/role/merge.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    metadata: { name: "current", description: "Current role" },
    instructions: "",
    type: "project",
    tasks: [],
    mcp: [],
    skills: [],
    sources: ["mason"],
    container: {
      packages: { apt: [], npm: [], pip: [] },
      ignore: { paths: [] },
      mounts: [],
    },
    governance: { risk: "LOW", credentials: [] },
    resources: [],
    role: { includes: [] },
    source: { type: "local", agentDialect: "mason", path: "/fake" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests — PRD §11.4 tests 1-7
// ---------------------------------------------------------------------------

describe("mergeRoles", () => {
  it("test 1: list union with dedup — duplicate task names discarded", () => {
    const current = makeRole({
      tasks: [{ name: "review" }, { name: "build" }],
    });
    const included = makeRole({
      metadata: { name: "included", description: "Included role" },
      tasks: [{ name: "build" }, { name: "deploy" }],
    });

    const result = mergeRoles(current, included);

    expect(result.tasks.map((t) => t.name)).toEqual(["review", "build", "deploy"]);
  });

  it("test 2: list ordering — current items first, included appended", () => {
    const current = makeRole({
      tasks: [{ name: "alpha" }],
      skills: [{ name: "skill-a" }],
    });
    const included = makeRole({
      metadata: { name: "included", description: "Included role" },
      tasks: [{ name: "beta" }],
      skills: [{ name: "skill-b" }],
    });

    const result = mergeRoles(current, included);

    expect(result.tasks.map((t) => t.name)).toEqual(["alpha", "beta"]);
    expect(result.skills.map((s) => s.name)).toEqual(["skill-a", "skill-b"]);
  });

  it("test 4: map identity-key dedup — same-name MCP server discarded entirely", () => {
    const current = makeRole({
      mcp: [
        {
          name: "github",
          env: { TOKEN: "current-token" },
          tools: { allow: [], deny: [] },
          credentials: [],
          location: "proxy",
        },
      ],
    });
    const included = makeRole({
      metadata: { name: "included", description: "Included role" },
      mcp: [
        {
          name: "github",
          env: { TOKEN: "included-token" },
          tools: { allow: [], deny: [] },
          credentials: [],
          location: "proxy",
        },
        {
          name: "slack",
          env: {},
          tools: { allow: [], deny: [] },
          credentials: [],
          location: "proxy",
        },
      ],
    });

    const result = mergeRoles(current, included);

    expect(result.mcp.map((m) => m.name)).toEqual(["github", "slack"]);
    // The current role's github server is kept, not the included one
    expect(result.mcp[0].env).toEqual({ TOKEN: "current-token" });
  });

  it("test 5: scalar current-wins — included risk does not override", () => {
    const current = makeRole({
      governance: { risk: "LOW", credentials: [] },
    });
    const included = makeRole({
      metadata: { name: "included", description: "Included role" },
      governance: { risk: "HIGH", credentials: [] },
    });

    const result = mergeRoles(current, included);

    expect(result.governance.risk).toBe("LOW");
    // Metadata current wins
    expect(result.metadata.name).toBe("current");
    expect(result.metadata.description).toBe("Current role");
    // Type current wins
    expect(result.type).toBe("project");
  });

  it("test 6: instructions append — both non-empty", () => {
    const current = makeRole({
      instructions: "Current instructions",
    });
    const included = makeRole({
      metadata: { name: "included", description: "Included role" },
      instructions: "Included instructions",
    });

    const result = mergeRoles(current, included);

    expect(result.instructions).toBe(
      "Current instructions\n\nIncluded instructions",
    );
  });

  it("test 7: instructions fallback — current empty, included used", () => {
    const current = makeRole({
      instructions: "",
    });
    const included = makeRole({
      metadata: { name: "included", description: "Included role" },
      instructions: "Included instructions",
    });

    const result = mergeRoles(current, included);

    expect(result.instructions).toBe("Included instructions");
  });

  it("container packages and mounts merge with dedup", () => {
    const current = makeRole({
      container: {
        packages: {
          apt: ["git", "curl"],
          npm: ["typescript"],
          pip: [],
        },
        ignore: { paths: [".git"] },
        mounts: [{ source: "/host/a", target: "/container/a", readonly: false }],
      },
    });
    const included = makeRole({
      metadata: { name: "included", description: "Included role" },
      container: {
        packages: {
          apt: ["curl", "wget"],
          npm: ["eslint"],
          pip: ["pytest"],
        },
        ignore: { paths: [".git", "node_modules"] },
        mounts: [
          { source: "/host/a", target: "/container/a", readonly: true },
          { source: "/host/b", target: "/container/b", readonly: false },
        ],
      },
    });

    const result = mergeRoles(current, included);

    // apt: git, curl from current + wget from included (curl deduped)
    expect(result.container.packages.apt).toEqual(["git", "curl", "wget"]);
    expect(result.container.packages.npm).toEqual(["typescript", "eslint"]);
    expect(result.container.packages.pip).toEqual(["pytest"]);
    expect(result.container.ignore.paths).toEqual([".git", "node_modules"]);
    // Mounts: /container/a deduped (current wins), /container/b added
    expect(result.container.mounts.map((m) => m.target)).toEqual([
      "/container/a",
      "/container/b",
    ]);
    // Current mount's readonly value preserved
    expect(result.container.mounts[0].readonly).toBe(false);
  });

  it("governance credentials merge with dedup", () => {
    const current = makeRole({
      governance: {
        risk: "LOW",
        credentials: ["GITHUB_TOKEN"],
      },
    });
    const included = makeRole({
      metadata: { name: "included", description: "Included role" },
      governance: {
        risk: "HIGH",
        credentials: ["GITHUB_TOKEN", "SLACK_TOKEN"],
      },
    });

    const result = mergeRoles(current, included);

    expect(result.governance.credentials).toEqual(["GITHUB_TOKEN", "SLACK_TOKEN"]);
  });

  it("sources are NOT merged — current only", () => {
    const current = makeRole({
      sources: ["mason"],
    });
    const included = makeRole({
      metadata: { name: "included", description: "Included role" },
      sources: ["claude", "codex"],
    });

    const result = mergeRoles(current, included);

    expect(result.sources).toEqual(["mason"]);
  });

  it("channel: current wins (scalar semantics)", () => {
    const current = makeRole({
      channel: { type: "slack", args: ["--debug"] },
    } as Partial<Role>);
    const included = makeRole({
      metadata: { name: "included", description: "Included role" },
      channel: { type: "telegram", args: [] },
    } as Partial<Role>);

    const result = mergeRoles(current, included);

    expect(result.channel).toEqual({ type: "slack", args: ["--debug"] });
  });

  it("channel: current without channel — included's channel does not propagate (scalar semantics)", () => {
    const current = makeRole();
    const included = makeRole({
      metadata: { name: "included", description: "Included role" },
      channel: { type: "slack", args: [] },
    } as Partial<Role>);

    const result = mergeRoles(current, included);

    // Scalar current-wins: since current has no channel, result has no channel.
    // The included's channel does not propagate.
    expect(result.channel).toBeUndefined();
  });
});
