import { describe, it, expect } from "vitest";
import { ToolRouter } from "../../src/proxy/router.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolFilter } from "../../src/generator/types.js";

// ── Fixtures ────────────────────────────────────────────────────────────

function makeTool(name: string, description?: string): Tool {
  return {
    name,
    description: description ?? `Tool: ${name}`,
    inputSchema: {
      type: "object" as const,
      properties: { arg1: { type: "string" } },
    },
  };
}

function makeFilter(list: string[]): ToolFilter {
  return { mode: "allow", list };
}

// ── Static helpers ──────────────────────────────────────────────────────

describe("ToolRouter.prefixName", () => {
  it("joins app short name and tool name with underscore", () => {
    expect(ToolRouter.prefixName("github", "create_pr")).toBe(
      "github_create_pr",
    );
  });

  it("handles single-word tool names", () => {
    expect(ToolRouter.prefixName("slack", "send")).toBe("slack_send");
  });
});

describe("ToolRouter.unprefixName", () => {
  it("strips the app prefix and underscore", () => {
    expect(ToolRouter.unprefixName("github", "github_create_pr")).toBe(
      "create_pr",
    );
  });

  it("returns the original string if prefix does not match", () => {
    expect(ToolRouter.unprefixName("slack", "github_create_pr")).toBe(
      "github_create_pr",
    );
  });
});

// ── Constructor & routing table ─────────────────────────────────────────

describe("ToolRouter constructor", () => {
  it("builds routing table with prefixed tools", () => {
    const upstreamTools = new Map<string, Tool[]>([
      ["@clawforge/app-github", [makeTool("create_pr"), makeTool("list_repos")]],
    ]);
    const filters = new Map<string, ToolFilter>([
      ["@clawforge/app-github", makeFilter(["create_pr", "list_repos"])],
    ]);

    const router = new ToolRouter(upstreamTools, filters);
    const tools = router.listTools();

    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name).sort()).toEqual([
      "github_create_pr",
      "github_list_repos",
    ]);
  });

  it("filters out tools not in the allow-list", () => {
    const upstreamTools = new Map<string, Tool[]>([
      [
        "@clawforge/app-github",
        [makeTool("create_pr"), makeTool("list_repos"), makeTool("delete_repo")],
      ],
    ]);
    const filters = new Map<string, ToolFilter>([
      ["@clawforge/app-github", makeFilter(["create_pr", "list_repos"])],
    ]);

    const router = new ToolRouter(upstreamTools, filters);
    const tools = router.listTools();

    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name).sort()).toEqual([
      "github_create_pr",
      "github_list_repos",
    ]);
    expect(router.resolve("github_delete_repo")).toBeNull();
  });

  it("excludes all tools for apps with no filter entry", () => {
    const upstreamTools = new Map<string, Tool[]>([
      ["@clawforge/app-github", [makeTool("create_pr")]],
    ]);
    const filters = new Map<string, ToolFilter>();

    const router = new ToolRouter(upstreamTools, filters);

    expect(router.listTools()).toHaveLength(0);
    expect(router.resolve("github_create_pr")).toBeNull();
  });

  it("excludes all tools for apps with empty allow-list", () => {
    const upstreamTools = new Map<string, Tool[]>([
      ["@clawforge/app-github", [makeTool("create_pr")]],
    ]);
    const filters = new Map<string, ToolFilter>([
      ["@clawforge/app-github", makeFilter([])],
    ]);

    const router = new ToolRouter(upstreamTools, filters);

    expect(router.listTools()).toHaveLength(0);
  });

  it("throws on duplicate prefixed tool names", () => {
    // Two different apps that both resolve to short name "github"
    // (unlikely in practice but tests the guard)
    const upstreamTools = new Map<string, Tool[]>([
      ["@clawforge/app-github", [makeTool("create_pr")]],
      ["@other/app-github", [makeTool("create_pr")]],
    ]);
    const filters = new Map<string, ToolFilter>([
      ["@clawforge/app-github", makeFilter(["create_pr"])],
      ["@other/app-github", makeFilter(["create_pr"])],
    ]);

    expect(() => new ToolRouter(upstreamTools, filters)).toThrow(
      /Duplicate prefixed tool name "github_create_pr"/,
    );
  });

  it("produces empty routing table from empty upstream tools", () => {
    const router = new ToolRouter(new Map(), new Map());

    expect(router.listTools()).toHaveLength(0);
  });

  it("merges tools from multiple apps correctly", () => {
    const upstreamTools = new Map<string, Tool[]>([
      ["@clawforge/app-github", [makeTool("create_pr")]],
      ["@clawforge/app-slack", [makeTool("send_message")]],
    ]);
    const filters = new Map<string, ToolFilter>([
      ["@clawforge/app-github", makeFilter(["create_pr"])],
      ["@clawforge/app-slack", makeFilter(["send_message"])],
    ]);

    const router = new ToolRouter(upstreamTools, filters);
    const tools = router.listTools();

    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name).sort()).toEqual([
      "github_create_pr",
      "slack_send_message",
    ]);
  });
});

// ── listTools ───────────────────────────────────────────────────────────

describe("ToolRouter.listTools", () => {
  it("preserves tool description and inputSchema", () => {
    const tool = makeTool("create_pr", "Creates a pull request");
    const upstreamTools = new Map<string, Tool[]>([
      ["@clawforge/app-github", [tool]],
    ]);
    const filters = new Map<string, ToolFilter>([
      ["@clawforge/app-github", makeFilter(["create_pr"])],
    ]);

    const router = new ToolRouter(upstreamTools, filters);
    const listed = router.listTools();

    expect(listed).toHaveLength(1);
    expect(listed[0]!.name).toBe("github_create_pr");
    expect(listed[0]!.description).toBe("Creates a pull request");
    expect(listed[0]!.inputSchema).toEqual(tool.inputSchema);
  });

  it("preserves tool annotations when present", () => {
    const tool: Tool = {
      ...makeTool("delete_repo"),
      annotations: { destructiveHint: true },
    };
    const upstreamTools = new Map<string, Tool[]>([
      ["@clawforge/app-github", [tool]],
    ]);
    const filters = new Map<string, ToolFilter>([
      ["@clawforge/app-github", makeFilter(["delete_repo"])],
    ]);

    const router = new ToolRouter(upstreamTools, filters);
    const listed = router.listTools();

    expect(listed[0]!.annotations).toEqual({ destructiveHint: true });
  });
});

// ── resolve ─────────────────────────────────────────────────────────────

describe("ToolRouter.resolve", () => {
  const upstreamTools = new Map<string, Tool[]>([
    ["@clawforge/app-github", [makeTool("create_pr"), makeTool("list_repos")]],
    ["@clawforge/app-slack", [makeTool("send_message")]],
  ]);
  const filters = new Map<string, ToolFilter>([
    ["@clawforge/app-github", makeFilter(["create_pr", "list_repos"])],
    ["@clawforge/app-slack", makeFilter(["send_message"])],
  ]);

  it("returns correct RouteEntry for a known prefixed name", () => {
    const router = new ToolRouter(upstreamTools, filters);
    const entry = router.resolve("github_create_pr");

    expect(entry).not.toBeNull();
    expect(entry!.appName).toBe("@clawforge/app-github");
    expect(entry!.appShortName).toBe("github");
    expect(entry!.originalToolName).toBe("create_pr");
    expect(entry!.prefixedToolName).toBe("github_create_pr");
    expect(entry!.tool.name).toBe("github_create_pr");
  });

  it("returns correct RouteEntry for a different app", () => {
    const router = new ToolRouter(upstreamTools, filters);
    const entry = router.resolve("slack_send_message");

    expect(entry).not.toBeNull();
    expect(entry!.appName).toBe("@clawforge/app-slack");
    expect(entry!.appShortName).toBe("slack");
    expect(entry!.originalToolName).toBe("send_message");
  });

  it("returns null for unknown prefixed name", () => {
    const router = new ToolRouter(upstreamTools, filters);

    expect(router.resolve("github_delete_repo")).toBeNull();
  });

  it("returns null for completely unknown name", () => {
    const router = new ToolRouter(upstreamTools, filters);

    expect(router.resolve("nonexistent_tool")).toBeNull();
  });

  it("returns null for empty string", () => {
    const router = new ToolRouter(upstreamTools, filters);

    expect(router.resolve("")).toBeNull();
  });
});
