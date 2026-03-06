## 1. Create fixture workspace root

- [x] 1.1 Create `e2e/fixtures/test-chapter/package.json` with:
  - `name: "e2e-test-chapter"`, `version: "0.1.0"`, `private: true`
  - `workspaces: ["members/*"]`
  - `dependencies: { "@clawmasons/chapter-core": "*" }`

## 2. Create test-note-taker member fixture

- [x] 2.1 Create `e2e/fixtures/test-chapter/members/test-note-taker/package.json` with:
  - `name: "@test/member-test-note-taker"`, `version: "1.0.0"`
  - `chapter.type: "member"`, `chapter.memberType: "agent"`
  - `chapter.name: "Test Note Taker"`, `chapter.slug: "test-note-taker"`
  - `chapter.email: "test-note-taker@chapter.local"`
  - `chapter.runtimes: ["pi-coding-agent"]`
  - `chapter.roles: ["@clawmasons/role-writer"]`
  - `chapter.llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" }`
  - `dependencies: { "@clawmasons/chapter-core": "*" }`

## 3. Verify

- [x] 3.1 `npx tsc --noEmit` passes (main project unaffected by fixture files)
- [x] 3.2 `npx eslint src/ tests/` passes (no regressions)
- [x] 3.3 `npx vitest run` passes — 733 tests, 41 test files, 0 failures
- [x] 3.4 Fixture member `package.json` passes schema validation via `parseChapterField()` / `memberChapterFieldSchema`
- [x] 3.5 Fixture declares `pi-coding-agent` runtime, `openrouter` provider, and depends on `@clawmasons/role-writer`
