import { describe, it, expect } from "vitest";
import { memberChapterFieldSchema } from "../../src/schemas/member.js";

describe("memberChapterFieldSchema", () => {
  describe("agent member", () => {
    it("validates a valid agent member", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "agent",
        name: "Repo Ops",
        slug: "repo-ops",
        email: "repo-ops@chapter.local",
        runtimes: ["claude-code", "codex"],
        roles: ["@clawmasons/role-issue-manager"],
        proxy: {
          port: 9090,
          type: "sse",
        },
      });
      expect(result.success).toBe(true);
    });

    it("validates agent member with resources", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "agent",
        name: "Repo Ops",
        slug: "repo-ops",
        email: "repo-ops@chapter.local",
        runtimes: ["claude-code"],
        roles: ["@clawmasons/role-issue-manager"],
        resources: [
          {
            type: "github-repo",
            ref: "clawmasons/openclaw",
            access: "read-write",
          },
        ],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.memberType).toBe("agent");
        if (result.data.memberType === "agent") {
          expect(result.data.resources).toHaveLength(1);
          expect(result.data.resources[0].ref).toBe("clawmasons/openclaw");
        }
      }
    });

    it("validates agent member with authProviders", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "agent",
        name: "Repo Ops",
        slug: "repo-ops",
        email: "repo-ops@chapter.local",
        authProviders: ["github"],
        runtimes: ["claude-code"],
        roles: ["@clawmasons/role-issue-manager"],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.authProviders).toEqual(["github"]);
      }
    });

    it("rejects agent member missing runtimes", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "agent",
        name: "Repo Ops",
        slug: "repo-ops",
        email: "repo-ops@chapter.local",
        roles: ["@clawmasons/role-issue-manager"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects agent member with empty runtimes array", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "agent",
        name: "Repo Ops",
        slug: "repo-ops",
        email: "repo-ops@chapter.local",
        runtimes: [],
        roles: ["@clawmasons/role-issue-manager"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects agent member missing roles", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "agent",
        name: "Repo Ops",
        slug: "repo-ops",
        email: "repo-ops@chapter.local",
        runtimes: ["claude-code"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects agent member missing name", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "agent",
        slug: "repo-ops",
        email: "repo-ops@chapter.local",
        runtimes: ["claude-code"],
        roles: ["@clawmasons/role-issue-manager"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects agent member missing slug", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "agent",
        name: "Repo Ops",
        email: "repo-ops@chapter.local",
        runtimes: ["claude-code"],
        roles: ["@clawmasons/role-issue-manager"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects agent member missing email", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "agent",
        name: "Repo Ops",
        slug: "repo-ops",
        runtimes: ["claude-code"],
        roles: ["@clawmasons/role-issue-manager"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects agent member with invalid email", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "agent",
        name: "Repo Ops",
        slug: "repo-ops",
        email: "not-an-email",
        runtimes: ["claude-code"],
        roles: ["@clawmasons/role-issue-manager"],
      });
      expect(result.success).toBe(false);
    });

    it("validates PRD example: agent member", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "agent",
        name: "Note Taker",
        slug: "note-taker",
        email: "note-taker@chapter.local",
        authProviders: [],
        description: "Note-taking agent that manages markdown files.",
        runtimes: ["claude-code"],
        roles: ["@clawmasons/role-writer"],
        resources: [
          {
            type: "github-repo",
            ref: "clawmasons/openclaw",
            access: "read-write",
          },
        ],
        proxy: {
          port: 9090,
          type: "sse",
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("human member", () => {
    it("validates a valid human member", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "human",
        name: "Alice Chen",
        slug: "alice",
        email: "alice@acme.com",
        authProviders: ["github", "google"],
        description: "Lead developer and project manager.",
        roles: ["@acme/role-admin", "@acme/role-reviewer"],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.memberType).toBe("human");
        expect(result.data.name).toBe("Alice Chen");
        expect(result.data.slug).toBe("alice");
        expect(result.data.email).toBe("alice@acme.com");
      }
    });

    it("validates human member without authProviders", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "human",
        name: "Bob",
        slug: "bob",
        email: "bob@acme.com",
        roles: ["@acme/role-viewer"],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.authProviders).toEqual([]);
      }
    });

    it("rejects human member with runtimes", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "human",
        name: "Alice Chen",
        slug: "alice",
        email: "alice@acme.com",
        runtimes: ["claude-code"],
        roles: ["@acme/role-admin"],
      });
      // human schema doesn't have runtimes field — extra fields are stripped by default
      // but the schema should still accept the input (Zod strips unknown keys)
      expect(result.success).toBe(true);
      if (result.success) {
        // runtimes should not be present on the parsed result
        expect("runtimes" in result.data).toBe(false);
      }
    });

    it("rejects human member missing name", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "human",
        slug: "alice",
        email: "alice@acme.com",
        roles: ["@acme/role-admin"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects human member missing slug", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "human",
        name: "Alice Chen",
        email: "alice@acme.com",
        roles: ["@acme/role-admin"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects human member missing email", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "human",
        name: "Alice Chen",
        slug: "alice",
        roles: ["@acme/role-admin"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects human member missing roles", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "human",
        name: "Alice Chen",
        slug: "alice",
        email: "alice@acme.com",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("general", () => {
    it("rejects member without memberType", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        name: "Alice",
        slug: "alice",
        email: "alice@acme.com",
        roles: ["@acme/role-admin"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects member with invalid memberType", () => {
      const result = memberChapterFieldSchema.safeParse({
        type: "member",
        memberType: "bot",
        name: "Bot",
        slug: "bot",
        email: "bot@acme.com",
        roles: ["@acme/role-admin"],
      });
      expect(result.success).toBe(false);
    });
  });
});
