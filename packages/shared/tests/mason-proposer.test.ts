import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  proposeRoleMd,
  readMaterializedRole,
  type ScanResult,
} from "@clawmasons/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = join(
    tmpdir(),
    `mason-proposer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

function makeScanResult(overrides?: Partial<ScanResult>): ScanResult {
  return {
    projectDir: "/tmp/test-project",
    skills: [],
    commands: [],
    mcpServers: [],
    systemPrompt: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("proposeRoleMd", () => {
  it("generates valid ROLE.md from empty scan result", () => {
    const result = proposeRoleMd(makeScanResult());

    expect(result).toContain("---");
    expect(result).toContain("name:");
    expect(result).toContain("description:");
  });

  it("uses custom role name and description", () => {
    const result = proposeRoleMd(makeScanResult(), {
      roleName: "my-role",
      description: "My custom role",
    });

    expect(result).toContain("name: my-role");
    expect(result).toContain("description: My custom role");
  });

  it("includes discovered commands", () => {
    const result = proposeRoleMd(
      makeScanResult({
        commands: [
          { name: "deploy", path: "/tmp/deploy.md", dialect: "claude-code-agent" },
          { name: "test", path: "/tmp/test.md", dialect: "claude-code-agent" },
        ],
      }),
    );

    expect(result).toContain("commands:");
    expect(result).toContain("deploy");
    expect(result).toContain("test");
  });

  it("includes discovered skills", () => {
    const result = proposeRoleMd(
      makeScanResult({
        skills: [
          {
            name: "my-skill",
            path: "/tmp/skills/my-skill",
            dialect: "claude-code-agent",
          },
        ],
      }),
    );

    expect(result).toContain("skills:");
    expect(result).toContain("my-skill");
  });

  it("includes MCP servers with empty allow lists (least-privilege)", () => {
    const result = proposeRoleMd(
      makeScanResult({
        mcpServers: [
          {
            name: "github",
            command: "npx",
            args: ["-y", "@mcp/github"],
            dialect: "claude-code-agent",
          },
        ],
      }),
    );

    expect(result).toContain("mcp:");
    expect(result).toContain("name: github");
    expect(result).toContain("allow: []");
  });

  it("extracts credentials from MCP server env keys with empty values", () => {
    const result = proposeRoleMd(
      makeScanResult({
        mcpServers: [
          {
            name: "github",
            command: "npx",
            env: { GITHUB_TOKEN: "", OTHER_VAR: "has-value" },
            dialect: "claude-code-agent",
          },
        ],
      }),
    );

    expect(result).toContain("credentials:");
    expect(result).toContain("GITHUB_TOKEN");
    // OTHER_VAR has a non-empty value, should not be a credential
    expect(result).not.toContain("OTHER_VAR");
  });

  it("includes default container ignore paths", () => {
    const result = proposeRoleMd(makeScanResult());

    expect(result).toContain(".mason/");
    expect(result).toContain(".claude/");
    expect(result).toContain(".env");
  });

  it("uses system prompt as markdown body", () => {
    const result = proposeRoleMd(
      makeScanResult({
        systemPrompt: "You are a helpful coding assistant.",
      }),
    );

    expect(result).toContain("You are a helpful coding assistant.");
  });

  it("generates placeholder prompt when no system prompt found", () => {
    const result = proposeRoleMd(makeScanResult(), {
      roleName: "code-review",
    });

    expect(result).toContain("code-review role");
  });

  it("proposed ROLE.md parses correctly with readMaterializedRole", async () => {
    const scanResult = makeScanResult({
      commands: [
        { name: "deploy", path: "/tmp/deploy.md", dialect: "claude-code-agent" },
      ],
      skills: [
        { name: "my-skill", path: "/tmp/skills/my-skill", dialect: "claude-code-agent" },
      ],
      mcpServers: [
        {
          name: "github",
          command: "npx",
          args: ["-y", "@mcp/github"],
          env: { GITHUB_TOKEN: "" },
          dialect: "claude-code-agent",
        },
      ],
      systemPrompt: "You are a code reviewer.",
    });

    const roleMd = proposeRoleMd(scanResult, {
      roleName: "code-review",
      description: "Reviews code changes",
    });

    // Write the ROLE.md to a proper directory structure
    const roleDir = join(testDir, ".claude", "roles", "code-review");
    await mkdir(roleDir, { recursive: true });
    await writeFile(join(roleDir, "ROLE.md"), roleMd);

    // Parse with the Change 2 parser
    const parsed = await readMaterializedRole(join(roleDir, "ROLE.md"));

    expect(parsed.metadata.name).toBe("code-review");
    expect(parsed.metadata.description).toBe("Reviews code changes");
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].name).toBe("deploy");
    expect(parsed.skills).toHaveLength(1);
    expect(parsed.skills[0].name).toBe("my-skill");
    expect(parsed.mcp).toHaveLength(1);
    expect(parsed.mcp[0].name).toBe("github");
    expect(parsed.mcp[0].tools.allow).toEqual([]);
    expect(parsed.governance.credentials).toContain("GITHUB_TOKEN");
    expect(parsed.instructions).toContain("You are a code reviewer.");
  });

  it("handles MCP server without command (URL-based)", () => {
    const result = proposeRoleMd(
      makeScanResult({
        mcpServers: [
          {
            name: "remote-server",
            url: "https://example.com/mcp",
            dialect: "claude-code-agent",
          },
        ],
      }),
    );

    expect(result).toContain("name: remote-server");
    // Should not have a command field
    expect(result).not.toContain("command:");
  });

  it("deduplicates credentials from multiple servers", () => {
    const result = proposeRoleMd(
      makeScanResult({
        mcpServers: [
          {
            name: "server-a",
            command: "cmd-a",
            env: { SHARED_TOKEN: "" },
            dialect: "claude-code-agent",
          },
          {
            name: "server-b",
            command: "cmd-b",
            env: { SHARED_TOKEN: "" },
            dialect: "claude-code-agent",
          },
        ],
      }),
    );

    // SHARED_TOKEN should appear only once in credentials
    const matches = result.match(/SHARED_TOKEN/g);
    // Appears once in credentials list (not in env since we don't emit env)
    expect(matches).toHaveLength(1);
  });
});
