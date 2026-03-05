## 1. Project Setup

- [x] 1.1 Add `commander` as a runtime dependency in package.json
- [x] 1.2 Create `bin/forge.js` shebang wrapper that imports and runs `dist/cli/index.js`
- [x] 1.3 Add `"bin": { "forge": "./bin/forge.js" }` to package.json

## 2. CLI Framework

- [x] 2.1 Create `src/cli/index.ts` with Commander.js program setup (name, version, description) and a `run()` export
- [x] 2.2 Create `src/cli/commands/index.ts` as command registry that registers all commands on the program
- [x] 2.3 Create `src/cli/commands/init.ts` with the init command definition (name, description, `--name` option)

## 3. Init Command Implementation

- [x] 3.1 Implement workspace detection: check for `.forge/` directory, warn and exit if found
- [x] 3.2 Implement directory scaffolding: create `apps/`, `tasks/`, `skills/`, `roles/`, `agents/`, `.forge/`
- [x] 3.3 Implement `package.json` generation: `private: true`, workspaces array, name from `--name` or directory name, version `0.1.0`. Skip if package.json already exists (warn user).
- [x] 3.4 Implement `.forge/config.json` generation with `{ "version": "0.1.0" }`
- [x] 3.5 Implement `.forge/.env.example` generation with commented credential placeholders
- [x] 3.6 Implement `.gitignore` generation with `node_modules/`, `.env`, `dist/`, `.forge/.env`. Skip if `.gitignore` already exists.
- [x] 3.7 Implement success output: list created files/directories and print next-steps hint

## 4. Tests

- [x] 4.1 Add tests for CLI entry point: version output, help output, unknown command error
- [x] 4.2 Add tests for init in empty directory: all directories and files created with correct content
- [x] 4.3 Add tests for init with `--name` flag: package.json name matches flag value
- [x] 4.4 Add tests for idempotency: init on existing workspace warns and exits without changes
- [x] 4.5 Add tests for existing package.json: not overwritten, warning displayed
- [x] 4.6 Add tests for existing .gitignore: not overwritten
