import { describe, expect, it } from "vitest";
import type { ResolvedRole, ResolvedSkill, ResolvedTask } from "@clawmasons/shared";
import {
  PROVIDER_ENV_VARS,
  collectAllSkills,
  collectAllTasks,
  findRolesForTask,
  formatPermittedTools,
  generateAgentLaunchJson,
  generateSkillReadme,
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

function makeTask(name: string, skills: ResolvedSkill[] = []): ResolvedTask {
  return {
    name,
    version: "1.0.0",
    taskType: "subagent",
    prompt: "./prompts/task.md",
    requiredApps: [],
    apps: [],
    skills,
    subTasks: [],
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

  it("collects skills from task.skills", () => {
    const skill = makeSkill("@clawmasons/skill-from-task");
    const task = makeTask("@clawmasons/task-x", [skill]);
    const role = makeRole("@clawmasons/role-a", [task]);

    const result = collectAllSkills([role]);
    expect(result.has("@clawmasons/skill-from-task")).toBe(true);
  });

  it("deduplicates skills appearing in multiple roles", () => {
    const skill = makeSkill("@clawmasons/skill-shared");
    const roleA = makeRole("@clawmasons/role-a", [], [skill]);
    const roleB = makeRole("@clawmasons/role-b", [], [skill]);

    const result = collectAllSkills([roleA, roleB]);
    expect(result.size).toBe(1);
  });

  it("deduplicates skill from both role.skills and task.skills", () => {
    const skill = makeSkill("@clawmasons/skill-dup");
    const task = makeTask("@clawmasons/task-x", [skill]);
    const role = makeRole("@clawmasons/role-a", [task], [skill]);

    const result = collectAllSkills([role]);
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

// ── generateSkillReadme ───────────────────────────────────────────────────────

describe("generateSkillReadme", () => {
  it("includes skill short name in header", () => {
    const skill = makeSkill("@clawmasons/skill-labeling");
    const result = generateSkillReadme(skill);
    expect(result).toContain("# labeling");
  });

  it("includes skill description", () => {
    const skill = makeSkill("@clawmasons/skill-labeling");
    skill.description = "Issue labeling taxonomy and heuristics";
    const result = generateSkillReadme(skill);
    expect(result).toContain("Issue labeling taxonomy and heuristics");
  });

  it("includes artifacts section with each artifact listed", () => {
    const skill = makeSkill("@clawmasons/skill-x");
    skill.artifacts = ["./SKILL.md", "./examples/", "./schemas/"];
    const result = generateSkillReadme(skill);
    expect(result).toContain("## Artifacts");
    expect(result).toContain("./SKILL.md");
    expect(result).toContain("./examples/");
    expect(result).toContain("./schemas/");
  });

  it("handles skills with no artifacts", () => {
    const skill = makeSkill("@clawmasons/skill-empty");
    skill.artifacts = [];
    const result = generateSkillReadme(skill);
    expect(result).toContain("## Artifacts");
  });
});
