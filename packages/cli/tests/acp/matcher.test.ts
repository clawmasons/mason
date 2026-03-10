import { describe, expect, it } from "vitest";
import type { ResolvedApp } from "@clawmasons/shared";
import {
  matchServers,
  buildAppShortNameIndex,
  type McpServerConfig,
} from "../../src/acp/matcher.js";

function makeApp(overrides: Partial<ResolvedApp> & { name: string }): ResolvedApp {
  return {
    version: "1.0.0",
    transport: "stdio",
    tools: [],
    capabilities: [],
    credentials: [],
    ...overrides,
  };
}

function makeConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return { ...overrides };
}

describe("buildAppShortNameIndex", () => {
  it("indexes apps by lowercase short name", () => {
    const apps = [
      makeApp({ name: "@clawmasons/app-github" }),
      makeApp({ name: "@clawmasons/app-slack" }),
    ];
    const index = buildAppShortNameIndex(apps);
    expect(index.size).toBe(2);
    expect(index.get("github")).toHaveLength(1);
    expect(index.get("slack")).toHaveLength(1);
  });

  it("groups apps with the same short name", () => {
    const apps = [
      makeApp({ name: "@clawmasons/app-github", command: "npx" }),
      makeApp({ name: "@other/app-github", command: "docker" }),
    ];
    const index = buildAppShortNameIndex(apps);
    expect(index.size).toBe(1);
    expect(index.get("github")).toHaveLength(2);
  });

  it("returns empty map for empty apps", () => {
    const index = buildAppShortNameIndex([]);
    expect(index.size).toBe(0);
  });
});

describe("matchServers", () => {
  it("matches by name (case-insensitive)", () => {
    const apps = [makeApp({ name: "@clawmasons/app-github" })];
    const result = matchServers(
      { github: makeConfig({ command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] }) },
      apps,
    );

    expect(result.matched).toHaveLength(1);
    expect(result.unmatched).toHaveLength(0);
    expect(result.matched[0]!.name).toBe("github");
    expect(result.matched[0]!.app.name).toBe("@clawmasons/app-github");
    expect(result.matched[0]!.appShortName).toBe("github");
  });

  it("matches mixed case key to lowercase short name", () => {
    const apps = [makeApp({ name: "@clawmasons/app-github" })];
    const result = matchServers({ GitHub: makeConfig() }, apps);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.name).toBe("GitHub");
    expect(result.matched[0]!.app.name).toBe("@clawmasons/app-github");
  });

  it("matches uppercase key", () => {
    const apps = [makeApp({ name: "@clawmasons/app-slack" })];
    const result = matchServers({ SLACK: makeConfig() }, apps);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.name).toBe("SLACK");
    expect(result.matched[0]!.app.name).toBe("@clawmasons/app-slack");
  });

  it("returns unmatched with descriptive reason when no app matches", () => {
    const apps = [makeApp({ name: "@clawmasons/app-github" })];
    const result = matchServers(
      { "personal-notes": makeConfig({ command: "node", args: ["~/my-server/index.js"] }) },
      apps,
    );

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]!.name).toBe("personal-notes");
    expect(result.unmatched[0]!.reason).toContain("personal-notes");
    expect(result.unmatched[0]!.reason.toLowerCase()).toContain("no matching chapter app");
  });

  it("returns empty result for empty mcpServers", () => {
    const apps = [makeApp({ name: "@clawmasons/app-github" })];
    const result = matchServers({}, apps);

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0);
  });

  it("returns all unmatched when no apps exist", () => {
    const result = matchServers(
      {
        github: makeConfig(),
        slack: makeConfig(),
      },
      [],
    );

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(2);
  });

  it("handles multiple servers with partial matching", () => {
    const apps = [
      makeApp({ name: "@clawmasons/app-github" }),
      makeApp({ name: "@clawmasons/app-slack" }),
    ];
    const result = matchServers(
      {
        github: makeConfig({ command: "npx" }),
        slack: makeConfig({ command: "npx" }),
        "personal-notes": makeConfig({ command: "node" }),
      },
      apps,
    );

    expect(result.matched).toHaveLength(2);
    expect(result.unmatched).toHaveLength(1);

    const matchedNames = result.matched.map((m) => m.name);
    expect(matchedNames).toContain("github");
    expect(matchedNames).toContain("slack");
    expect(result.unmatched[0]!.name).toBe("personal-notes");
  });

  it("disambiguates by command+args when multiple apps share short name", () => {
    const apps = [
      makeApp({
        name: "@clawmasons/app-github",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      }),
      makeApp({
        name: "@other/app-github",
        command: "docker",
        args: ["run", "github-server"],
      }),
    ];
    const result = matchServers(
      {
        github: makeConfig({
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
        }),
      },
      apps,
    );

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.app.name).toBe("@clawmasons/app-github");
    expect(result.matched[0]!.app.command).toBe("npx");
  });

  it("disambiguates by URL when multiple apps share short name", () => {
    const apps = [
      makeApp({
        name: "@clawmasons/app-api",
        transport: "streamable-http",
        url: "https://api1.example.com",
      }),
      makeApp({
        name: "@other/app-api",
        transport: "streamable-http",
        url: "https://api2.example.com",
      }),
    ];
    const result = matchServers(
      {
        api: makeConfig({ url: "https://api1.example.com" }),
      },
      apps,
    );

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.app.name).toBe("@clawmasons/app-api");
    expect(result.matched[0]!.app.url).toBe("https://api1.example.com");
  });

  it("falls back to first candidate when disambiguation fails", () => {
    const apps = [
      makeApp({ name: "@clawmasons/app-github", command: "cmd1" }),
      makeApp({ name: "@other/app-github", command: "cmd2" }),
    ];
    const result = matchServers(
      {
        github: makeConfig({ command: "something-else" }),
      },
      apps,
    );

    expect(result.matched).toHaveLength(1);
    // Falls back to first candidate
    expect(result.matched[0]!.app.name).toBe("@clawmasons/app-github");
  });

  it("preserves original config including env in matched result", () => {
    const apps = [makeApp({ name: "@clawmasons/app-github" })];
    const config = makeConfig({
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_TOKEN: "ghp_abc123" },
    });
    const result = matchServers({ github: config }, apps);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.config.env).toEqual({ GITHUB_TOKEN: "ghp_abc123" });
    expect(result.matched[0]!.config.command).toBe("npx");
  });

  it("preserves original config in unmatched result", () => {
    const config = makeConfig({
      command: "node",
      args: ["~/my-server/index.js"],
    });
    const result = matchServers({ "my-server": config }, []);

    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]!.config.command).toBe("node");
    expect(result.unmatched[0]!.config.args).toEqual(["~/my-server/index.js"]);
  });
});
