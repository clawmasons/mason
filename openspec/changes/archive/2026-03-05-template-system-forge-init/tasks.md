## 1. Create templates/note-taker/ directory

- [x] 1.1 Create `templates/note-taker/package.json` with `@clawforge/forge-core` dependency and npm workspace config using `{{projectName}}` for the package name
- [x] 1.2 Create `templates/note-taker/agents/note-taker/package.json` with `@{{projectScope}}/agent-note-taker` name and forge agent type referencing `@{{projectScope}}/role-writer`
- [x] 1.3 Create `templates/note-taker/roles/writer/package.json` with `@{{projectScope}}/role-writer` name and forge role type referencing `@clawforge/*` tasks, skills, and apps

## 2. Enhance forge init with template support

- [x] 2.1 Add `--template <name>` option to the init command registration
- [x] 2.2 Implement `getTemplatesDir()` to resolve the templates directory relative to the forge package (using `import.meta.url`)
- [x] 2.3 Implement `listTemplates()` to read available template names from the templates directory
- [x] 2.4 Implement `copyTemplateFiles()` to recursively copy template files to the target directory with `{{projectName}}` and `{{projectScope}}` placeholder substitution in package.json files
- [x] 2.5 Implement `deriveProjectScope()` to extract project scope from `--name` value or directory basename (e.g., `@acme/my-agent` -> `acme`, `test-forge` -> `test-forge`)
- [x] 2.6 Update `runInit()` flow: when `--template` is specified, copy template files first, then create forge scaffold, then run `npm install`
- [x] 2.7 When `--template` is not specified, list available templates before proceeding with bare scaffold
- [x] 2.8 Update success output to show template-specific next steps (e.g., `forge validate @<scope>/agent-note-taker`)

## 3. Update package configuration

- [x] 3.1 Add `"templates"` to the root `package.json` `files` array (added alongside `"dist"` and `"bin"`)

## 4. Write tests

- [x] 4.1 Test: `forge init --template note-taker` copies template files to target directory
- [x] 4.2 Test: template package.json files have `{{projectScope}}` replaced with directory name
- [x] 4.3 Test: `forge init --template note-taker --name @acme/my-agent` scopes local components as `@acme/*`
- [x] 4.4 Test: `forge init --template nonexistent` shows error about unknown template
- [x] 4.5 Test: `forge init` without `--template` lists available templates
- [x] 4.6 Test: existing init behavior (empty directory, --name flag, idempotency) still works
- [x] 4.7 Tests for `deriveProjectScope()` (scoped names, unscoped names)
- [x] 4.8 Tests for `listTemplates()` (directory names, nonexistent dir, empty dir)
- [x] 4.9 Tests for `copyTemplateFiles()` (recursive copy, placeholder substitution, non-package.json files preserved)

## 5. Verify

- [x] 5.1 Run `npx tsc --noEmit` — no type errors in init.ts or init.test.ts
- [x] 5.2 Run `npx eslint src/ tests/` — no lint errors
- [x] 5.3 Run `npx vitest run` — all 548 tests pass (34 init tests, 0 regressions)
