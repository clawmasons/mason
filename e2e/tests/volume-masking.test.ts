/**
 * E2E Test: Volume Masking and Container Ignore
 *
 * Verifies that a role with `container.ignore.paths` in the ROLE.md
 * correctly includes volume masking configuration in the discovered
 * role data.
 *
 * This test validates the ROLE.md parser correctly processes the
 * container.ignore.paths field from the frontmatter.
 *
 * PRD refs: UC-4 (Docker Containerization), §7.3 (Container Ignore)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import {
  copyFixtureWorkspace,
  masonExecJson,
} from "./helpers.js";

describe("volume masking and container ignore", () => {
  let workspaceDir: string;

  beforeAll(() => {
    workspaceDir = copyFixtureWorkspace("volume-masking", {
      excludePaths: ["agents/mcp-test", "roles/mcp-test"],
    });
  }, 30_000);

  afterAll(() => {
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it("local role includes container.ignore.paths from ROLE.md", () => {
    const roles = masonExecJson<Array<Record<string, unknown>>>(
      ["chapter", "list", "--json"],
      workspaceDir,
    );

    const localRole = roles.find(
      (r: Record<string, unknown>) =>
        (r.metadata as Record<string, unknown>)?.name === "test-writer",
    );
    expect(localRole).toBeDefined();

    const container = localRole!.container as Record<string, unknown>;
    expect(container).toBeDefined();

    const ignore = container.ignore as Record<string, unknown>;
    expect(ignore).toBeDefined();

    const paths = ignore.paths as string[];
    expect(paths).toBeDefined();
    expect(paths).toEqual(
      expect.arrayContaining([".mason/", ".claude/", ".env"]),
    );
  });

  it("container.ignore.paths distinguishes directories from files", () => {
    const roles = masonExecJson<Array<Record<string, unknown>>>(
      ["chapter", "list", "--json"],
      workspaceDir,
    );

    const localRole = roles.find(
      (r: Record<string, unknown>) =>
        (r.metadata as Record<string, unknown>)?.name === "test-writer",
    );
    expect(localRole).toBeDefined();

    const container = localRole!.container as Record<string, unknown>;
    const ignore = container.ignore as Record<string, unknown>;
    const paths = ignore.paths as string[];

    // Directories have trailing slashes in the ROLE.md convention
    const directories = paths.filter((p) => p.endsWith("/"));
    const files = paths.filter((p) => !p.endsWith("/"));

    expect(directories.length).toBeGreaterThan(0);
    expect(files.length).toBeGreaterThan(0);

    // .mason/ and .claude/ are directories
    expect(directories).toContain(".mason/");
    expect(directories).toContain(".claude/");

    // .env is a file
    expect(files).toContain(".env");
  });

  it("container.packages.apt from ROLE.md is preserved", () => {
    const roles = masonExecJson<Array<Record<string, unknown>>>(
      ["chapter", "list", "--json"],
      workspaceDir,
    );

    const localRole = roles.find(
      (r: Record<string, unknown>) =>
        (r.metadata as Record<string, unknown>)?.name === "test-writer",
    );
    expect(localRole).toBeDefined();

    const container = localRole!.container as Record<string, unknown>;
    const packages = container.packages as Record<string, unknown>;
    expect(packages.apt).toEqual(["curl"]);
  });
});
