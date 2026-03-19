# Clawmasons Chapter — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** Clawmasons, Inc.

---

## 1. Executive Summary

Clawmasons Chapter (formerly Agent Forge / forge) is a framework for creating and managing **chapters** — collaborative workgroups where **members** (either human or agent) work together to get tasks done. Chapter retains the full npm-native packaging, governance, and runtime architecture of forge while introducing a member-centric model that treats humans and AI agents as peers in a shared workspace.

This PRD covers two interrelated changes:

- **Rebrand:** Rename forge → chapter across all CLI commands, package names, directory structures, and documentation. The `forge` CLI becomes `chapter`, `.forge/` becomes `.chapter/`, and the `@clawmasons/forge` package becomes `@clawmasons/mason`.
- **Members model:** Replace the agent-centric model with a member-centric model. Members are either `human` or `agent` type. Both have roles, identities, and activity logs. Agent members retain runtimes (claude-code-agent, codex). The CLI gains `chapter enable/disable @member` commands for managing member status.

---

## 2. Design Principles

- **Members are peers:** Humans and agents are both "members" of a chapter. They share the same role system, task assignments, and governance boundaries.
- **npm-native (preserved):** Every chapter component remains a standard npm package with a `chapter` metadata field (renamed from `forge`).
- **Governance as code (preserved):** Roles, permissions, and tool-level access control remain declared in package metadata and enforced at the proxy layer.
- **Identity-first:** Every member has a name, slug, email, and optional auth providers — enabling audit trails, access control, and multi-system integration.
- **Backward compatible concepts:** The package taxonomy (app, skill, task, role) is unchanged. Only the top-level deployable unit changes from "agent" to "member".

---

## 3. Terminology Changes

| Before (Forge) | After (Chapter) | Notes |
|----------------|-----------------|-------|
| forge (CLI) | chapter (CLI) | All CLI commands |
| `.forge/` | `.chapter/` | Workspace config directory |
| `forge` field in package.json | `chapter` field in package.json | Package metadata key |
| `@clawmasons/forge` | `@clawmasons/mason` | Main CLI package |
| `@clawmasons/forge-core` | `@clawmasons/chapter-core` | Component library |
| `forge.config.json` | `chapter.config.json` | Workspace config file |
| `forge.lock.json` | `chapter.lock.json` | Lock file |
| `forge-proxy` (MCP server name) | `chapter-proxy` | Proxy server name |
| `~/.forge/` | `~/.chapter/` | Global config/data directory |
| `~/.forge/data/forge.db` | `~/.chapter/data/chapter.db` | SQLite database |
| agent (package type) | member (package type) | Top-level deployable unit |
| `forge install <agent>` | `chapter install @<member>` | Install a member |
| `forge run <agent>` | `chapter run @<member>` | Run a member's stack |
| N/A | `chapter enable @<member>` | Enable an installed member |
| N/A | `chapter disable @<member>` | Disable an installed member |

---

## 4. Package Taxonomy (Updated)

The five package types are retained, with "agent" replaced by "member":

| Type | Purpose | Depends On |
|------|---------|------------|
| **app** | MCP server exposing tools to members | npm runtime deps only |
| **skill** | Knowledge/context artifacts (prompts, examples, reference docs) | Other skills |
| **task** | A unit of work: command, subagent invocation, or composite | Apps, skills, other tasks |
| **role** | Permission-bounded bundle of tasks, apps, and skills | Tasks, apps, skills |
| **member** | Top-level deployable unit with roles, identity, and optional runtimes | Roles |

### 4.1 Package Type: member

A member is the top-level deployable unit. It replaces the former "agent" type. Members are either human or agent type.

```json
{
  "name": "@clawmasons/member-note-taker",
  "version": "1.0.0",
  "chapter": {
    "type": "member",
    "memberType": "agent",
    "name": "Note Taker",
    "slug": "note-taker",
    "email": "note-taker@chapter.local",
    "authProviders": [],
    "description": "Note-taking agent that manages markdown files.",
    "runtimes": ["claude-code-agent"],
    "roles": [
      "@clawmasons/role-writer"
    ],
    "resources": [
      {
        "type": "github-repo",
        "ref": "clawmasons/openclaw",
        "access": "read-write"
      }
    ],
    "proxy": {
      "port": 9090,
      "type": "sse"
    }
  }
}
```

**Human member example:**

```json
{
  "name": "@acme/member-alice",
  "version": "1.0.0",
  "chapter": {
    "type": "member",
    "memberType": "human",
    "name": "Alice Chen",
    "slug": "alice",
    "email": "alice@acme.com",
    "authProviders": ["github", "google"],
    "description": "Lead developer and project manager.",
    "roles": [
      "@acme/role-admin",
      "@acme/role-reviewer"
    ]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"member"` | Yes | Package type identifier. |
| `memberType` | `"human"` \| `"agent"` | Yes | Whether this member is a human or AI agent. |
| `name` | string | Yes | Display name of the member. |
| `slug` | string | Yes | URL-safe identifier, used for directory names and references. |
| `email` | string | Yes | Contact email. For agents, a conventional address (e.g., `slug@chapter.local`). |
| `authProviders` | string[] | No | Authentication providers this member uses (e.g., `"github"`, `"google"`, `"okta"`). Primarily for human members. |
| `description` | string | No | Human-readable summary. |
| `runtimes` | string[] | Agent only | Runtime environments for agent members. Not applicable to human members. |
| `roles` | string[] | Yes | Role packages this member operates with. Defines the permission envelope. |
| `resources` | object[] | No | External resource declarations. |
| `proxy` | object | Agent only | Proxy configuration for agent members. |

### 4.2 Dependency Graph (Updated)

```
member
  └─ role (declares permissions = tool allow-lists per app)
       ├─ task (declares which apps + skills it requires)
       │    ├─ app    (npm dep → MCP server code)
       │    ├─ skill  (npm dep → prompt/knowledge artifacts)
       │    └─ task   (sub-tasks for composite workflows)
       ├─ app   (direct role-level dependencies)
       └─ skill (direct role-level dependencies)
```

---

## 5. Workspace Structure

### 5.1 `chapter init`

Creates the foundational workspace structure (same behavior as `forge init`, renamed):

```
$ chapter init

my-workspace/
├── .chapter/
│   ├── config.json          # workspace-level chapter configuration
│   ├── members.json         # member registry (installed members + status)
│   └── .env.example         # template for credential bindings
├── node_modules/
├── apps/
├── tasks/
├── skills/
├── roles/
├── members/                 # replaces agents/
└── package.json
```

### 5.2 `.chapter/members.json`

A registry of installed members and their current status:

```json
{
  "members": {
    "note-taker": {
      "package": "@acme/member-note-taker",
      "memberType": "agent",
      "status": "enabled",
      "installedAt": "2026-03-05T10:30:00Z"
    },
    "alice": {
      "package": "@acme/member-alice",
      "memberType": "human",
      "status": "enabled",
      "installedAt": "2026-03-05T10:30:00Z"
    },
    "bob": {
      "package": "@acme/member-bob",
      "memberType": "human",
      "status": "disabled",
      "installedAt": "2026-03-05T11:00:00Z"
    }
  }
}
```

### 5.3 Per-Member Directory Structure

After `chapter install @<member>`, each member gets a directory under `.chapter/members/<slug>/`:

```
.chapter/
├── config.json
├── members.json
└── members/
    ├── note-taker/                    # agent member
    │   ├── log/                       # activity log
    │   ├── proxy/                     # member's proxy config (replaces forge-proxy/)
    │   ├── claude-code-agent/               # runtime workspace (agent members only)
    │   │   ├── Dockerfile
    │   │   └── workspace/
    │   │       ├── .claude/
    │   │       │   ├── settings.json
    │   │       │   └── commands/
    │   │       ├── AGENTS.md
    │   │       └── skills/
    │   └── codex/                     # additional runtime (if declared)
    │       ├── Dockerfile
    │       └── workspace/
    │           ├── codex.json
    │           ├── instructions.md
    │           └── skills/
    │
    └── alice/                         # human member
        └── log/                       # activity log
```

Key changes from the old layout:
- **Per-member isolation:** Each member has its own directory instead of a shared agent workspace.
- **`proxy/`** replaces the old `forge-proxy/` or `mcp-proxy/` directory, scoped per member.
- **`log/`** directory for activity tracking. Agent members will have richer logs to support running across runtimes with a proxy.
- **Runtime directories** (claude-code-agent/, codex/) are nested under the member, not at the top level.

---

## 6. CLI Specification (Updated)

### 6.1 Command Reference

| Command | Description |
|---------|-------------|
| `chapter init` | Initializes a chapter workspace. Creates `.chapter/` directory, scaffolds config. Same behavior as `forge init`. |
| `chapter add <pkg>` | Wraps `npm install`. Validates the package has a `chapter` field. |
| `chapter remove <pkg>` | Wraps `npm uninstall`. Checks for dependent packages before removing. |
| `chapter list` | Lists installed members and their resolved role/task/app tree. |
| `chapter validate <member>` | Validates member graph: checks all task requirements covered by role permissions. |
| `chapter install @<member>` | `npm install` + resolves chapter graph + scaffolds per-member directory with proxy config and runtime workspaces. Same behavior as `forge install`. |
| `chapter enable @<member>` | Enables an installed member. Updates `members.json` status to `"enabled"`. |
| `chapter disable @<member>` | Disables an installed member. Updates `members.json` status to `"disabled"`. Disabled members are not started by `chapter run`. |
| `chapter run @<member> [--runtime=X]` | Starts Docker Compose stack for the member. Respects enabled/disabled status. |
| `chapter stop @<member>` | Stops and tears down the member's Docker Compose stack. |
| `chapter permissions @<member>` | Displays the resolved permission matrix for the member. |
| `chapter proxy` | Starts the MCP proxy server. |
| `chapter publish` | Wraps `npm publish`. Adds pre-publish validation. |

### 6.2 `chapter enable` / `chapter disable`

New commands for managing member lifecycle:

```
$ chapter enable @note-taker
✓ Member @note-taker enabled

$ chapter disable @bob
✓ Member @bob disabled

$ chapter list
Members:
  ✓ @acme/member-note-taker (agent, enabled)
  ✓ @acme/member-alice (human, enabled)
  ✗ @acme/member-bob (human, disabled)
```

- `enable` sets the member's status in `.chapter/members.json` to `"enabled"`.
- `disable` sets the member's status to `"disabled"`.
- `chapter run` only starts enabled agent members.
- Disabled members retain their installed directory and configuration.
- Both commands require the member to be installed first.

---

## 7. Requirements

### P0 — Must-Have

**REQ-001: Rename forge → chapter (CLI Binary)**

The CLI binary changes from `forge` to `chapter`. The `bin` field in `package.json` changes from `"forge"` to `"chapter"`. All CLI command implementations reference "chapter" in help text, output messages, and error messages.

Acceptance criteria:
- Given the package is installed, when `chapter init` is run, then it behaves identically to the current `forge init`.
- Given a user runs `forge`, then the command is not found (no backward compatibility alias in v1).

**REQ-002: Rename `.forge/` → `.chapter/`**

The workspace configuration directory changes from `.forge/` to `.chapter/`. All source code references to `.forge/` are updated. The `chapter init` command creates `.chapter/`.

Acceptance criteria:
- Given `chapter init` is run, then a `.chapter/` directory is created (not `.forge/`).
- Given `chapter install` is run, then per-member directories are created under `.chapter/members/`.
- Given no source file, when grepped for `\.forge`, then no references to `.forge/` exist (except in historical PRDs).

**REQ-003: Rename Package Metadata Field `forge` → `chapter`**

All package.json files use `"chapter"` instead of `"forge"` as the metadata field name. The Zod schemas, `parseForgeField()` (renamed to `parseChapterField()`), and all resolver/validator code reference the new field name.

Acceptance criteria:
- Given a package with `"chapter": { "type": "app", ... }`, when parsed by `parseChapterField()`, then it succeeds.
- Given a package with `"forge": { "type": "app", ... }`, when parsed, then it fails (no backward compatibility in v1).

**REQ-004: Rename npm Packages**

| Before | After |
|--------|-------|
| `@clawmasons/forge` | `@clawmasons/mason` |
| `@clawmasons/forge-core` | `@clawmasons/chapter-core` |
| `@clawmasons/app-*` | `@clawmasons/app-*` (unchanged) |
| `@clawmasons/task-*` | `@clawmasons/task-*` (unchanged) |
| `@clawmasons/skill-*` | `@clawmasons/skill-*` (unchanged) |
| `@clawmasons/role-*` | `@clawmasons/role-*` (unchanged) |
| `@clawmasons/agent-*` | `@clawmasons/member-*` |

Acceptance criteria:
- Given the root `package.json`, when inspected, then `name` is `"@clawmasons/mason"`.
- Given `forge-core/package.json` (renamed to `chapter-core/`), when inspected, then `name` is `"@clawmasons/chapter-core"`.
- Given existing agent packages, when migrated, then their names use the `member-` prefix.

**REQ-005: Member Package Type**

The `agent` package type is replaced by `member`. The member schema extends the former agent schema with: `memberType` (required, `"human"` | `"agent"`), `name` (required, string), `slug` (required, string), `email` (required, string), `authProviders` (optional, string[]).

For `memberType: "agent"`, the `runtimes` and `proxy` fields are required (as they were for agents). For `memberType: "human"`, `runtimes` and `proxy` are not applicable and should not be present.

Acceptance criteria:
- Given a member package with `memberType: "agent"` and `runtimes: ["claude-code-agent"]`, when validated, then it passes.
- Given a member package with `memberType: "human"` and no `runtimes`, when validated, then it passes.
- Given a member package with `memberType: "human"` and `runtimes: ["claude-code-agent"]`, when validated, then it fails.
- Given a member package without `memberType`, when validated, then it fails.
- Given a member package without `name`, `slug`, or `email`, when validated, then it fails.

**REQ-006: Members Registry (`.chapter/members.json`)**

`chapter install` creates/updates a `.chapter/members.json` file that tracks installed members and their status (enabled/disabled). The registry records: package name, member type, status, and installation timestamp.

Acceptance criteria:
- Given `chapter install @acme/member-note-taker`, when `.chapter/members.json` is read, then it contains an entry for `note-taker` with status `"enabled"`.
- Given a member is already installed, when `chapter install` is run for the same member, then the existing entry is updated (not duplicated).

**REQ-007: `chapter enable` / `chapter disable` Commands**

New CLI commands to toggle member status in `.chapter/members.json`.

Acceptance criteria:
- Given a member is installed and enabled, when `chapter disable @note-taker` is run, then `members.json` status is `"disabled"`.
- Given a member is disabled, when `chapter enable @note-taker` is run, then `members.json` status is `"enabled"`.
- Given a member is not installed, when `chapter enable @note-taker` is run, then an error is displayed.
- Given a member is disabled, when `chapter run @note-taker` is run, then an error is displayed (disabled members cannot be started).

**REQ-008: Per-Member Directory Structure**

`chapter install` scaffolds a per-member directory under `.chapter/members/<slug>/` instead of the previous flat layout. Each member gets: `log/` directory, and for agent members: `proxy/`, and runtime directories (e.g., `claude-code-agent/`, `codex/`).

Acceptance criteria:
- Given `chapter install @member-note-taker` where slug is `note-taker`, then `.chapter/members/note-taker/log/` exists.
- Given an agent member with `runtimes: ["claude-code-agent"]`, then `.chapter/members/note-taker/claude-code-agent/workspace/` exists.
- Given an agent member, then `.chapter/members/note-taker/proxy/` exists.
- Given a human member, then `.chapter/members/alice/log/` exists but no `proxy/` or runtime directories.

**REQ-009: Rename Global Data Directory**

The global data directory changes from `~/.forge/` to `~/.chapter/`. The SQLite database moves from `~/.forge/data/forge.db` to `~/.chapter/data/chapter.db`. The `FORGE_DB_PATH` env var is renamed to `CHAPTER_DB_PATH`.

Acceptance criteria:
- Given the proxy starts with no `CHAPTER_DB_PATH` set, then the database is created at `~/.chapter/data/chapter.db`.
- Given `CHAPTER_DB_PATH=/custom/path.db`, then the database is created at that path.

**REQ-010: Rename Internal References**

All internal variable names, function names, class names, type names, and string literals that reference "forge" are renamed to use "chapter" or equivalent. This includes but is not limited to:

- `ForgeProxyServer` → `ChapterProxyServer`
- `parseForgeField()` → `parseChapterField()`
- `forge.lock.json` → `chapter.lock.json`
- `forge.config.json` → `chapter.config.json`
- MCP server name: `"forge"` → `"chapter"`
- Docker network: `agent-net` → `chapter-net`
- Environment variables: `FORGE_*` → `CHAPTER_*`

Acceptance criteria:
- Given the codebase, when grepped for `[Ff]orge` (excluding historical PRDs, CHANGELOG, and git history), then no references to "forge" exist in source code, test code, or configuration files.

### P1 — Nice-to-Have

**REQ-011: Role-Based Task Assignment for Members**

Roles define not just what tasks a member can run, but which other members they can delegate tasks to. This enables hierarchical task routing where a human member can assign work to agent members within the governance boundary.

Acceptance criteria:
- Given a role with `delegateTo: ["@acme/member-note-taker"]`, when member Alice has that role, then Alice can assign tasks to the note-taker agent.
- (Detailed design deferred to future PRD.)

**REQ-012: Member Activity Log**

Every member's `log/` directory captures structured activity logs (JSON lines). For agent members, logs include proxy interactions, tool calls, and task executions. For human members, logs capture task assignments and completions.

Acceptance criteria:
- Given an agent member runs a task, then an entry is written to `.chapter/members/<slug>/log/`.
- (Detailed schema and rotation policy deferred to future PRD.)

### P2 — Future Consideration

**REQ-013: Member Authentication & Authorization**

The `authProviders` field on member packages is used to integrate with external identity providers (GitHub OAuth, Google, Okta) for member authentication. This enables multi-user chapters where access is controlled by identity.

**REQ-014: Member Communication**

Members can communicate with each other through a chapter-internal messaging system, enabling coordination between humans and agents.

---

## 8. Architecture

### 8.1 Package Metadata Field Change

**Before:**
```json
{
  "name": "@clawmasons/agent-note-taker",
  "forge": {
    "type": "agent",
    "runtimes": ["claude-code-agent"],
    "roles": ["@clawmasons/role-writer"]
  }
}
```

**After:**
```json
{
  "name": "@clawmasons/member-note-taker",
  "chapter": {
    "type": "member",
    "memberType": "agent",
    "name": "Note Taker",
    "slug": "note-taker",
    "email": "note-taker@chapter.local",
    "authProviders": [],
    "runtimes": ["claude-code-agent"],
    "roles": ["@clawmasons/role-writer"]
  }
}
```

### 8.2 Install Flow (Updated)

```
chapter install @<member>
  │
  ├─1─ npm install: install the member package and dependencies
  ├─2─ Graph resolution: walk typed dependency graph → ResolvedMember
  ├─3─ Validation: same checks as chapter validate
  ├─4─ Compute toolFilters (agent members only)
  ├─5─ Scaffold per-member directory:
  │      ├── .chapter/members/<slug>/log/
  │      ├── .chapter/members/<slug>/proxy/ (agent only)
  │      └── .chapter/members/<slug>/<runtime>/ (agent only, per runtime)
  ├─6─ Materialize runtimes (agent members only)
  ├─7─ Generate docker-compose.yml (agent members only)
  ├─8─ Write chapter.lock.json
  ├─9─ Update .chapter/members.json (add/update entry, status: "enabled")
  └─10─ Credential prompting
```

### 8.3 Scaffolded Directory Layout (Agent Member)

```
.chapter/members/note-taker/
├── docker-compose.yml
├── .env
├── chapter.lock.json
│
├── proxy/                           # replaces mcp-proxy/
│   └── (proxy config if needed)
│
├── log/                             # activity logs
│
├── claude-code-agent/
│   ├── Dockerfile
│   └── workspace/
│       ├── .claude/
│       │   ├── settings.json
│       │   └── commands/
│       ├── AGENTS.md
│       └── skills/
│
└── codex/
    ├── Dockerfile
    └── workspace/
        ├── codex.json
        ├── instructions.md
        └── skills/
```

### 8.4 Member Type Discrimination

```typescript
const memberChapterFieldSchema = z.discriminatedUnion("memberType", [
  z.object({
    type: z.literal("member"),
    memberType: z.literal("agent"),
    name: z.string(),
    slug: z.string(),
    email: z.string().email(),
    authProviders: z.array(z.string()).optional().default([]),
    description: z.string().optional(),
    runtimes: z.array(z.string()).min(1),
    roles: z.array(z.string()).min(1),
    resources: z.array(resourceSchema).optional().default([]),
    proxy: proxySchema.optional(),
  }),
  z.object({
    type: z.literal("member"),
    memberType: z.literal("human"),
    name: z.string(),
    slug: z.string(),
    email: z.string().email(),
    authProviders: z.array(z.string()).optional().default([]),
    description: z.string().optional(),
    roles: z.array(z.string()).min(1),
  }),
]);
```

---

## 9. Migration Guide

### 9.1 For Package Authors

1. Rename `"forge"` field → `"chapter"` in all `package.json` files.
2. Change `"type": "agent"` → `"type": "member"` and add `memberType`, `name`, `slug`, `email` fields.
3. Rename packages: `@scope/agent-*` → `@scope/member-*`.
4. Update all cross-references in role/task packages to use new member package names.

### 9.2 For Users

1. Install `@clawmasons/mason` instead of `@clawmasons/forge`.
2. Use `chapter` CLI instead of `forge`.
3. Existing `.forge/` directories will need to be migrated to `.chapter/`.

---

## 10. Open Questions

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| Q1 | Should we provide a `chapter migrate` command that converts `.forge/` → `.chapter/` and updates package.json `forge` → `chapter` fields automatically? | Engineering | No |
| Q2 | Should human members be installable via `chapter install`, or should they be added via a separate `chapter add-member` command? | Product | No |
| Q3 | For the `members.json` status, should there be additional states beyond enabled/disabled (e.g., `suspended`, `pending-approval`)? | Product | No |
| Q4 | Should the `slug` field be auto-derived from the package name (strip scope and `member-` prefix), or always explicitly declared? | Engineering | No |
| Q5 | Should the `forge` metadata field continue to be accepted as an alias during a deprecation period? | Product | Yes |

---

## 11. Timeline Considerations

### Phase 1: Rebrand — forge → chapter
- Rename CLI binary, package names, directory structures
- Update all source code references
- Rename package metadata field from `forge` to `chapter`
- Update templates, tests, documentation

### Phase 2: Member Model
- Replace `agent` package type with `member`
- Add `memberType`, `name`, `slug`, `email`, `authProviders` fields
- Update Zod schemas, resolver, validator
- Update materializers for per-member directory layout

### Phase 3: Member Management
- Implement `.chapter/members.json` registry
- Implement `chapter enable` / `chapter disable` commands
- Update `chapter install` to write member registry
- Update `chapter run` to respect enabled/disabled status

### Phase 4: Per-Member Directory Structure
- Scaffold per-member directories under `.chapter/members/<slug>/`
- Move proxy config to per-member `proxy/` directory
- Add `log/` directories for all members
- Update Docker Compose generation for per-member layout

### Phase 5: End-to-End Validation
- Update all tests for new naming
- Run full workflow: init → install → enable → run → stop
- Verify backward compatibility is cleanly broken (no mixed state)

---

## Appendix A: chapter Field JSON Schema Reference

| Property | app | skill | task | role | member |
|----------|-----|-------|------|------|--------|
| `type` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `memberType` | — | — | — | — | ✓ |
| `name` | — | — | — | — | ✓ |
| `slug` | — | — | — | — | ✓ |
| `email` | — | — | — | — | ✓ |
| `authProviders` | — | — | — | — | ✓ |
| `description` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `transport` | ✓ | — | — | — | — |
| `command` | ✓ | — | — | — | — |
| `args` | ✓ | — | — | — | — |
| `url` | ✓ | — | — | — | — |
| `env` | ✓ | — | — | — | — |
| `tools` | ✓ | — | — | — | — |
| `capabilities` | ✓ | — | — | — | — |
| `artifacts` | — | ✓ | — | — | — |
| `taskType` | — | — | ✓ | — | — |
| `prompt` | — | — | ✓ | — | — |
| `requires` | — | — | ✓ | — | — |
| `timeout` | — | — | ✓ | — | — |
| `approval` | — | — | ✓ | — | — |
| `tasks` | — | — | — | ✓ | — |
| `permissions` | — | — | — | ✓ | — |
| `constraints` | — | — | — | ✓ | — |
| `runtimes` | — | — | — | — | ✓ (agent) |
| `roles` | — | — | — | — | ✓ |
| `resources` | — | — | — | — | ✓ |
| `proxy` | — | — | — | — | ✓ (agent) |
