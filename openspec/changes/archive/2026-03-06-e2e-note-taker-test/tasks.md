## 1. Create E2E test file

- [x] 1.1 Create `e2e/tests/note-taker-pi.test.ts` with:
  - `beforeAll` hook: create temp workspace, copy fixtures, symlink `@clawmasons/chapter-core`, run `chapter init`, `chapter install @test/member-test-note-taker`
  - `afterAll` hook: remove temp workspace directory
  - 120-second timeout on `beforeAll`

## 2. Workspace materialization tests

- [x] 2.1 Test: `AGENTS.md` exists in `pi-coding-agent/workspace/`
- [x] 2.2 Test: `AGENTS.md` contains agent identity and role-writer context
- [x] 2.3 Test: `.pi/settings.json` exists and contains `openrouter/anthropic/claude-sonnet-4` model ID
- [x] 2.4 Test: `.pi/extensions/chapter-mcp/index.ts` exists
- [x] 2.5 Test: `.pi/extensions/chapter-mcp/package.json` exists
- [x] 2.6 Test: Extension code contains `pi.registerMcpServer(` call
- [x] 2.7 Test: Extension code contains `pi.registerCommand(` with `take-notes` command name
- [x] 2.8 Test: Extension code has baked proxy token (Bearer + hex, not process.env placeholder)
- [x] 2.9 Test: `skills/markdown-conventions/README.md` exists

## 3. Docker Compose tests

- [x] 3.1 Test: `docker-compose.yml` exists
- [x] 3.2 Test: Contains `pi-coding-agent:` service definition
- [x] 3.3 Test: Service builds from `./pi-coding-agent` directory
- [x] 3.4 Test: Service depends on `mcp-proxy`
- [x] 3.5 Test: Service environment includes `OPENROUTER_API_KEY`

## 4. Env configuration tests

- [x] 4.1 Test: `.env` file exists
- [x] 4.2 Test: `.env` contains `OPENROUTER_API_KEY=`
- [x] 4.3 Test: `.env` contains `CHAPTER_PROXY_TOKEN=` with a non-empty hex value

## 5. Dockerfile tests

- [x] 5.1 Test: `pi-coding-agent/Dockerfile` exists
- [x] 5.2 Test: Dockerfile installs `@mariozechner/pi-coding-agent`
- [x] 5.3 Test: Dockerfile uses `pi --no-session --mode print` CMD

## 6. Infrastructure tests (gated / skip)

- [x] 6.1 Placeholder test: proxy connectivity (skip -- requires Docker)
- [x] 6.2 Placeholder test: task execution (skip -- requires OPENROUTER_API_KEY)

## 7. Verify

- [x] 7.1 `npx tsc --noEmit` passes (in e2e directory)
- [x] 7.2 `cd e2e && npx vitest run` passes -- 20 passed, 2 skipped (22 total)
- [x] 7.3 `npx vitest run` passes in root -- 733 tests, 41 test files, 0 failures
- [x] 7.4 `npx eslint src/ tests/` passes
