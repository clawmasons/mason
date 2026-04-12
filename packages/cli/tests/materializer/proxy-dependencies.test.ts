import { describe, expect, it, vi, beforeEach } from "vitest";
import * as path from "node:path";
import type { Role } from "@clawmasons/shared";

// ---------------------------------------------------------------------------
// Mock setup — must be before importing the module under test
// ---------------------------------------------------------------------------

// Mock node:fs — intercept all fs calls
const mockExistsSync = vi.fn<(p: string) => boolean>();
const mockMkdirSync = vi.fn();
const mockCpSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockReadFileSync = vi.fn();

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (...args: Parameters<typeof actual.existsSync>) => mockExistsSync(...args),
      mkdirSync: (...args: Parameters<typeof actual.mkdirSync>) => mockMkdirSync(...args),
      cpSync: (...args: Parameters<typeof actual.cpSync>) => mockCpSync(...args),
      writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => mockWriteFileSync(...args),
      readFileSync: (...args: Parameters<typeof actual.readFileSync>) => mockReadFileSync(...args),
    },
    existsSync: (...args: Parameters<typeof actual.existsSync>) => mockExistsSync(...args),
    mkdirSync: (...args: Parameters<typeof actual.mkdirSync>) => mockMkdirSync(...args),
    cpSync: (...args: Parameters<typeof actual.cpSync>) => mockCpSync(...args),
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => mockWriteFileSync(...args),
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => mockReadFileSync(...args),
  };
});

// Mock createRequire to control bundle resolution
const mockResolve = vi.fn<(id: string) => string>();
vi.mock("node:module", () => ({
  createRequire: () => {
    const requireFn = Object.assign(() => {}, { resolve: mockResolve });
    return requireFn;
  },
}));

// Import after mocks
const { copyChannelBundle } = await import(
  "../../src/materializer/proxy-dependencies.js"
);

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

function makeTestRole(overrides?: Partial<Role>): Role {
  return {
    metadata: {
      name: "test-role",
      description: "A test role",
      version: "1.0.0",
      scope: "acme",
    },
    instructions: "You are a test agent.",
    tasks: [],
    mcp: [],
    skills: [],
    container: {
      packages: { apt: [], npm: [], pip: [] },
      ignore: { paths: [] },
      mounts: [],
    },
    governance: {
      risk: "LOW",
      credentials: [],
      constraints: {},
    },
    type: "project" as const,
    sources: [],
    resources: [],
    role: { includes: [] },
    source: {
      type: "local",
      agentDialect: "claude-code-agent",
      path: "/projects/test/.claude/roles/test-role",
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// copyChannelBundle
// ---------------------------------------------------------------------------

describe("copyChannelBundle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when role has no channel", () => {
    const role = makeTestRole(); // no channel
    copyChannelBundle("/build/test-role", role, "claude-code-agent", "/projects/test");

    expect(mockExistsSync).not.toHaveBeenCalled();
    expect(mockMkdirSync).not.toHaveBeenCalled();
    expect(mockCpSync).not.toHaveBeenCalled();
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("copies channel bundle when role has a channel and bundle is resolvable", () => {
    const fakeBundlePath =
      "/node_modules/@clawmasons/claude-code-agent/dist/channels/slack/server.js";
    mockResolve.mockReturnValue(fakeBundlePath);
    mockExistsSync.mockReturnValue(false);

    const role = makeTestRole({
      channel: { type: "slack", args: [] },
    });

    copyChannelBundle("/build/test-role", role, "claude-code-agent", "/projects/test");

    const expectedDest = path.join(
      "/build/test-role",
      "claude-code-agent",
      "home",
      "channels",
      "slack",
      "server.js",
    );

    expect(mockResolve).toHaveBeenCalledWith(
      "@clawmasons/claude-code-agent/channels/slack",
    );
    expect(mockMkdirSync).toHaveBeenCalledWith(path.dirname(expectedDest), {
      recursive: true,
    });
    expect(mockCpSync).toHaveBeenCalledWith(fakeBundlePath, expectedDest);
  });

  it("skips copy when destination already exists (idempotent)", () => {
    // existsSync returns true — file already present
    mockExistsSync.mockReturnValue(true);

    const role = makeTestRole({
      channel: { type: "slack", args: [] },
    });

    copyChannelBundle("/build/test-role", role, "claude-code-agent", "/projects/test");

    // Should bail out after existsSync returns true
    expect(mockExistsSync).toHaveBeenCalled();
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockMkdirSync).not.toHaveBeenCalled();
    expect(mockCpSync).not.toHaveBeenCalled();
  });

  it("warns and returns when channel bundle cannot be resolved", () => {
    mockResolve.mockImplementation(() => {
      throw new Error("Cannot find module");
    });
    mockExistsSync.mockReturnValue(false);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const role = makeTestRole({
      channel: { type: "slack", args: [] },
    });

    // Should not throw
    copyChannelBundle("/build/test-role", role, "claude-code-agent", "/projects/test");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Channel bundle for "slack" could not be resolved',
      ),
    );
    expect(mockMkdirSync).not.toHaveBeenCalled();
    expect(mockCpSync).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("uses the channel type from the role to construct the resolve path", () => {
    const fakeBundlePath =
      "/node_modules/@clawmasons/claude-code-agent/dist/channels/telegram/server.js";
    mockResolve.mockReturnValue(fakeBundlePath);
    mockExistsSync.mockReturnValue(false);

    const role = makeTestRole({
      channel: { type: "telegram", args: ["--debug"] },
    });

    copyChannelBundle("/build/test-role", role, "claude-code-agent", "/projects/test");

    expect(mockResolve).toHaveBeenCalledWith(
      "@clawmasons/claude-code-agent/channels/telegram",
    );

    const expectedDest = path.join(
      "/build/test-role",
      "claude-code-agent",
      "home",
      "channels",
      "telegram",
      "server.js",
    );
    expect(mockCpSync).toHaveBeenCalledWith(fakeBundlePath, expectedDest);
  });
});
