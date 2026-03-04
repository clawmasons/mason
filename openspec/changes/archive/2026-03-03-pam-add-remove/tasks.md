## 1. pam add command

- [x] 1.1 Create `src/cli/commands/add.ts` with `registerAddCommand` and `runAdd` functions following existing command patterns
- [x] 1.2 Implement npm install delegation via `execFileSync("npm", ["install", pkg, ...npmArgs])` with `stdio: "inherit"` and `cwd: rootDir`
- [x] 1.3 Implement post-install pam field validation: read `node_modules/<pkg>/package.json`, call `parsePamField()`, uninstall on failure
- [x] 1.4 Register the add command in `src/cli/commands/index.ts`
- [x] 1.5 Create `tests/cli/add.test.ts` with tests for: CLI registration, valid pam package add, non-pam package rejection with rollback, invalid pam field rejection, npm failure handling, scoped package resolution

## 2. pam remove command

- [x] 2.1 Create `src/cli/commands/remove.ts` with `registerRemoveCommand` and `runRemove` functions
- [x] 2.2 Implement `findDependents(targetPkg, packages)` utility that scans pam fields for references (role permissions keys, role tasks/skills arrays, task requires.apps/skills, agent roles)
- [x] 2.3 Implement dependent checking: block removal if dependents exist (unless `--force`), list dependents in error output
- [x] 2.4 Implement npm uninstall delegation via `execFileSync("npm", ["uninstall", pkg, ...npmArgs])`
- [x] 2.5 Register the remove command in `src/cli/commands/index.ts`
- [x] 2.6 Create `tests/cli/remove.test.ts` with tests for: CLI registration, removal with no dependents, blocked removal with dependents, forced removal with dependents, dependent detection across all reference types, npm failure handling
