import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ResolvedTask } from "@clawmasons/shared";
import { readTasks, materializeTasks } from "../src/helpers.js";
import type { AgentTaskConfig } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tasks-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relativePath: string, content: string): void {
  const full = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

// ── AgentTaskConfig fixtures ─────────────────────────────────────────────

const claudeConfig: AgentTaskConfig = {
  projectFolder: ".claude/commands",
  nameFormat: "{scopePath}/{taskName}.md",
  scopeFormat: "path",
  supportedFields: ["name->displayName", "description", "category", "tags"],
  prompt: "markdown-body",
};

const piConfig: AgentTaskConfig = {
  projectFolder: ".pi/prompts",
  nameFormat: "{scopeKebab}-{taskName}.md",
  scopeFormat: "kebab-case-prefix",
  supportedFields: ["description"],
  prompt: "markdown-body",
};

const allFieldsConfig: AgentTaskConfig = {
  projectFolder: ".mason/tasks",
  nameFormat: "{scopeKebab}-{taskName}.md",
  scopeFormat: "kebab-case-prefix",
  supportedFields: "all",
  prompt: "markdown-body",
};

// ── materializeTasks ─────────────────────────────────────────────────────

describe("materializeTasks", () => {
  it("generates correct path for scoped task with path format", () => {
    const tasks: ResolvedTask[] = [
      { name: "fix-bug", version: "0.0.0", scope: "ops:triage", prompt: "Fix the bug" },
    ];
    const result = materializeTasks(tasks, claudeConfig);
    expect(result.size).toBe(1);
    expect(result.has(".claude/commands/ops/triage/fix-bug.md")).toBe(true);
  });

  it("generates correct path for scoped task with kebab format", () => {
    const tasks: ResolvedTask[] = [
      { name: "fix-bug", version: "0.0.0", scope: "ops:triage", prompt: "Fix the bug" },
    ];
    const result = materializeTasks(tasks, piConfig);
    expect(result.size).toBe(1);
    expect(result.has(".pi/prompts/ops-triage-fix-bug.md")).toBe(true);
  });

  it("generates correct path for no-scope task with path format", () => {
    const tasks: ResolvedTask[] = [
      { name: "hello", version: "0.0.0", prompt: "Say hello" },
    ];
    const result = materializeTasks(tasks, claudeConfig);
    expect(result.has(".claude/commands/hello.md")).toBe(true);
  });

  it("generates correct path for no-scope task with kebab format", () => {
    const tasks: ResolvedTask[] = [
      { name: "hello", version: "0.0.0", prompt: "Say hello" },
    ];
    const result = materializeTasks(tasks, piConfig);
    expect(result.has(".pi/prompts/hello.md")).toBe(true);
  });

  it("includes frontmatter for supported fields with arrow mapping", () => {
    const tasks: ResolvedTask[] = [
      {
        name: "triage",
        version: "0.0.0",
        displayName: "Triage Issues",
        description: "Triage incoming issues",
        category: "ops",
        tags: ["ops", "triage"],
        prompt: "Do the triage",
      },
    ];
    const result = materializeTasks(tasks, claudeConfig);
    const content = result.get(".claude/commands/triage.md")!;

    // "name->displayName" means frontmatter key "name" maps to property "displayName"
    expect(content).toContain("name: Triage Issues");
    expect(content).toContain("description: Triage incoming issues");
    expect(content).toContain("category: ops");
    expect(content).toContain("tags:");
    expect(content).toContain("Do the triage");
    expect(content).toMatch(/^---\n/);
  });

  it("omits frontmatter when no supported fields have values", () => {
    const tasks: ResolvedTask[] = [
      { name: "simple", version: "0.0.0", prompt: "Just do it" },
    ];
    const result = materializeTasks(tasks, piConfig);
    const content = result.get(".pi/prompts/simple.md")!;
    expect(content).not.toContain("---");
    expect(content).toBe("Just do it");
  });

  it("only includes fields defined in supportedFields", () => {
    const tasks: ResolvedTask[] = [
      {
        name: "triage",
        version: "0.0.0",
        displayName: "Triage Issues",
        description: "Triage incoming issues",
        category: "ops",
        tags: ["ops"],
        prompt: "Do the triage",
      },
    ];
    // piConfig only supports "description"
    const result = materializeTasks(tasks, piConfig);
    const content = result.get(".pi/prompts/triage.md")!;

    expect(content).toContain("description: Triage incoming issues");
    expect(content).not.toContain("displayName");
    expect(content).not.toContain("category");
    expect(content).not.toContain("tags");
  });

  it("handles 'all' supportedFields", () => {
    const tasks: ResolvedTask[] = [
      {
        name: "triage",
        version: "0.0.0",
        displayName: "Triage Issues",
        description: "Triage incoming issues",
        category: "ops",
        tags: ["ops", "triage"],
        prompt: "Do the triage",
      },
    ];
    const result = materializeTasks(tasks, allFieldsConfig);
    const content = result.get(".mason/tasks/triage.md")!;

    expect(content).toContain("displayName: Triage Issues");
    expect(content).toContain("description: Triage incoming issues");
    expect(content).toContain("category: ops");
    expect(content).toContain("tags:");
  });

  it("materializes multiple tasks", () => {
    const tasks: ResolvedTask[] = [
      { name: "task-a", version: "0.0.0", scope: "ops", prompt: "A" },
      { name: "task-b", version: "0.0.0", scope: "dev", prompt: "B" },
      { name: "task-c", version: "0.0.0", prompt: "C" },
    ];
    const result = materializeTasks(tasks, claudeConfig);
    expect(result.size).toBe(3);
    expect(result.has(".claude/commands/ops/task-a.md")).toBe(true);
    expect(result.has(".claude/commands/dev/task-b.md")).toBe(true);
    expect(result.has(".claude/commands/task-c.md")).toBe(true);
  });

  it("handles empty task list", () => {
    const result = materializeTasks([], claudeConfig);
    expect(result.size).toBe(0);
  });

  it("handles task with empty prompt", () => {
    const tasks: ResolvedTask[] = [
      { name: "empty", version: "0.0.0", description: "No prompt" },
    ];
    const result = materializeTasks(tasks, claudeConfig);
    const content = result.get(".claude/commands/empty.md")!;
    expect(content).toContain("description: No prompt");
  });
});

// ── readTasks ────────────────────────────────────────────────────────────

describe("readTasks", () => {
  it("reads a simple task from path-scoped layout", () => {
    writeFile(".claude/commands/hello.md", "Say hello");
    const tasks = readTasks(claudeConfig, tmpDir);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe("hello");
    expect(tasks[0].scope).toBe("");
    expect(tasks[0].prompt).toBe("Say hello");
  });

  it("reads scoped tasks from nested directories", () => {
    writeFile(".claude/commands/ops/triage/fix-bug.md", "Fix the bug");
    const tasks = readTasks(claudeConfig, tmpDir);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe("fix-bug");
    expect(tasks[0].scope).toBe("ops:triage");
    expect(tasks[0].prompt).toBe("Fix the bug");
  });

  it("reads frontmatter with arrow mapping", () => {
    writeFile(".claude/commands/triage.md", `---
name: Triage Issues
description: Triage incoming issues
category: ops
tags:
  - ops
  - triage
---
Do the triage`);
    const tasks = readTasks(claudeConfig, tmpDir);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe("triage"); // derived from filename
    expect(tasks[0].displayName).toBe("Triage Issues"); // "name->displayName" mapping
    expect(tasks[0].description).toBe("Triage incoming issues");
    expect(tasks[0].category).toBe("ops");
    expect(tasks[0].tags).toEqual(["ops", "triage"]);
    expect(tasks[0].prompt).toBe("Do the triage");
  });

  it("reads flat kebab-prefix files", () => {
    writeFile(".pi/prompts/fix-bug.md", "Fix the bug");
    const tasks = readTasks(piConfig, tmpDir);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe("fix-bug");
    expect(tasks[0].prompt).toBe("Fix the bug");
  });

  it("reads description from frontmatter for pi config", () => {
    writeFile(".pi/prompts/triage.md", `---
description: Triage incoming issues
---
Do the triage`);
    const tasks = readTasks(piConfig, tmpDir);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].description).toBe("Triage incoming issues");
    expect(tasks[0].prompt).toBe("Do the triage");
  });

  it("returns empty array for non-existent directory", () => {
    const tasks = readTasks(claudeConfig, tmpDir);
    expect(tasks).toEqual([]);
  });

  it("reads multiple tasks", () => {
    writeFile(".claude/commands/task-a.md", "A");
    writeFile(".claude/commands/ops/task-b.md", "B");
    writeFile(".claude/commands/ops/triage/task-c.md", "C");
    const tasks = readTasks(claudeConfig, tmpDir);

    expect(tasks).toHaveLength(3);
    const names = tasks.map((t) => t.name).sort();
    expect(names).toEqual(["task-a", "task-b", "task-c"]);
  });

  it("ignores non-md files", () => {
    writeFile(".claude/commands/hello.md", "Hello");
    writeFile(".claude/commands/readme.txt", "Not a task");
    const tasks = readTasks(claudeConfig, tmpDir);
    expect(tasks).toHaveLength(1);
  });

  it("handles file with frontmatter but no body", () => {
    writeFile(".claude/commands/meta-only.md", `---
description: Only metadata
---
`);
    const tasks = readTasks(claudeConfig, tmpDir);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].description).toBe("Only metadata");
    expect(tasks[0].prompt).toBeUndefined();
  });

  it("does not recurse for kebab-case-prefix scopeFormat", () => {
    writeFile(".pi/prompts/top.md", "Top");
    writeFile(".pi/prompts/subdir/nested.md", "Nested");
    const tasks = readTasks(piConfig, tmpDir);

    // Should only find top-level file
    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe("top");
  });
});

// ── Round-trip ───────────────────────────────────────────────────────────

describe("round-trip: materializeTasks → readTasks", () => {
  it("round-trips a scoped task through claude (path) format", () => {
    const original: ResolvedTask[] = [
      {
        name: "fix-bug",
        version: "0.0.0",
        scope: "ops:triage",
        displayName: "Fix Bug",
        description: "Fix the critical bug",
        category: "ops",
        tags: ["ops", "urgent"],
        prompt: "Please fix the critical production bug.",
      },
    ];

    // Materialize to files
    const materialized = materializeTasks(original, claudeConfig);
    for (const [filePath, content] of materialized) {
      writeFile(filePath, content);
    }

    // Read back
    const roundTripped = readTasks(claudeConfig, tmpDir);

    expect(roundTripped).toHaveLength(1);
    const task = roundTripped[0];
    expect(task.name).toBe("fix-bug");
    expect(task.scope).toBe("ops:triage");
    expect(task.displayName).toBe("Fix Bug");
    expect(task.description).toBe("Fix the critical bug");
    expect(task.category).toBe("ops");
    expect(task.tags).toEqual(["ops", "urgent"]);
    expect(task.prompt).toBe("Please fix the critical production bug.");
  });

  it("round-trips a no-scope task through claude (path) format", () => {
    const original: ResolvedTask[] = [
      {
        name: "hello",
        version: "0.0.0",
        description: "Say hello",
        prompt: "Hello world!",
      },
    ];

    const materialized = materializeTasks(original, claudeConfig);
    for (const [filePath, content] of materialized) {
      writeFile(filePath, content);
    }

    const roundTripped = readTasks(claudeConfig, tmpDir);
    expect(roundTripped).toHaveLength(1);
    expect(roundTripped[0].name).toBe("hello");
    expect(roundTripped[0].scope).toBe("");
    expect(roundTripped[0].description).toBe("Say hello");
    expect(roundTripped[0].prompt).toBe("Hello world!");
  });

  it("round-trips a task through pi (kebab) format", () => {
    const original: ResolvedTask[] = [
      {
        name: "fix-bug",
        version: "0.0.0",
        description: "Fix the bug",
        prompt: "Fix it now",
      },
    ];

    const materialized = materializeTasks(original, piConfig);
    for (const [filePath, content] of materialized) {
      writeFile(filePath, content);
    }

    const roundTripped = readTasks(piConfig, tmpDir);
    expect(roundTripped).toHaveLength(1);
    expect(roundTripped[0].name).toBe("fix-bug");
    expect(roundTripped[0].description).toBe("Fix the bug");
    expect(roundTripped[0].prompt).toBe("Fix it now");
  });

  it("round-trips multiple tasks with mixed scopes", () => {
    const original: ResolvedTask[] = [
      {
        name: "task-a",
        version: "0.0.0",
        scope: "ops",
        description: "Task A",
        prompt: "Do A",
      },
      {
        name: "task-b",
        version: "0.0.0",
        scope: "dev:frontend",
        description: "Task B",
        prompt: "Do B",
      },
      {
        name: "task-c",
        version: "0.0.0",
        description: "Task C",
        prompt: "Do C",
      },
    ];

    const materialized = materializeTasks(original, claudeConfig);
    for (const [filePath, content] of materialized) {
      writeFile(filePath, content);
    }

    const roundTripped = readTasks(claudeConfig, tmpDir);
    expect(roundTripped).toHaveLength(3);

    const byName = Object.fromEntries(roundTripped.map((t) => [t.name, t]));
    expect(byName["task-a"].scope).toBe("ops");
    expect(byName["task-a"].description).toBe("Task A");
    expect(byName["task-b"].scope).toBe("dev:frontend");
    expect(byName["task-b"].description).toBe("Task B");
    expect(byName["task-c"].scope).toBe("");
    expect(byName["task-c"].description).toBe("Task C");
  });

  it("round-trips through 'all' fields config", () => {
    const original: ResolvedTask[] = [
      {
        name: "full-task",
        version: "1.0.0",
        displayName: "Full Task",
        description: "A fully-specified task",
        category: "testing",
        tags: ["test", "round-trip"],
        prompt: "Do everything",
      },
    ];

    const materialized = materializeTasks(original, allFieldsConfig);
    for (const [filePath, content] of materialized) {
      writeFile(filePath, content);
    }

    const roundTripped = readTasks(allFieldsConfig, tmpDir);
    expect(roundTripped).toHaveLength(1);
    const task = roundTripped[0];
    expect(task.name).toBe("full-task");
    expect(task.displayName).toBe("Full Task");
    expect(task.description).toBe("A fully-specified task");
    expect(task.category).toBe("testing");
    expect(task.tags).toEqual(["test", "round-trip"]);
    expect(task.version).toBe("1.0.0");
    expect(task.prompt).toBe("Do everything");
  });
});
