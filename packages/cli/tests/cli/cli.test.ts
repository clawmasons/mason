import { describe, it, expect } from "vitest";
import { program } from "../../src/cli/index.js";

describe("CLI entry point", () => {
  it("has the correct program name", () => {
    expect(program.name()).toBe("clawmasons");
  });

  it("has a version matching package.json", () => {
    expect(program.version()).toBe("0.1.0");
  });

  it("has a description", () => {
    expect(program.description()).toContain("Clawmasons Chapter");
  });

  it("has the init command registered", () => {
    const initCmd = program.commands.find((cmd) => cmd.name() === "init");
    expect(initCmd).toBeDefined();
    if (initCmd) {
      expect(initCmd.description()).toContain("Initialize");
    }
  });

  it("init command has --name option", () => {
    const initCmd = program.commands.find((cmd) => cmd.name() === "init");
    expect(initCmd).toBeDefined();
    if (initCmd) {
      const nameOption = initCmd.options.find((opt) => opt.long === "--name");
      expect(nameOption).toBeDefined();
    }
  });
});
