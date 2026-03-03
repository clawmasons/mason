import { describe, expect, it } from "vitest";
import { generateLockFile } from "../../src/compose/lock.js";
import type { ResolvedAgent, ResolvedApp, ResolvedRole, ResolvedSkill, ResolvedTask } from "../../src/resolver/types.js";

function makeGithubApp(): ResolvedApp {
  return {
    name: "@clawforge/app-github",
    version: "1.2.0",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    tools: ["create_issue", "list_repos"],
    capabilities: ["tools"],
  };
}

function makeLabelingSkill(): ResolvedSkill {
  return {
    name: "@clawforge/skill-labeling",
    version: "1.0.0",
    artifacts: ["./SKILL.md"],
    description: "Issue labeling taxonomy",
  };
}

function makeTriageTask(): ResolvedTask {
  return {
    name: "@clawforge/task-triage-issue",
    version: "0.3.1",
    taskType: "subagent",
    prompt: "./prompts/triage.md",
    apps: [makeGithubApp()],
    skills: [makeLabelingSkill()],
    subTasks: [],
  };
}

function makeRepoOpsAgent(): ResolvedAgent {
  const issueManager: ResolvedRole = {
    name: "@clawforge/role-issue-manager",
    version: "2.0.0",
    permissions: {
      "@clawforge/app-github": {
        allow: ["create_issue", "list_repos"],
        deny: [],
      },
    },
    tasks: [makeTriageTask()],
    apps: [makeGithubApp()],
    skills: [makeLabelingSkill()],
  };

  return {
    name: "@clawforge/agent-repo-ops",
    version: "1.0.0",
    runtimes: ["claude-code", "codex"],
    roles: [issueManager],
  };
}

describe("generateLockFile", () => {
  describe("lock version", () => {
    it("includes lockVersion: 1", () => {
      const agent = makeRepoOpsAgent();
      const lock = generateLockFile(agent, []);
      expect(lock.lockVersion).toBe(1);
    });
  });

  describe("agent metadata", () => {
    it("captures agent name", () => {
      const agent = makeRepoOpsAgent();
      const lock = generateLockFile(agent, []);
      expect(lock.agent.name).toBe("@clawforge/agent-repo-ops");
    });

    it("captures agent version", () => {
      const agent = makeRepoOpsAgent();
      const lock = generateLockFile(agent, []);
      expect(lock.agent.version).toBe("1.0.0");
    });

    it("captures runtimes", () => {
      const agent = makeRepoOpsAgent();
      const lock = generateLockFile(agent, []);
      expect(lock.agent.runtimes).toEqual(["claude-code", "codex"]);
    });
  });

  describe("roles", () => {
    it("includes role name and version", () => {
      const agent = makeRepoOpsAgent();
      const lock = generateLockFile(agent, []);
      expect(lock.roles).toHaveLength(1);
      expect(lock.roles[0].name).toBe("@clawforge/role-issue-manager");
      expect(lock.roles[0].version).toBe("2.0.0");
    });

    it("includes role tasks with name and version", () => {
      const agent = makeRepoOpsAgent();
      const lock = generateLockFile(agent, []);
      expect(lock.roles[0].tasks).toEqual([
        { name: "@clawforge/task-triage-issue", version: "0.3.1" },
      ]);
    });

    it("includes role apps with name and version", () => {
      const agent = makeRepoOpsAgent();
      const lock = generateLockFile(agent, []);
      expect(lock.roles[0].apps).toEqual([
        { name: "@clawforge/app-github", version: "1.2.0" },
      ]);
    });

    it("includes role skills with name and version", () => {
      const agent = makeRepoOpsAgent();
      const lock = generateLockFile(agent, []);
      expect(lock.roles[0].skills).toEqual([
        { name: "@clawforge/skill-labeling", version: "1.0.0" },
      ]);
    });
  });

  describe("generated files", () => {
    it("includes provided file paths", () => {
      const agent = makeRepoOpsAgent();
      const files = ["docker-compose.yml", "mcp-proxy/config.json", ".env"];
      const lock = generateLockFile(agent, files);
      expect(lock.generatedFiles).toContain("docker-compose.yml");
      expect(lock.generatedFiles).toContain("mcp-proxy/config.json");
      expect(lock.generatedFiles).toContain(".env");
    });

    it("sorts generated files", () => {
      const agent = makeRepoOpsAgent();
      const files = ["docker-compose.yml", ".env", "mcp-proxy/config.json"];
      const lock = generateLockFile(agent, files);
      expect(lock.generatedFiles).toEqual([".env", "docker-compose.yml", "mcp-proxy/config.json"]);
    });
  });

  describe("determinism", () => {
    it("produces identical JSON for identical inputs", () => {
      const agent = makeRepoOpsAgent();
      const files = ["docker-compose.yml", ".env"];

      const lock1 = generateLockFile(agent, files);
      const lock2 = generateLockFile(agent, files);

      expect(JSON.stringify(lock1)).toBe(JSON.stringify(lock2));
    });
  });

  describe("JSON serialization", () => {
    it("produces valid JSON", () => {
      const agent = makeRepoOpsAgent();
      const lock = generateLockFile(agent, ["docker-compose.yml"]);
      const json = JSON.stringify(lock, null, 2);
      const parsed = JSON.parse(json);

      expect(parsed.lockVersion).toBe(1);
      expect(parsed.agent).toBeDefined();
      expect(parsed.roles).toBeDefined();
      expect(parsed.generatedFiles).toBeDefined();
    });
  });
});
