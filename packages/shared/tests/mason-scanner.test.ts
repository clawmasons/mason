import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanProject } from "@clawmasons/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `mason-scanner-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

async function createFile(relativePath: string, content: string): Promise<void> {
  const fullPath = join(testDir, relativePath);
  await mkdir(join(fullPath, ".."), { recursive: true });
  await writeFile(fullPath, content);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scanProject", () => {
  describe("skills discovery", () => {
    it("discovers skills in .claude/skills/", async () => {
      await createFile(".claude/skills/my-skill/SKILL.md", "# My Skill");

      const result = await scanProject(testDir);

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe("my-skill");
      expect(result.skills[0].path).toBe(join(testDir, ".claude/skills/my-skill"));
      expect(result.skills[0].dialect).toBe("claude-code");
    });

    it("discovers skills across multiple dialects", async () => {
      await createFile(".claude/skills/claude-skill/SKILL.md", "# Claude Skill");
      await createFile(".codex/skills/codex-skill/SKILL.md", "# Codex Skill");

      const result = await scanProject(testDir);

      expect(result.skills).toHaveLength(2);

      const claudeSkill = result.skills.find((s) => s.name === "claude-skill");
      const codexSkill = result.skills.find((s) => s.name === "codex-skill");

      expect(claudeSkill?.dialect).toBe("claude-code");
      expect(codexSkill?.dialect).toBe("codex");
    });

    it("ignores directories without SKILL.md", async () => {
      await createFile(".claude/skills/no-skill/README.md", "# Not a skill");

      const result = await scanProject(testDir);

      expect(result.skills).toHaveLength(0);
    });

    it("discovers multiple skills", async () => {
      await createFile(".claude/skills/skill-a/SKILL.md", "# Skill A");
      await createFile(".claude/skills/skill-b/SKILL.md", "# Skill B");

      const result = await scanProject(testDir);

      expect(result.skills).toHaveLength(2);
      const names = result.skills.map((s) => s.name).sort();
      expect(names).toEqual(["skill-a", "skill-b"]);
    });
  });

  describe("commands discovery", () => {
    it("discovers commands in .claude/commands/", async () => {
      await createFile(".claude/commands/deploy.md", "# Deploy command");

      const result = await scanProject(testDir);

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].name).toBe("deploy");
      expect(result.commands[0].dialect).toBe("claude-code");
    });

    it("discovers commands in subdirectories", async () => {
      await createFile(".claude/commands/opsx/deploy.md", "# Deploy command");

      const result = await scanProject(testDir);

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].name).toBe("opsx/deploy");
    });

    it("ignores non-.md files in commands", async () => {
      await createFile(".claude/commands/script.sh", "#!/bin/bash");

      const result = await scanProject(testDir);

      expect(result.commands).toHaveLength(0);
    });
  });

  describe("MCP server discovery", () => {
    it("discovers MCP servers from settings.json", async () => {
      const settings = {
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "@mcp/github"],
            env: { GITHUB_TOKEN: "" },
          },
        },
      };
      await createFile(".claude/settings.json", JSON.stringify(settings));

      const result = await scanProject(testDir);

      expect(result.mcpServers).toHaveLength(1);
      expect(result.mcpServers[0].name).toBe("github");
      expect(result.mcpServers[0].command).toBe("npx");
      expect(result.mcpServers[0].args).toEqual(["-y", "@mcp/github"]);
      expect(result.mcpServers[0].env).toEqual({ GITHUB_TOKEN: "" });
      expect(result.mcpServers[0].dialect).toBe("claude-code");
    });

    it("merges settings.json and settings.local.json", async () => {
      const base = {
        mcpServers: {
          github: { command: "npx", args: ["-y", "@mcp/github"] },
        },
      };
      const local = {
        mcpServers: {
          linear: { command: "npx", args: ["-y", "@mcp/linear"] },
        },
      };
      await createFile(".claude/settings.json", JSON.stringify(base));
      await createFile(".claude/settings.local.json", JSON.stringify(local));

      const result = await scanProject(testDir);

      expect(result.mcpServers).toHaveLength(2);
      const names = result.mcpServers.map((s) => s.name).sort();
      expect(names).toEqual(["github", "linear"]);
    });

    it("local settings override base for same server name", async () => {
      const base = {
        mcpServers: {
          github: { command: "old-cmd" },
        },
      };
      const local = {
        mcpServers: {
          github: { command: "new-cmd" },
        },
      };
      await createFile(".claude/settings.json", JSON.stringify(base));
      await createFile(".claude/settings.local.json", JSON.stringify(local));

      const result = await scanProject(testDir);

      expect(result.mcpServers).toHaveLength(1);
      expect(result.mcpServers[0].command).toBe("new-cmd");
    });

    it("discovers MCP server with URL", async () => {
      const settings = {
        mcpServers: {
          remote: { url: "https://example.com/mcp" },
        },
      };
      await createFile(".claude/settings.json", JSON.stringify(settings));

      const result = await scanProject(testDir);

      expect(result.mcpServers).toHaveLength(1);
      expect(result.mcpServers[0].url).toBe("https://example.com/mcp");
    });
  });

  describe("system prompt discovery", () => {
    it("reads system prompt from CLAUDE.md", async () => {
      await createFile("CLAUDE.md", "You are a helpful assistant.");

      const result = await scanProject(testDir);

      expect(result.systemPrompt).toBe("You are a helpful assistant.");
    });

    it("falls back to AGENTS.md", async () => {
      await createFile("AGENTS.md", "Agent instructions here.");

      const result = await scanProject(testDir);

      expect(result.systemPrompt).toBe("Agent instructions here.");
    });

    it("prefers CLAUDE.md over AGENTS.md", async () => {
      await createFile("CLAUDE.md", "From CLAUDE.md");
      await createFile("AGENTS.md", "From AGENTS.md");

      const result = await scanProject(testDir);

      expect(result.systemPrompt).toBe("From CLAUDE.md");
    });

    it("returns undefined when no prompt file exists", async () => {
      const result = await scanProject(testDir);

      expect(result.systemPrompt).toBeUndefined();
    });
  });

  describe("graceful handling", () => {
    it("handles project with no agent directories", async () => {
      const result = await scanProject(testDir);

      expect(result.skills).toHaveLength(0);
      expect(result.commands).toHaveLength(0);
      expect(result.mcpServers).toHaveLength(0);
      expect(result.systemPrompt).toBeUndefined();
      expect(result.projectDir).toBe(testDir);
    });

    it("handles agent directory with no skills/commands subdirectories", async () => {
      await mkdir(join(testDir, ".claude"), { recursive: true });

      const result = await scanProject(testDir);

      expect(result.skills).toHaveLength(0);
      expect(result.commands).toHaveLength(0);
    });

    it("handles invalid JSON in settings file", async () => {
      await createFile(".claude/settings.json", "not valid json {{{");

      const result = await scanProject(testDir);

      expect(result.mcpServers).toHaveLength(0);
    });
  });
});
