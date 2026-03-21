import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ResolvedRole, ResolvedSkill, ResolvedTask, AgentSkillConfig } from "@clawmasons/shared";
import {
  PROVIDER_ENV_VARS,
  collectAllSkills,
  collectAllTasks,
  findRolesForTask,
  formatPermittedTools,
  generateAgentLaunchJson,
  readSkills,
  materializeSkills,
} from "../src/helpers.js";
import type { AgentPackage } from "../src/types.js";

// ── Test Fixtures ─────────────────────────────────────────────────────────────

function makeSkill(name: string): ResolvedSkill {
  return {
    name,
    version: "1.0.0",
    description: `${name} description`,
    artifacts: ["./README.md", "./examples/"],
  };
}

function makeTask(name: string): ResolvedTask {
  return {
    name,
    version: "1.0.0",
    prompt: "./prompts/task.md",
  };
}

function makeRole(name: string, tasks: ResolvedTask[] = [], skills: ResolvedSkill[] = []): ResolvedRole {
  return {
    name,
    version: "1.0.0",
    description: `${name} description`,
    risk: "LOW",
    permissions: {
      "@clawmasons/app-github": {
        allow: ["read_file", "write_file"],
        deny: [],
      },
    },
    tasks,
    apps: [],
    skills,
  };
}

function makeAgentPackage(overrides?: Partial<AgentPackage>): AgentPackage {
  return {
    name: "test-runtime",
    materializer: {
      name: "test-runtime",
      materializeWorkspace: () => new Map(),
    },
    runtime: {
      command: "test-cmd",
      args: ["--flag"],
    },
    acp: {
      command: "test-acp-cmd",
    },
    ...overrides,
  };
}

// ── PROVIDER_ENV_VARS ─────────────────────────────────────────────────────────

describe("PROVIDER_ENV_VARS", () => {
  it("maps openrouter to OPENROUTER_API_KEY", () => {
    expect(PROVIDER_ENV_VARS["openrouter"]).toBe("OPENROUTER_API_KEY");
  });

  it("maps anthropic to ANTHROPIC_API_KEY", () => {
    expect(PROVIDER_ENV_VARS["anthropic"]).toBe("ANTHROPIC_API_KEY");
  });

  it("maps openai to OPENAI_API_KEY", () => {
    expect(PROVIDER_ENV_VARS["openai"]).toBe("OPENAI_API_KEY");
  });

  it("maps google to GEMINI_API_KEY", () => {
    expect(PROVIDER_ENV_VARS["google"]).toBe("GEMINI_API_KEY");
  });

  it("maps mistral to MISTRAL_API_KEY", () => {
    expect(PROVIDER_ENV_VARS["mistral"]).toBe("MISTRAL_API_KEY");
  });

  it("maps groq to GROQ_API_KEY", () => {
    expect(PROVIDER_ENV_VARS["groq"]).toBe("GROQ_API_KEY");
  });

  it("maps xai to XAI_API_KEY", () => {
    expect(PROVIDER_ENV_VARS["xai"]).toBe("XAI_API_KEY");
  });

  it("maps azure-openai to AZURE_OPENAI_API_KEY", () => {
    expect(PROVIDER_ENV_VARS["azure-openai"]).toBe("AZURE_OPENAI_API_KEY");
  });

  it("contains exactly 8 providers", () => {
    expect(Object.keys(PROVIDER_ENV_VARS)).toHaveLength(8);
  });
});

// ── formatPermittedTools ──────────────────────────────────────────────────────

describe("formatPermittedTools", () => {
  it("formats a single app's tools", () => {
    const result = formatPermittedTools({
      "@clawmasons/app-github": { allow: ["read_file", "write_file"], deny: [] },
    });
    expect(result).toBe("  - github: read_file, write_file");
  });

  it("formats multiple apps", () => {
    const result = formatPermittedTools({
      "@clawmasons/app-github": { allow: ["create_issue"], deny: [] },
      "@clawmasons/app-slack": { allow: ["send_message"], deny: [] },
    });
    expect(result).toContain("  - github: create_issue");
    expect(result).toContain("  - slack: send_message");
  });

  it("returns empty string for empty permissions", () => {
    expect(formatPermittedTools({})).toBe("");
  });

  it("uses app short name (strips scope prefix)", () => {
    const result = formatPermittedTools({
      "@clawmasons/app-filesystem": { allow: ["list_directory"], deny: [] },
    });
    expect(result).toContain("filesystem: list_directory");
    expect(result).not.toContain("@clawmasons");
  });
});

// ── findRolesForTask ──────────────────────────────────────────────────────────

describe("findRolesForTask", () => {
  it("finds a role that contains the task", () => {
    const task = makeTask("@clawmasons/task-triage");
    const role = makeRole("@clawmasons/role-a", [task]);

    const result = findRolesForTask("@clawmasons/task-triage", [role]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(role);
  });

  it("returns multiple roles that share a task", () => {
    const task = makeTask("@clawmasons/task-shared");
    const roleA = makeRole("@clawmasons/role-a", [task]);
    const roleB = makeRole("@clawmasons/role-b", [task]);

    const result = findRolesForTask("@clawmasons/task-shared", [roleA, roleB]);
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no role has the task", () => {
    const role = makeRole("@clawmasons/role-a", [makeTask("@clawmasons/task-other")]);
    expect(findRolesForTask("@clawmasons/task-missing", [role])).toEqual([]);
  });

  it("returns empty array for empty roles list", () => {
    expect(findRolesForTask("@clawmasons/task-x", [])).toEqual([]);
  });
});

// ── collectAllSkills ──────────────────────────────────────────────────────────

describe("collectAllSkills", () => {
  it("collects skills from role.skills", () => {
    const skill = makeSkill("@clawmasons/skill-labeling");
    const role = makeRole("@clawmasons/role-a", [], [skill]);

    const result = collectAllSkills([role]);
    expect(result.has("@clawmasons/skill-labeling")).toBe(true);
    expect(result.get("@clawmasons/skill-labeling")).toBe(skill);
  });

  it("deduplicates skills appearing in multiple roles", () => {
    const skill = makeSkill("@clawmasons/skill-shared");
    const roleA = makeRole("@clawmasons/role-a", [], [skill]);
    const roleB = makeRole("@clawmasons/role-b", [], [skill]);

    const result = collectAllSkills([roleA, roleB]);
    expect(result.size).toBe(1);
  });

  it("returns empty map for roles with no skills", () => {
    const role = makeRole("@clawmasons/role-a");
    expect(collectAllSkills([role]).size).toBe(0);
  });

  it("returns empty map for empty roles list", () => {
    expect(collectAllSkills([]).size).toBe(0);
  });
});

// ── collectAllTasks ───────────────────────────────────────────────────────────

describe("collectAllTasks", () => {
  it("collects tasks with their owning roles", () => {
    const task = makeTask("@clawmasons/task-triage");
    const role = makeRole("@clawmasons/role-a", [task]);

    const result = collectAllTasks([role]);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe(task);
    expect(result[0][1]).toContain(role);
  });

  it("deduplicates tasks shared across roles", () => {
    const task = makeTask("@clawmasons/task-shared");
    const roleA = makeRole("@clawmasons/role-a", [task]);
    const roleB = makeRole("@clawmasons/role-b", [task]);

    const result = collectAllTasks([roleA, roleB]);
    expect(result).toHaveLength(1);
    // Both roles listed as owners
    expect(result[0][1]).toHaveLength(2);
  });

  it("collects unique tasks from multiple roles", () => {
    const taskA = makeTask("@clawmasons/task-a");
    const taskB = makeTask("@clawmasons/task-b");
    const roleA = makeRole("@clawmasons/role-a", [taskA]);
    const roleB = makeRole("@clawmasons/role-b", [taskB]);

    const result = collectAllTasks([roleA, roleB]);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for roles with no tasks", () => {
    const role = makeRole("@clawmasons/role-a");
    expect(collectAllTasks([role])).toEqual([]);
  });
});

// ── generateAgentLaunchJson ───────────────────────────────────────────────────

describe("generateAgentLaunchJson", () => {
  it("uses runtime command from agentPkg", () => {
    const pkg = makeAgentPackage({ runtime: { command: "my-cmd" } });
    const config = JSON.parse(generateAgentLaunchJson(pkg, []));
    expect(config.command).toBe("my-cmd");
  });

  it("includes runtime args when present", () => {
    const pkg = makeAgentPackage({ runtime: { command: "cmd", args: ["--flag", "--verbose"] } });
    const config = JSON.parse(generateAgentLaunchJson(pkg, []));
    expect(config.args).toEqual(["--flag", "--verbose"]);
  });

  it("omits args field when runtime has no args", () => {
    const pkg = makeAgentPackage({ runtime: { command: "cmd" } });
    const config = JSON.parse(generateAgentLaunchJson(pkg, []));
    expect(config.args).toBeUndefined();
  });

  it("includes role credentials as env type", () => {
    const pkg = makeAgentPackage();
    const config = JSON.parse(generateAgentLaunchJson(pkg, ["MY_TOKEN"]));
    const cred = config.credentials.find((c: { key: string }) => c.key === "MY_TOKEN");
    expect(cred).toBeDefined();
    expect(cred.type).toBe("env");
  });

  it("includes runtime credentials from agentPkg", () => {
    const pkg = makeAgentPackage({
      runtime: {
        command: "cmd",
        credentials: [{ key: "RUNTIME_TOKEN", type: "env" }],
      },
    });
    const config = JSON.parse(generateAgentLaunchJson(pkg, []));
    const cred = config.credentials.find((c: { key: string }) => c.key === "RUNTIME_TOKEN");
    expect(cred).toBeDefined();
  });

  it("does not duplicate runtime credentials already in agentPkg.runtime.credentials", () => {
    const pkg = makeAgentPackage({
      runtime: {
        command: "cmd",
        credentials: [{ key: "SHARED_KEY", type: "env" }],
      },
    });
    const config = JSON.parse(generateAgentLaunchJson(pkg, ["SHARED_KEY"]));
    const matching = config.credentials.filter((c: { key: string }) => c.key === "SHARED_KEY");
    expect(matching).toHaveLength(1);
  });

  it("uses ACP command when acpMode is true", () => {
    const pkg = makeAgentPackage({ acp: { command: "my-acp-cmd" } });
    const config = JSON.parse(generateAgentLaunchJson(pkg, [], true));
    expect(config.command).toBe("my-acp-cmd");
  });

  it("uses ACP command parts — splits into command and args", () => {
    const pkg = makeAgentPackage({ acp: { command: "mcp-agent --acp" } });
    const config = JSON.parse(generateAgentLaunchJson(pkg, [], true));
    expect(config.command).toBe("mcp-agent");
    expect(config.args).toEqual(["--acp"]);
  });

  it("falls back to agent name when no runtime config", () => {
    const pkg = makeAgentPackage({ runtime: undefined, acp: undefined });
    const config = JSON.parse(generateAgentLaunchJson(pkg, []));
    expect(config.command).toBe("test-runtime");
  });

  it("appends instructions as --append-system-prompt flag pair when supportsAppendSystemPrompt is true", () => {
    const pkg = makeAgentPackage({
      runtime: { command: "cmd", args: ["--flag"], supportsAppendSystemPrompt: true },
    });
    const config = JSON.parse(generateAgentLaunchJson(pkg, [], false, "Do the thing"));
    expect(config.args).toEqual(["--flag", "--append-system-prompt", "Do the thing"]);
  });

  it("does not add instructions in ACP mode", () => {
    const pkg = makeAgentPackage({
      runtime: { command: "cmd", args: ["--flag"], supportsAppendSystemPrompt: true },
      acp: { command: "cmd-acp" },
    });
    const config = JSON.parse(generateAgentLaunchJson(pkg, [], true, "Do the thing"));
    expect(config.args).toBeUndefined();
  });

  it("does not add instructions when supportsAppendSystemPrompt is false", () => {
    const pkg = makeAgentPackage({
      runtime: { command: "cmd", args: ["--flag"], supportsAppendSystemPrompt: false },
    });
    const config = JSON.parse(generateAgentLaunchJson(pkg, [], false, "Do the thing"));
    expect(config.args).toEqual(["--flag"]);
  });

  it("does not add instructions when supportsAppendSystemPrompt is absent", () => {
    const pkg = makeAgentPackage({
      runtime: { command: "cmd", args: ["--flag"] },
    });
    const config = JSON.parse(generateAgentLaunchJson(pkg, [], false, "Do the thing"));
    expect(config.args).toEqual(["--flag"]);
  });

  it("does not add instructions when instructions is undefined", () => {
    const pkg = makeAgentPackage({
      runtime: { command: "cmd", args: ["--flag"], supportsAppendSystemPrompt: true },
    });
    const config = JSON.parse(generateAgentLaunchJson(pkg, [], false, undefined));
    expect(config.args).toEqual(["--flag"]);
  });

  it("appends agentArgs after resolved args", () => {
    const pkg = makeAgentPackage({
      runtime: { command: "cmd", args: ["--effort", "max"] },
    });
    const config = JSON.parse(generateAgentLaunchJson(pkg, [], false, undefined, ["--max-turns", "10"]));
    expect(config.args).toEqual(["--effort", "max", "--max-turns", "10"]);
  });

  it("appends agentArgs when no base args exist", () => {
    const pkg = makeAgentPackage({ runtime: { command: "cmd" } });
    const config = JSON.parse(generateAgentLaunchJson(pkg, [], false, undefined, ["--verbose"]));
    expect(config.args).toEqual(["--verbose"]);
  });

  it("does not set args when agentArgs is empty and no base args", () => {
    const pkg = makeAgentPackage({ runtime: { command: "cmd" } });
    const config = JSON.parse(generateAgentLaunchJson(pkg, [], false, undefined, []));
    expect(config.args).toBeUndefined();
  });

  it("appends agentArgs after instructions", () => {
    const pkg = makeAgentPackage({
      runtime: { command: "cmd", supportsAppendSystemPrompt: true },
    });
    const config = JSON.parse(generateAgentLaunchJson(pkg, [], false, "Do the thing", ["--max-turns", "5"]));
    expect(config.args).toEqual(["--append-system-prompt", "Do the thing", "--max-turns", "5"]);
  });

  it("appends initialPrompt as final positional arg", () => {
    const pkg = makeAgentPackage({ runtime: { command: "cmd", args: ["--flag"] } });
    const config = JSON.parse(generateAgentLaunchJson(pkg, [], false, undefined, undefined, "do this task"));
    expect(config.args).toEqual(["--flag", "do this task"]);
  });

  it("places initialPrompt after agentArgs", () => {
    const pkg = makeAgentPackage({ runtime: { command: "cmd" } });
    const config = JSON.parse(generateAgentLaunchJson(pkg, [], false, undefined, ["--extra"], "go"));
    expect(config.args).toEqual(["--extra", "go"]);
  });

  it("places initialPrompt after --append-system-prompt and agentArgs", () => {
    const pkg = makeAgentPackage({
      runtime: { command: "cmd", args: ["--effort", "max"], supportsAppendSystemPrompt: true },
    });
    const config = JSON.parse(generateAgentLaunchJson(pkg, [], false, "sys", ["--extra"], "initial"));
    expect(config.args).toEqual(["--effort", "max", "--append-system-prompt", "sys", "--extra", "initial"]);
  });

  it("does not append initialPrompt when undefined", () => {
    const pkg = makeAgentPackage({ runtime: { command: "cmd", args: ["--flag"] } });
    const config = JSON.parse(generateAgentLaunchJson(pkg, [], false, undefined, undefined, undefined));
    expect(config.args).toEqual(["--flag"]);
  });

  it("does not append initialPrompt when empty string", () => {
    const pkg = makeAgentPackage({ runtime: { command: "cmd", args: ["--flag"] } });
    const config = JSON.parse(generateAgentLaunchJson(pkg, [], false, undefined, undefined, ""));
    expect(config.args).toEqual(["--flag"]);
  });

  it("does not append initialPrompt in ACP mode", () => {
    const pkg = makeAgentPackage({ acp: { command: "cmd-acp" } });
    const config = JSON.parse(generateAgentLaunchJson(pkg, [], true, undefined, undefined, "do this"));
    expect(config.args).toBeUndefined();
  });
});

// ── readSkills ────────────────────────────────────────────────────────────────

describe("readSkills", () => {
  const config: AgentSkillConfig = { projectFolder: "skills" };

  function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "readskills-"));
  }

  it("discovers skill with SKILL.md and reads content into contentMap", () => {
    const tmp = makeTmpDir();
    const skillDir = path.join(tmp, "skills", "labeling");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: Issue Labeling\ndescription: Label taxonomy\n---\nSkill content here");
    fs.mkdirSync(path.join(skillDir, "examples"), { recursive: true });
    fs.writeFileSync(path.join(skillDir, "examples", "example1.md"), "Example content");

    const skills = readSkills(config, tmp);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("Issue Labeling");
    expect(skills[0].description).toBe("Label taxonomy");
    expect(skills[0].artifacts).toContain("SKILL.md");
    expect(skills[0].artifacts).toContain(path.join("examples", "example1.md"));
    expect(skills[0].contentMap?.get("SKILL.md")).toContain("Skill content here");
    expect(skills[0].contentMap?.get(path.join("examples", "example1.md"))).toBe("Example content");

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("skips directories without SKILL.md", () => {
    const tmp = makeTmpDir();
    const noSkillDir = path.join(tmp, "skills", "not-a-skill");
    fs.mkdirSync(noSkillDir, { recursive: true });
    fs.writeFileSync(path.join(noSkillDir, "README.md"), "not a skill");

    const skills = readSkills(config, tmp);
    expect(skills).toHaveLength(0);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("returns empty array for missing projectFolder", () => {
    const tmp = makeTmpDir();
    const skills = readSkills(config, tmp);
    expect(skills).toEqual([]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("uses directory name when SKILL.md has no name frontmatter", () => {
    const tmp = makeTmpDir();
    const skillDir = path.join(tmp, "skills", "my-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "No frontmatter content");

    const skills = readSkills(config, tmp);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("my-skill");

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

// ── materializeSkills ─────────────────────────────────────────────────────────

describe("materializeSkills", () => {
  const config: AgentSkillConfig = { projectFolder: ".claude/skills" };

  it("writes contentMap entries to correct paths", () => {
    const skill: ResolvedSkill = {
      name: "@clawmasons/skill-labeling",
      version: "1.0.0",
      description: "Labeling",
      artifacts: ["SKILL.md", "examples/example1.md"],
      contentMap: new Map([
        ["SKILL.md", "# Labeling skill"],
        ["examples/example1.md", "Example"],
      ]),
    };

    const result = materializeSkills([skill], config);
    expect(result.get(".claude/skills/labeling/SKILL.md")).toBe("# Labeling skill");
    expect(result.get(".claude/skills/labeling/examples/example1.md")).toBe("Example");
  });

  it("derives short name by stripping scope and skill- prefix", () => {
    const skill: ResolvedSkill = {
      name: "@clawmasons/skill-labeling",
      version: "1.0.0",
      description: "test",
      artifacts: ["SKILL.md"],
      contentMap: new Map([["SKILL.md", "content"]]),
    };

    const result = materializeSkills([skill], config);
    expect([...result.keys()]).toEqual([".claude/skills/labeling/SKILL.md"]);
  });

  it("handles unscoped skill name", () => {
    const skill: ResolvedSkill = {
      name: "labeling",
      version: "1.0.0",
      description: "test",
      artifacts: ["SKILL.md"],
      contentMap: new Map([["SKILL.md", "content"]]),
    };

    const result = materializeSkills([skill], config);
    expect(result.has(".claude/skills/labeling/SKILL.md")).toBe(true);
  });

  it("skips skills without contentMap", () => {
    const skill: ResolvedSkill = {
      name: "@clawmasons/skill-empty",
      version: "1.0.0",
      description: "empty",
      artifacts: [],
    };

    const result = materializeSkills([skill], config);
    expect(result.size).toBe(0);
  });
});

// ── readSkills/materializeSkills round-trip ───────────────────────────────────

describe("readSkills + materializeSkills round-trip", () => {
  const config: AgentSkillConfig = { projectFolder: "skills" };

  it("preserves content through write then read", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "roundtrip-"));
    const skill: ResolvedSkill = {
      name: "labeling",
      version: "1.0.0",
      description: "Label taxonomy",
      artifacts: ["SKILL.md", "templates/default.md"],
      contentMap: new Map([
        ["SKILL.md", "---\nname: labeling\ndescription: Label taxonomy\n---\nSkill body"],
        ["templates/default.md", "Template content"],
      ]),
    };

    // Write
    const files = materializeSkills([skill], config);
    for (const [relPath, content] of files) {
      const fullPath = path.join(tmp, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    }

    // Read back
    const readBack = readSkills(config, tmp);
    expect(readBack).toHaveLength(1);
    expect(readBack[0].name).toBe("labeling");
    expect(readBack[0].description).toBe("Label taxonomy");
    expect(readBack[0].contentMap?.get("SKILL.md")).toContain("Skill body");
    expect(readBack[0].contentMap?.get("templates/default.md")).toBe("Template content");

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
