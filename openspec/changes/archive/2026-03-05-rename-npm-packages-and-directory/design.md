## Context

The chapter-members PRD requires renaming all npm packages from `@clawmasons/forge*` to `@clawmasons/chapter*` (REQ-004) and renaming the CLI binary from `forge` to `chapter` (REQ-001). This is Change #2 in the implementation plan, building on Change #1 which already renamed the metadata field from `"forge"` to `"chapter"`.

The current codebase has:
- Root package: `@clawmasons/forge` with `bin: { "forge": "./bin/forge.js" }`
- Workspace package: `forge-core/` containing `@clawmasons/forge-core`
- Agent package: `@clawmasons/agent-note-taker` in `forge-core/agents/`
- Template dependency on `@clawmasons/forge-core`
- Template agent packages with `agent-` prefix
- Proxy Dockerfile ENTRYPOINT referencing `/app/forge/bin/forge.js`
- Docker build context using `forge-proxy/forge/` paths
- Docker Compose referencing `./forge-proxy` build path

## Goals / Non-Goals

**Goals:**
- Rename root package from `@clawmasons/forge` to `@clawmasons/chapter`
- Rename `forge-core/` directory to `chapter-core/` and package to `@clawmasons/chapter-core`
- Rename `bin/forge.js` to `bin/chapter.js` and update bin field
- Rename `@clawmasons/agent-note-taker` to `@clawmasons/member-note-taker`
- Rename `forge-core/agents/` to `chapter-core/members/`
- Rename `templates/note-taker/agents/` to `templates/note-taker/members/`
- Update template dependencies and workspace configs
- Update proxy Dockerfile generator for new paths
- Update install command's Docker build context paths (`forge-proxy/forge/` -> `chapter-proxy/chapter/`)
- Update Docker Compose generation for `chapter-proxy` paths
- Update all test references
- Regenerate package-lock.json
- All tests pass, TypeScript compiles, linter passes

**Non-Goals:**
- Renaming `.forge/` -> `.chapter/` directory paths -- that is Change #3
- Renaming environment variables `FORGE_*` -> `CHAPTER_*` -- that is Change #3
- Renaming `ForgeProxyServer` class -- that is Change #3
- Renaming CLI help text and output messages -- that is Change #4
- Adding the `member` package type schema -- that is Change #5
- The `"agents"` workspace dir in templates init -- will be changed in Change #9

## Decisions

**1. Directory rename: forge-core/ -> chapter-core/**
- Use `git mv` to preserve history
- Update root `package.json` workspaces from `["forge-core"]` to `["chapter-core"]`
- Update `chapter-core/package.json` name, description, and files array

**2. Binary rename: bin/forge.js -> bin/chapter.js**
- Use `git mv` to preserve file history
- Update root `package.json` bin from `{ "forge": "./bin/forge.js" }` to `{ "chapter": "./bin/chapter.js" }`
- The file content stays the same (just imports and runs the CLI)

**3. Agent -> member directory rename**
- `forge-core/agents/` -> `chapter-core/members/`
- `templates/note-taker/agents/` -> `templates/note-taker/members/`
- Package name: `@clawmasons/agent-note-taker` -> `@clawmasons/member-note-taker`
- Template package name: `@{{projectScope}}/agent-note-taker` -> `@{{projectScope}}/member-note-taker`
- `chapter-core/package.json` files array: `"agents"` -> `"members"`

**4. Docker build context paths**
- `forge-proxy/Dockerfile` path -> `chapter-proxy/Dockerfile`
- `forge-proxy/forge/dist` -> `chapter-proxy/chapter/dist`
- `forge-proxy/forge/bin` -> `chapter-proxy/chapter/bin`
- `forge-proxy/forge/package.json` -> `chapter-proxy/chapter/package.json`
- `forge-proxy/workspace/` -> `chapter-proxy/workspace/`
- `forge-proxy/logs` -> `chapter-proxy/logs`
- Dockerfile WORKDIR: `/app/forge` -> `/app/chapter`
- Dockerfile COPY: `forge/` -> `chapter/`
- Dockerfile ENTRYPOINT: `/app/forge/bin/forge.js` -> `/app/chapter/bin/chapter.js`

**5. Template workspaces field**
- The templates `package.json` has `"workspaces": ["apps/*", "tasks/*", "skills/*", "roles/*", "agents/*"]`
- Change `"agents/*"` -> `"members/*"` since the directory was renamed
- Update dependency: `@clawmasons/forge-core` -> `@clawmasons/chapter-core`

**6. Package-lock.json regeneration**
- After all renames, delete and regenerate `package-lock.json` via `npm install`

## Risks / Trade-offs

- [Risk: Missed references] -> Mitigated by grepping for `forge-core`, `@clawmasons/forge`, `bin/forge`, `agent-note-taker`, `forge-proxy/forge` after changes
- [Risk: Docker build broken] -> The proxy Dockerfile, install command, and compose generation all reference `forge-proxy/` paths. All must be updated together. Mitigated by existing test coverage.
- [Risk: Template breakage] -> Templates use placeholders; need to verify `chapter init` still works with renamed directories
- [Risk: package-lock.json conflicts] -> Regenerating the lockfile ensures consistency but may cause merge conflicts with other branches
