import { describe, expect, it } from "vitest";
import type { ResolvedApp } from "@clawmasons/shared";
import { rewriteMcpConfig, extractCredentials } from "../../src/acp/rewriter.js";
import type { MatchResult, MatchedServer, UnmatchedServer } from "../../src/acp/matcher.js";

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

function makeMatched(overrides: Partial<MatchedServer> & { name: string }): MatchedServer {
  return {
    config: {},
    app: makeApp({ name: `@clawmasons/app-${overrides.name}` }),
    appShortName: overrides.name,
    ...overrides,
  };
}

function makeUnmatched(overrides: Partial<UnmatchedServer> & { name: string }): UnmatchedServer {
  return {
    config: {},
    reason: `No matching chapter App found for server "${overrides.name}"`,
    ...overrides,
  };
}

function makeMatchResult(matched: MatchedServer[], unmatched: UnmatchedServer[] = []): MatchResult {
  return { matched, unmatched };
}

describe("extractCredentials", () => {
  it("extracts env vars from matched servers", () => {
    const matched = [
      makeMatched({
        name: "github",
        config: { env: { GITHUB_TOKEN: "ghp_abc123" } },
      }),
      makeMatched({
        name: "slack",
        config: { env: { SLACK_TOKEN: "xoxb-456" } },
      }),
    ];

    const creds = extractCredentials(matched);
    expect(creds).toEqual({
      GITHUB_TOKEN: "ghp_abc123",
      SLACK_TOKEN: "xoxb-456",
    });
  });

  it("returns empty record when no matched servers have env", () => {
    const matched = [
      makeMatched({ name: "github", config: {} }),
      makeMatched({ name: "slack", config: { command: "npx" } }),
    ];

    const creds = extractCredentials(matched);
    expect(creds).toEqual({});
  });

  it("uses last-write-wins for duplicate credential keys", () => {
    const matched = [
      makeMatched({
        name: "github",
        config: { env: { API_TOKEN: "first-value" } },
      }),
      makeMatched({
        name: "slack",
        config: { env: { API_TOKEN: "second-value" } },
      }),
    ];

    const creds = extractCredentials(matched);
    expect(creds).toEqual({ API_TOKEN: "second-value" });
  });

  it("returns empty record for empty matched list", () => {
    const creds = extractCredentials([]);
    expect(creds).toEqual({});
  });

  it("handles mixed servers — some with env, some without", () => {
    const matched = [
      makeMatched({
        name: "github",
        config: { env: { GITHUB_TOKEN: "ghp_abc" } },
      }),
      makeMatched({
        name: "slack",
        config: { command: "npx" },
      }),
      makeMatched({
        name: "linear",
        config: { env: { LINEAR_TOKEN: "lin_xyz" } },
      }),
    ];

    const creds = extractCredentials(matched);
    expect(creds).toEqual({
      GITHUB_TOKEN: "ghp_abc",
      LINEAR_TOKEN: "lin_xyz",
    });
  });
});

describe("rewriteMcpConfig", () => {
  const proxyUrl = "http://proxy:3000/mcp";
  const sessionToken = "test-session-token-123";

  it("produces single chapter entry with correct URL and auth header", () => {
    const matchResult = makeMatchResult([
      makeMatched({ name: "github", config: { env: { GITHUB_TOKEN: "ghp_abc" } } }),
      makeMatched({ name: "slack", config: { env: { SLACK_TOKEN: "xoxb-456" } } }),
    ]);

    const result = rewriteMcpConfig(matchResult, proxyUrl, sessionToken);

    expect(Object.keys(result.mcpServers)).toEqual(["chapter"]);
    expect(result.mcpServers.chapter).toEqual({
      url: "http://proxy:3000/mcp",
      headers: { Authorization: "Bearer test-session-token-123" },
    });
  });

  it("extracts credentials from matched servers", () => {
    const matchResult = makeMatchResult([
      makeMatched({ name: "github", config: { env: { GITHUB_TOKEN: "ghp_abc" } } }),
      makeMatched({ name: "slack", config: { env: { SLACK_TOKEN: "xoxb-456" } } }),
    ]);

    const result = rewriteMcpConfig(matchResult, proxyUrl, sessionToken);

    expect(result.extractedCredentials).toEqual({
      GITHUB_TOKEN: "ghp_abc",
      SLACK_TOKEN: "xoxb-456",
    });
  });

  it("produces valid chapter entry even with empty matched list", () => {
    const matchResult = makeMatchResult([]);

    const result = rewriteMcpConfig(matchResult, proxyUrl, sessionToken);

    expect(Object.keys(result.mcpServers)).toEqual(["chapter"]);
    expect(result.mcpServers.chapter!.url).toBe(proxyUrl);
    expect(result.mcpServers.chapter!.headers).toEqual({
      Authorization: `Bearer ${sessionToken}`,
    });
    expect(result.extractedCredentials).toEqual({});
  });

  it("produces empty credentials when matched servers have no env", () => {
    const matchResult = makeMatchResult([
      makeMatched({ name: "github", config: { command: "npx" } }),
    ]);

    const result = rewriteMcpConfig(matchResult, proxyUrl, sessionToken);

    expect(result.extractedCredentials).toEqual({});
  });

  it("ignores unmatched servers in the rewrite", () => {
    const matchResult = makeMatchResult(
      [makeMatched({ name: "github", config: { env: { GITHUB_TOKEN: "ghp_abc" } } })],
      [makeUnmatched({ name: "personal-notes", config: { command: "node", args: ["~/server.js"] } })],
    );

    const result = rewriteMcpConfig(matchResult, proxyUrl, sessionToken);

    // Only chapter entry, no personal-notes
    expect(Object.keys(result.mcpServers)).toEqual(["chapter"]);
    // Only github credentials, nothing from personal-notes
    expect(result.extractedCredentials).toEqual({ GITHUB_TOKEN: "ghp_abc" });
  });
});
