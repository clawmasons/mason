import { describe, it, expect } from "vitest";
import { launchRuntime } from "../src/index.js";

describe("launchRuntime", () => {
  it("spawns child process with credentials in env", async () => {
    // Use node to print an env var and exit
    const exitCode = await launchRuntime("node", [
      "-e",
      'if (process.env.TEST_CREDENTIAL === "secret123") process.exit(0); else process.exit(1);',
    ], { TEST_CREDENTIAL: "secret123" });

    expect(exitCode).toBe(0);
  });

  it("credentials are NOT in parent process env", async () => {
    // Before launch, ensure the credential is not in our env
    expect(process.env.SUPER_SECRET_CRED).toBeUndefined();

    const exitCode = await launchRuntime("node", [
      "-e",
      'if (process.env.SUPER_SECRET_CRED === "top-secret") process.exit(0); else process.exit(1);',
    ], { SUPER_SECRET_CRED: "top-secret" });

    expect(exitCode).toBe(0);
    // Still not in our env after launch
    expect(process.env.SUPER_SECRET_CRED).toBeUndefined();
  });

  it("propagates child exit code", async () => {
    const exitCode = await launchRuntime("node", ["-e", "process.exit(42)"], {});
    expect(exitCode).toBe(42);
  });

  it("child process has parent env vars (minus sensitive ones)", async () => {
    // Set a normal env var to verify it passes through
    process.env.AGENT_ENTRY_TEST_VAR = "hello-from-parent";

    const exitCode = await launchRuntime("node", [
      "-e",
      'if (process.env.AGENT_ENTRY_TEST_VAR === "hello-from-parent") process.exit(0); else process.exit(1);',
    ], {});

    expect(exitCode).toBe(0);

    delete process.env.AGENT_ENTRY_TEST_VAR;
  });

  it("passes MCP_PROXY_TOKEN to child env", async () => {
    process.env.MCP_PROXY_TOKEN = "test-proxy-token";

    const exitCode = await launchRuntime("node", [
      "-e",
      'if (process.env.MCP_PROXY_TOKEN === "test-proxy-token") process.exit(0); else process.exit(1);',
    ], {});

    expect(exitCode).toBe(0);

    delete process.env.MCP_PROXY_TOKEN;
  });

  it("child stdout goes to parent stdout", async () => {
    // This test just verifies the child runs without error when writing to stdout
    const exitCode = await launchRuntime("node", [
      "-e",
      'process.stdout.write("hello"); process.exit(0);',
    ], {});

    expect(exitCode).toBe(0);
  });

  it("returns exit code 127 when command not found", async () => {
    // With shell: true, the shell handles "command not found" and exits 127
    const exitCode = await launchRuntime("nonexistent-command-xyz-123", [], {});
    expect(exitCode).toBe(127);
  });
});
