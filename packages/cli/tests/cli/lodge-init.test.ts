import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { initLodge } from "../../src/cli/commands/lodge-init.js";
import { readConfigJson } from "../../src/runtime/home.js";

// Path to the CHARTER.md template in the project
const CHARTER_TEMPLATE = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "templates",
  "charter",
  "CHARTER.md",
);

describe("initLodge", () => {
  let tmpDir: string;
  let clawmasonsHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lodge-init-test-"));
    clawmasonsHome = path.join(tmpDir, ".clawmasons");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates CLAWMASONS_HOME and config.json from scratch", () => {
    const result = initLodge(
      { home: clawmasonsHome, lodge: "test" },
      { charterTemplatePath: CHARTER_TEMPLATE },
    );

    expect(result.skipped).toBe(false);
    expect(fs.existsSync(clawmasonsHome)).toBe(true);
    expect(fs.existsSync(path.join(clawmasonsHome, "config.json"))).toBe(true);

    const config = readConfigJson(clawmasonsHome);
    expect(config["test"]).toBeDefined();
  });

  it("creates LODGE_HOME with CHARTER.md and chapters/", () => {
    const result = initLodge(
      { home: clawmasonsHome, lodge: "acme" },
      { charterTemplatePath: CHARTER_TEMPLATE },
    );

    expect(result.skipped).toBe(false);
    expect(result.lodge).toBe("acme");

    const lodgeHome = result.lodgeHome;
    expect(fs.existsSync(lodgeHome)).toBe(true);
    expect(fs.existsSync(path.join(lodgeHome, "chapters"))).toBe(true);
    expect(fs.existsSync(path.join(lodgeHome, "CHARTER.md"))).toBe(true);

    const charter = fs.readFileSync(
      path.join(lodgeHome, "CHARTER.md"),
      "utf-8",
    );
    expect(charter).toContain("Lodge Charter");
    expect(charter).toContain("Principle of Least Privilege");
  });

  it("registers lodge in config.json", () => {
    const result = initLodge(
      { home: clawmasonsHome, lodge: "acme" },
      { charterTemplatePath: CHARTER_TEMPLATE },
    );

    const config = readConfigJson(clawmasonsHome);
    expect(config["acme"]).toBeDefined();
    expect(config["acme"].home).toBe(result.lodgeHome);
  });

  it("is idempotent -- skips if already initialized", () => {
    // First init
    initLodge(
      { home: clawmasonsHome, lodge: "acme" },
      { charterTemplatePath: CHARTER_TEMPLATE },
    );

    // Second init
    const result = initLodge(
      { home: clawmasonsHome, lodge: "acme" },
      { charterTemplatePath: CHARTER_TEMPLATE },
    );

    expect(result.skipped).toBe(true);
    expect(result.lodge).toBe("acme");
  });

  it("does not overwrite existing CHARTER.md", () => {
    // First init
    const first = initLodge(
      { home: clawmasonsHome, lodge: "acme" },
      { charterTemplatePath: CHARTER_TEMPLATE },
    );

    // Modify CHARTER.md
    const charterPath = path.join(first.lodgeHome, "CHARTER.md");
    fs.writeFileSync(charterPath, "Custom charter content\n", "utf-8");

    // Remove the chapters/ dir to bypass idempotency check, but keep CHARTER.md
    fs.rmSync(path.join(first.lodgeHome, "chapters"), {
      recursive: true,
      force: true,
    });

    // Re-init (not skipped because chapters/ is gone)
    const second = initLodge(
      { home: clawmasonsHome, lodge: "acme" },
      { charterTemplatePath: CHARTER_TEMPLATE },
    );

    expect(second.skipped).toBe(false);
    const content = fs.readFileSync(charterPath, "utf-8");
    expect(content).toBe("Custom charter content\n");
  });

  it("custom --lodge-home is registered correctly", () => {
    const customHome = path.join(tmpDir, "projects", "acme");

    const result = initLodge(
      { home: clawmasonsHome, lodge: "acme", lodgeHome: customHome },
      { charterTemplatePath: CHARTER_TEMPLATE },
    );

    expect(result.skipped).toBe(false);
    expect(result.lodgeHome).toBe(customHome);
    expect(fs.existsSync(path.join(customHome, "chapters"))).toBe(true);
    expect(fs.existsSync(path.join(customHome, "CHARTER.md"))).toBe(true);

    const config = readConfigJson(clawmasonsHome);
    expect(config["acme"].home).toBe(customHome);
  });

  it("defaults lodge name to LODGE_HOME basename when using default resolution", () => {
    // When both lodge and home are specified, lodgeHome defaults to home/lodge
    const result = initLodge(
      { home: clawmasonsHome, lodge: "myproject" },
      { charterTemplatePath: CHARTER_TEMPLATE },
    );

    expect(result.lodge).toBe("myproject");
    expect(result.lodgeHome).toBe(path.join(clawmasonsHome, "myproject"));
  });

  it("creates config.json as empty object when CLAWMASONS_HOME is fresh", () => {
    initLodge(
      { home: clawmasonsHome, lodge: "test" },
      { charterTemplatePath: CHARTER_TEMPLATE },
    );

    // config.json should exist and be valid JSON with the lodge entry
    const configPath = path.join(clawmasonsHome, "config.json");
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(typeof parsed).toBe("object");
    expect(parsed["test"]).toBeDefined();
  });

  it("preserves existing lodges in config.json when adding a new one", () => {
    // Init first lodge
    initLodge(
      { home: clawmasonsHome, lodge: "first" },
      { charterTemplatePath: CHARTER_TEMPLATE },
    );

    // Init second lodge
    initLodge(
      { home: clawmasonsHome, lodge: "second" },
      { charterTemplatePath: CHARTER_TEMPLATE },
    );

    const config = readConfigJson(clawmasonsHome);
    expect(config["first"]).toBeDefined();
    expect(config["second"]).toBeDefined();
  });
});
