## 1. Add Template Components

- [x] 1.1 Copy `chapter-core/apps/filesystem/` to `templates/note-taker/apps/filesystem/` and change package name to `@{{projectScope}}/app-filesystem`
- [x] 1.2 Copy `chapter-core/skills/markdown-conventions/` to `templates/note-taker/skills/markdown-conventions/` (including SKILL.md) and change package name to `@{{projectScope}}/skill-markdown-conventions`
- [x] 1.3 Copy `chapter-core/tasks/take-notes/` to `templates/note-taker/tasks/take-notes/` (including prompts/) and change package name to `@{{projectScope}}/task-take-notes`, update `requires` references to use `@{{projectScope}}/` scope
- [x] 1.4 Update `templates/note-taker/roles/writer/package.json` permissions key from `@clawmasons/app-filesystem` to `@{{projectScope}}/app-filesystem`

## 2. Remove chapter-core

- [x] 2.1 Delete the `chapter-core/` directory entirely
- [x] 2.2 Remove `"chapter-core"` from root `package.json` workspaces array

## 3. Update Discovery Logic

- [x] 3.1 Remove `scanPackageWorkspaceDirs` function from `src/resolver/discover.ts`
- [x] 3.2 Remove calls to `scanPackageWorkspaceDirs` from `scanNodeModules` function

## 4. Update Tests

- [x] 4.1 Update `tests/cli/init.test.ts` — remove chapter-core dependency assertions, update template structure expectations to include apps/, skills/, tasks/ directories, update role reference assertions to use projectScope placeholders
- [x] 4.2 Update `tests/resolver/discover.test.ts` — remove chapter-core sub-component discovery tests, remove workspace-local precedence over chapter-core tests
- [x] 4.3 Update `tests/integration/install-flow.test.ts` — remove chapter-core packing/installation, update expectations for template structure without chapter-core dependency

## 5. Update E2E Fixtures

- [x] 5.1 Remove `@clawmasons/chapter-core` dependency from `e2e/fixtures/test-chapter/package.json`
- [x] 5.2 Add local component directories (apps/, tasks/, skills/) to e2e fixture if needed for discovery tests (not needed — fixture already has all components locally)
