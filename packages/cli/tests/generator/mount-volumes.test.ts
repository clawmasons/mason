import { describe, expect, it } from "vitest";
import { resolveEnvVars, resolveRoleMountVolumes } from "../../src/generator/mount-volumes.js";

// ── resolveEnvVars ────────────────────────────────────────────────────

describe("resolveEnvVars", () => {
  it("resolves known env vars", () => {
    const env = { HOME: "/home/mason", LODGE: "acme" };
    expect(resolveEnvVars("${HOME}/projects/${LODGE}", env)).toBe(
      "/home/mason/projects/acme",
    );
  });

  it("leaves unknown vars as-is", () => {
    const env = { HOME: "/home/mason" };
    expect(resolveEnvVars("${HOME}/${UNKNOWN_VAR}", env)).toBe(
      "/home/mason/${UNKNOWN_VAR}",
    );
  });

  it("returns string unchanged when no vars present", () => {
    expect(resolveEnvVars("/static/path", {})).toBe("/static/path");
  });

  it("handles multiple occurrences of the same var", () => {
    const env = { X: "val" };
    expect(resolveEnvVars("${X}/${X}", env)).toBe("val/val");
  });

  it("handles empty string", () => {
    expect(resolveEnvVars("", {})).toBe("");
  });
});

// ── resolveRoleMountVolumes ───────────────────────────────────────────

describe("resolveRoleMountVolumes", () => {
  it("returns empty array when mounts is undefined", () => {
    expect(resolveRoleMountVolumes(undefined)).toEqual([]);
  });

  it("returns empty array when mounts is empty", () => {
    expect(resolveRoleMountVolumes([])).toEqual([]);
  });

  it("resolves simple mount without readonly", () => {
    const result = resolveRoleMountVolumes(
      [{ source: "/host/path", target: "/container/path", readonly: false }],
      {},
    );
    expect(result).toEqual(["/host/path:/container/path"]);
  });

  it("appends :ro for readonly mounts", () => {
    const result = resolveRoleMountVolumes(
      [{ source: "/host/path", target: "/container/path", readonly: true }],
      {},
    );
    expect(result).toEqual(["/host/path:/container/path:ro"]);
  });

  it("resolves env vars in source and target", () => {
    const env = { LODGE_HOME: "/home/lodges", LODGE: "acme" };
    const result = resolveRoleMountVolumes(
      [{ source: "${LODGE_HOME}", target: "/home/mason/${LODGE}", readonly: false }],
      env,
    );
    expect(result).toEqual(["/home/lodges:/home/mason/acme"]);
  });

  it("handles multiple mounts with mixed readonly", () => {
    const env = { DATA: "/data" };
    const result = resolveRoleMountVolumes(
      [
        { source: "${DATA}/shared", target: "/mnt/shared", readonly: false },
        { source: "${DATA}/config", target: "/etc/app", readonly: true },
      ],
      env,
    );
    expect(result).toEqual([
      "/data/shared:/mnt/shared",
      "/data/config:/etc/app:ro",
    ]);
  });

  it("leaves unresolvable env vars in output", () => {
    const result = resolveRoleMountVolumes(
      [{ source: "${MISSING}", target: "/target", readonly: false }],
      {},
    );
    expect(result).toEqual(["${MISSING}:/target"]);
  });
});
