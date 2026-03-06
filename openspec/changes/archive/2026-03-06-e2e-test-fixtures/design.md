## Architecture

The E2E test fixtures represent a minimal but realistic chapter configuration. The fixture workspace mirrors the structure of a real chapter project: a root `package.json` with npm workspaces pointing to member directories, and individual member packages that declare their chapter metadata.

### Fixture Structure

```
e2e/fixtures/test-chapter/
├── package.json                          # Workspace root
└── members/
    └── test-note-taker/
        └── package.json                  # Pi-coding-agent member
```

### Root `package.json` (`e2e/fixtures/test-chapter/package.json`)

The root package acts as a workspace container. It:
- Uses npm workspaces to discover member packages in `members/*`
- Declares a dependency on `@clawmasons/chapter-core` to pull in the role/task/skill/app packages that the member depends on
- Is marked `private: true` since it's a workspace root, not a publishable package

```json
{
  "name": "e2e-test-chapter",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["members/*"],
  "dependencies": {
    "@clawmasons/chapter-core": "*"
  }
}
```

The `workspaces` array includes only `members/*` because this fixture only contains member packages. The existing chapter-core package provides all apps, tasks, skills, and roles via its own transitive dependency chain.

### Member `package.json` (`e2e/fixtures/test-chapter/members/test-note-taker/package.json`)

The test-note-taker member is an agent that uses `pi-coding-agent` as its runtime with OpenRouter as the LLM provider. It mirrors the existing `@clawmasons/member-note-taker` from chapter-core but swaps the runtime from `claude-code` to `pi-coding-agent` and adds the required `llm` configuration.

```json
{
  "name": "@test/member-test-note-taker",
  "version": "1.0.0",
  "chapter": {
    "type": "member",
    "memberType": "agent",
    "name": "Test Note Taker",
    "slug": "test-note-taker",
    "email": "test-note-taker@chapter.local",
    "runtimes": ["pi-coding-agent"],
    "roles": ["@clawmasons/role-writer"],
    "llm": {
      "provider": "openrouter",
      "model": "anthropic/claude-sonnet-4"
    }
  },
  "dependencies": {
    "@clawmasons/chapter-core": "*"
  }
}
```

Key design decisions for the member fixture:

1. **`@test/` scope**: Uses a `@test/` npm scope to distinguish test packages from production `@clawmasons/` packages. This prevents confusion and avoids any risk of name collisions.

2. **`runtimes: ["pi-coding-agent"]`**: Uses pi-coding-agent only (not multi-runtime) to keep the fixture focused on testing the pi materializer path.

3. **`llm` field**: Declares `openrouter` as the provider and `anthropic/claude-sonnet-4` as the model. This satisfies the validation requirement that pi-coding-agent members must have an `llm` field (Change 2).

4. **`roles: ["@clawmasons/role-writer"]`**: Reuses the existing role-writer from chapter-core, which provides the full dependency chain:
   - `@clawmasons/role-writer` -> requires `@clawmasons/task-take-notes`, `@clawmasons/skill-markdown-conventions`
   - `@clawmasons/task-take-notes` -> requires `@clawmasons/app-filesystem`, `@clawmasons/skill-markdown-conventions`
   - This exercises the full graph resolution and materialization pipeline.

5. **No `authProviders` field**: Omitted since it defaults to `[]` via the schema. The fixture keeps only the required/meaningful fields.

6. **`dependencies` on chapter-core**: The member declares a direct dependency on `@clawmasons/chapter-core` so npm can resolve the role, task, skill, and app packages through chapter-core's exported files.

### Integration with Setup Script

The existing setup script (`e2e/scripts/setup-chapter.ts`) already handles these fixtures:

1. `copyDirRecursive()` copies `e2e/fixtures/test-chapter/members/test-note-taker/` into the temp workspace's `members/` directory
2. The root `package.json` is copied from `e2e/fixtures/test-chapter/package.json`
3. `discoverFixtureMembers()` reads the member's `package.json`, finds `chapter.type === "member"`, and returns `@test/member-test-note-taker`
4. The script runs `node bin/chapter.js install @test/member-test-note-taker` which triggers the pi-coding-agent materializer

No changes to the setup script are needed.

## Decisions

1. **Minimal fixture set**: Only one member (test-note-taker) is included. This is sufficient for the E2E test in Change 8 and avoids unnecessary complexity. Additional fixtures can be added for future test scenarios.

2. **No fixture for apps/tasks/skills/roles directories**: The member depends on `@clawmasons/chapter-core` which provides all the role/task/skill/app packages. There's no need to duplicate them in the fixture directory.

3. **Workspace root includes `members/*` only**: Since apps, tasks, skills, and roles come from chapter-core (via npm dependency resolution), only the `members/` directory needs workspace resolution.

4. **No `.env` or configuration in fixtures**: The fixture packages contain only `package.json` files. Runtime configuration (API keys, workspace paths) is handled by the setup script and `.env` files, not embedded in fixtures.
