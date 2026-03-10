import { describe, expect, it } from "vitest";
import { formatWarning, generateWarnings } from "../../src/acp/warnings.js";
import type { UnmatchedServer } from "../../src/acp/matcher.js";

function makeUnmatched(overrides: Partial<UnmatchedServer> & { name: string }): UnmatchedServer {
  return {
    config: {},
    reason: `No matching chapter App found for server "${overrides.name}"`,
    ...overrides,
  };
}

describe("formatWarning", () => {
  it("produces PRD-format warning string", () => {
    const server = makeUnmatched({ name: "personal-notes" });
    const warning = formatWarning(server);

    expect(warning).toContain('[chapter run-acp-agent] WARNING: Dropping unmatched MCP server "personal-notes"');
    expect(warning).toContain("Agent will not have access to tools from this server");
    expect(warning).toContain("To govern this server, create a chapter App package for it");
  });

  it("includes the server name in the warning", () => {
    const server = makeUnmatched({ name: "my-custom-server" });
    const warning = formatWarning(server);

    expect(warning).toContain('"my-custom-server"');
  });

  it("includes the reason from the unmatched server", () => {
    const server = makeUnmatched({
      name: "custom",
      reason: "No matching chapter App found for server \"custom\"",
    });
    const warning = formatWarning(server);

    expect(warning).toContain('No matching chapter App found for server "custom"');
  });

  it("produces a multi-line string", () => {
    const server = makeUnmatched({ name: "test" });
    const warning = formatWarning(server);
    const lines = warning.split("\n");

    expect(lines.length).toBe(4);
    expect(lines[0]).toContain("WARNING: Dropping unmatched MCP server");
    expect(lines[1]).toContain("\u2192");
    expect(lines[2]).toContain("\u2192");
    expect(lines[3]).toContain("\u2192");
  });
});

describe("generateWarnings", () => {
  it("returns empty array when no unmatched servers", () => {
    const warnings = generateWarnings([]);
    expect(warnings).toEqual([]);
  });

  it("returns one warning per unmatched server", () => {
    const unmatched = [
      makeUnmatched({ name: "personal-notes" }),
      makeUnmatched({ name: "my-local-db" }),
      makeUnmatched({ name: "custom-api" }),
    ];

    const warnings = generateWarnings(unmatched);

    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toContain('"personal-notes"');
    expect(warnings[1]).toContain('"my-local-db"');
    expect(warnings[2]).toContain('"custom-api"');
  });

  it("each warning follows the PRD format", () => {
    const unmatched = [makeUnmatched({ name: "test-server" })];
    const warnings = generateWarnings(unmatched);

    expect(warnings).toHaveLength(1);
    const warning = warnings[0]!;
    expect(warning).toContain("[chapter run-acp-agent] WARNING:");
    expect(warning).toContain("Agent will not have access to tools from this server");
    expect(warning).toContain("To govern this server, create a chapter App package for it");
  });
});
