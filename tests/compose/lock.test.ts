import { describe, expect, it } from "vitest";
import { generateLockFile } from "../../src/compose/lock.js";
import type { ResolvedMember, ResolvedApp, ResolvedRole, ResolvedSkill, ResolvedTask } from "../../src/resolver/types.js";

function makeGithubApp(): ResolvedApp {
  return {
    name: "@clawmasons/app-github",
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
    name: "@clawmasons/skill-labeling",
    version: "1.0.0",
    artifacts: ["./SKILL.md"],
    description: "Issue labeling taxonomy",
  };
}

function makeTriageTask(): ResolvedTask {
  return {
    name: "@clawmasons/task-triage-issue",
    version: "0.3.1",
    taskType: "subagent",
    prompt: "./prompts/triage.md",
    apps: [makeGithubApp()],
    skills: [makeLabelingSkill()],
    subTasks: [],
  };
}

function makeRepoOpsMember(): ResolvedMember {
  const issueManager: ResolvedRole = {
    name: "@clawmasons/role-issue-manager",
    version: "2.0.0",
    permissions: {
      "@clawmasons/app-github": {
        allow: ["create_issue", "list_repos"],
        deny: [],
      },
    },
    tasks: [makeTriageTask()],
    apps: [makeGithubApp()],
    skills: [makeLabelingSkill()],
  };

  return {
    name: "@clawmasons/member-repo-ops",
    version: "1.0.0",
    memberType: "agent",
    memberName: "Repo Ops",
    slug: "repo-ops",
    email: "repo-ops@chapter.local",
    authProviders: [],
    runtimes: ["claude-code", "codex"],
    roles: [issueManager],
  };
}

describe("generateLockFile", () => {
  describe("lock version", () => {
    it("includes lockVersion: 1", () => {
      const member = makeRepoOpsMember();
      const lock = generateLockFile(member, []);
      expect(lock.lockVersion).toBe(1);
    });
  });

  describe("member metadata", () => {
    it("captures member name", () => {
      const member = makeRepoOpsMember();
      const lock = generateLockFile(member, []);
      expect(lock.member.name).toBe("@clawmasons/member-repo-ops");
    });

    it("captures member version", () => {
      const member = makeRepoOpsMember();
      const lock = generateLockFile(member, []);
      expect(lock.member.version).toBe("1.0.0");
    });

    it("captures memberType", () => {
      const member = makeRepoOpsMember();
      const lock = generateLockFile(member, []);
      expect(lock.member.memberType).toBe("agent");
    });

    it("captures runtimes", () => {
      const member = makeRepoOpsMember();
      const lock = generateLockFile(member, []);
      expect(lock.member.runtimes).toEqual(["claude-code", "codex"]);
    });
  });

  describe("roles", () => {
    it("includes role name and version", () => {
      const member = makeRepoOpsMember();
      const lock = generateLockFile(member, []);
      expect(lock.roles).toHaveLength(1);
      expect(lock.roles[0].name).toBe("@clawmasons/role-issue-manager");
      expect(lock.roles[0].version).toBe("2.0.0");
    });

    it("includes role tasks with name and version", () => {
      const member = makeRepoOpsMember();
      const lock = generateLockFile(member, []);
      expect(lock.roles[0].tasks).toEqual([
        { name: "@clawmasons/task-triage-issue", version: "0.3.1" },
      ]);
    });

    it("includes role apps with name and version", () => {
      const member = makeRepoOpsMember();
      const lock = generateLockFile(member, []);
      expect(lock.roles[0].apps).toEqual([
        { name: "@clawmasons/app-github", version: "1.2.0" },
      ]);
    });

    it("includes role skills with name and version", () => {
      const member = makeRepoOpsMember();
      const lock = generateLockFile(member, []);
      expect(lock.roles[0].skills).toEqual([
        { name: "@clawmasons/skill-labeling", version: "1.0.0" },
      ]);
    });
  });

  describe("generated files", () => {
    it("includes provided file paths", () => {
      const member = makeRepoOpsMember();
      const files = ["docker-compose.yml", "chapter-proxy/Dockerfile", ".env"];
      const lock = generateLockFile(member, files);
      expect(lock.generatedFiles).toContain("docker-compose.yml");
      expect(lock.generatedFiles).toContain("chapter-proxy/Dockerfile");
      expect(lock.generatedFiles).toContain(".env");
    });

    it("sorts generated files", () => {
      const member = makeRepoOpsMember();
      const files = ["docker-compose.yml", ".env", "chapter-proxy/Dockerfile"];
      const lock = generateLockFile(member, files);
      expect(lock.generatedFiles).toEqual([".env", "chapter-proxy/Dockerfile", "docker-compose.yml"]);
    });
  });

  describe("determinism", () => {
    it("produces identical JSON for identical inputs", () => {
      const member = makeRepoOpsMember();
      const files = ["docker-compose.yml", ".env"];

      const lock1 = generateLockFile(member, files);
      const lock2 = generateLockFile(member, files);

      expect(JSON.stringify(lock1)).toBe(JSON.stringify(lock2));
    });
  });

  describe("JSON serialization", () => {
    it("produces valid JSON", () => {
      const member = makeRepoOpsMember();
      const lock = generateLockFile(member, ["docker-compose.yml"]);
      const json = JSON.stringify(lock, null, 2);
      const parsed = JSON.parse(json);

      expect(parsed.lockVersion).toBe(1);
      expect(parsed.member).toBeDefined();
      expect(parsed.roles).toBeDefined();
      expect(parsed.generatedFiles).toBeDefined();
    });
  });
});
