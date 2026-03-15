/**
 * E2E Test: Cross-Agent Materialization
 *
 * Verifies that a role defined in .mason/roles/ can be discovered and
 * validated for use by different agent runtimes.
 *
 * This test does NOT require Docker -- it validates the role discovery and
 * validation pipeline across agent types.
 *
 * PRD refs: UC-2 (Cross-Agent Portability), §4.5 (Dialect Mapping)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  copyFixtureWorkspace,
  masonExecJson,
  masonExec,
} from "./helpers.js";

describe("cross-agent materialization", () => {
  let workspaceDir: string;

  beforeAll(() => {
    // Create temp workspace with mason local role
    workspaceDir = copyFixtureWorkspace("cross-agent", {
      excludePaths: ["agents/mcp-test", "roles/mcp-test"],
    });
  }, 30_000);

  afterAll(() => {
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it("mason local role is discovered from .mason/roles/", () => {
    const roles = masonExecJson<Array<Record<string, unknown>>>(
      ["chapter", "list", "--json"],
      workspaceDir,
    );

    const localRole = roles.find(
      (r: Record<string, unknown>) =>
        (r.metadata as Record<string, unknown>)?.name === "test-writer",
    );
    expect(localRole).toBeDefined();
    expect(
      (localRole!.source as Record<string, unknown>).agentDialect,
    ).toBe("mason");
  });

  it("mason local role has correct metadata from ROLE.md frontmatter", () => {
    const roles = masonExecJson<Array<Record<string, unknown>>>(
      ["chapter", "list", "--json"],
      workspaceDir,
    );

    const localRole = roles.find(
      (r: Record<string, unknown>) =>
        (r.metadata as Record<string, unknown>)?.name === "test-writer",
    );
    expect(localRole).toBeDefined();

    const metadata = localRole!.metadata as Record<string, unknown>;
    expect(metadata.description).toContain("E2E test writer role");
    expect(metadata.version).toBe("1.0.0");
  });

  it("mason local role has tasks from tasks field", () => {
    const roles = masonExecJson<Array<Record<string, unknown>>>(
      ["chapter", "list", "--json"],
      workspaceDir,
    );

    const localRole = roles.find(
      (r: Record<string, unknown>) =>
        (r.metadata as Record<string, unknown>)?.name === "test-writer",
    );
    expect(localRole).toBeDefined();

    const tasks = localRole!.tasks as Array<Record<string, unknown>>;
    expect(tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "take-notes" }),
      ]),
    );
  });

  it("mason local role has empty apps when no mcp_servers specified", () => {
    const roles = masonExecJson<Array<Record<string, unknown>>>(
      ["chapter", "list", "--json"],
      workspaceDir,
    );

    const localRole = roles.find(
      (r: Record<string, unknown>) =>
        (r.metadata as Record<string, unknown>)?.name === "test-writer",
    );
    expect(localRole).toBeDefined();

    const apps = localRole!.apps as Array<Record<string, unknown>>;
    // No mcp_servers in this ROLE.md
    expect(apps).toEqual([]);
  });

  it("mason local role validates successfully", () => {
    // Should not throw
    masonExec(["chapter", "validate", "test-writer"], workspaceDir);
  });

  it("mason local role contains container requirements from ROLE.md", () => {
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

    const packages = container.packages as Record<string, unknown>;
    expect(packages).toBeDefined();
    expect(packages.apt).toEqual(expect.arrayContaining(["curl"]));
  });

  it("mason local role contains governance config from ROLE.md", () => {
    const roles = masonExecJson<Array<Record<string, unknown>>>(
      ["chapter", "list", "--json"],
      workspaceDir,
    );

    const localRole = roles.find(
      (r: Record<string, unknown>) =>
        (r.metadata as Record<string, unknown>)?.name === "test-writer",
    );
    expect(localRole).toBeDefined();

    const governance = localRole!.governance as Record<string, unknown>;
    expect(governance).toBeDefined();
    expect(governance.risk).toBe("LOW");
    expect(governance.credentials).toEqual(
      expect.arrayContaining(["TEST_TOKEN"]),
    );
  });

  it("role includes instructions from ROLE.md body", () => {
    const roles = masonExecJson<Array<Record<string, unknown>>>(
      ["chapter", "list", "--json"],
      workspaceDir,
    );

    const localRole = roles.find(
      (r: Record<string, unknown>) =>
        (r.metadata as Record<string, unknown>)?.name === "test-writer",
    );
    expect(localRole).toBeDefined();

    const instructions = localRole!.instructions as string;
    expect(instructions).toContain("note-taking assistant");
    expect(instructions).toContain("markdown format");
  });
});
