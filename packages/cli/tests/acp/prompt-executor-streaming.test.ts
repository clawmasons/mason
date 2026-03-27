import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter, Readable } from "node:stream";

// ---------------------------------------------------------------------------
// Mock child_process.spawn to avoid real subprocesses
// ---------------------------------------------------------------------------

interface MockChildProcess extends EventEmitter {
  stdout: Readable;
  stderr: EventEmitter & { on: (event: string, cb: (chunk: Buffer) => void) => void };
  kill: ReturnType<typeof vi.fn>;
}

let lastSpawnedChild: MockChildProcess;

function createMockChild(): MockChildProcess {
  const stdout = new Readable({ read() {} });
  const stderr = new EventEmitter() as MockChildProcess["stderr"];
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = vi.fn(() => {
    // Simulate process exit on kill
    process.nextTick(() => child.emit("close", null));
  });
  return child;
}

vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  return {
    ...original,
    spawn: vi.fn(() => {
      lastSpawnedChild = createMockChild();
      return lastSpawnedChild;
    }),
  };
});

// Mock the ACP logger to avoid file system calls
vi.mock("../../src/acp/acp-logger.js", () => ({
  acpLog: vi.fn(),
  acpError: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks are set up)
// ---------------------------------------------------------------------------

import { executePromptStreaming } from "../../src/acp/prompt-executor.js";
import { spawn } from "node:child_process";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultOptions(overrides: Partial<Parameters<typeof executePromptStreaming>[0]> = {}) {
  return {
    agent: "claude-code-agent",
    role: "project",
    text: "hello world",
    cwd: "/tmp/test",
    onSessionUpdate: vi.fn(),
    ...overrides,
  };
}

/** Push lines to the mock child's stdout then close the process. */
function emitLines(lines: string[], exitCode = 0) {
  for (const line of lines) {
    lastSpawnedChild.stdout.push(line + "\n");
  }
  // Signal end of stdout before process close
  lastSpawnedChild.stdout.push(null);
  // Small delay to let readline process lines before close
  setTimeout(() => lastSpawnedChild.emit("close", exitCode), 20);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("executePromptStreaming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("spawns mason run with --json flag instead of -p", async () => {
    const opts = defaultOptions();
    const promise = executePromptStreaming(opts);
    emitLines([]);

    await promise;

    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      ["run", "--agent", "claude-code-agent", "--role", "project", "--json", "hello world"],
      expect.objectContaining({ cwd: "/tmp/test" }),
    );
  });

  it("calls onSessionUpdate for each valid NDJSON line", async () => {
    const onSessionUpdate = vi.fn();
    const opts = defaultOptions({ onSessionUpdate });
    const promise = executePromptStreaming(opts);

    const line1 = JSON.stringify({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hello" } });
    const line2 = JSON.stringify({ sessionUpdate: "tool_call", toolName: "read_file", toolCallId: "1" });

    emitLines([line1, line2]);

    const result = await promise;

    expect(result.cancelled).toBe(false);
    expect(onSessionUpdate).toHaveBeenCalledTimes(2);
    expect(onSessionUpdate).toHaveBeenNthCalledWith(1, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Hello" },
    });
    expect(onSessionUpdate).toHaveBeenNthCalledWith(2, {
      sessionUpdate: "tool_call",
      toolName: "read_file",
      toolCallId: "1",
    });
  });

  it("skips malformed JSON lines without calling onSessionUpdate", async () => {
    const onSessionUpdate = vi.fn();
    const opts = defaultOptions({ onSessionUpdate });
    const promise = executePromptStreaming(opts);

    const validLine = JSON.stringify({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ok" } });
    emitLines(["not valid json", validLine, "{broken"]);

    const result = await promise;

    expect(result.cancelled).toBe(false);
    expect(onSessionUpdate).toHaveBeenCalledTimes(1);
    expect(onSessionUpdate).toHaveBeenCalledWith({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "ok" },
    });
  });

  it("skips empty lines", async () => {
    const onSessionUpdate = vi.fn();
    const opts = defaultOptions({ onSessionUpdate });
    const promise = executePromptStreaming(opts);

    const validLine = JSON.stringify({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ok" } });
    emitLines(["", "  ", validLine, ""]);

    const result = await promise;

    expect(result.cancelled).toBe(false);
    expect(onSessionUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns cancelled: true when abort signal fires", async () => {
    const abortController = new AbortController();
    const onSessionUpdate = vi.fn();
    const opts = defaultOptions({ signal: abortController.signal, onSessionUpdate });
    const promise = executePromptStreaming(opts);

    // Abort after spawn
    abortController.abort();

    const result = await promise;

    expect(result.cancelled).toBe(true);
    expect(lastSpawnedChild.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("returns cancelled: true when already aborted before spawn", async () => {
    const abortController = new AbortController();
    abortController.abort();

    const opts = defaultOptions({ signal: abortController.signal });
    const result = await executePromptStreaming(opts);

    expect(result.cancelled).toBe(true);
    // spawn should not have been called
    expect(spawn).not.toHaveBeenCalled();
  });

  it("returns cancelled: false on successful process exit", async () => {
    const opts = defaultOptions();
    const promise = executePromptStreaming(opts);

    emitLines([], 0);

    const result = await promise;
    expect(result.cancelled).toBe(false);
  });

  it("rejects when process exits with non-zero code", async () => {
    const opts = defaultOptions();
    const promise = executePromptStreaming(opts);

    emitLines([], 1);

    await expect(promise).rejects.toThrow("mason run failed");
  });

  it("rejects when spawn emits an error", async () => {
    const opts = defaultOptions();
    const promise = executePromptStreaming(opts);

    lastSpawnedChild.emit("error", new Error("ENOENT"));

    await expect(promise).rejects.toThrow("mason run failed to spawn: ENOENT");
  });
});
