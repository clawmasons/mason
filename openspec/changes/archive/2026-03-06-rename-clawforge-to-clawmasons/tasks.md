## 1. Package Manifests

- [ ] 1.1 Rename `@clawforge/*` to `@clawmasons/*` in root `package.json`
- [ ] 1.2 Rename scope in `forge-core/package.json` and all `forge-core/*/package.json`
- [ ] 1.3 Rename scope in `templates/note-taker/package.json` and sub-packages
- [ ] 1.4 Delete `package-lock.json` and regenerate with `npm install`

## 2. Source Code

- [ ] 2.1 Replace all `clawforge` references in `src/` files
- [ ] 2.2 Replace all `clawforge` references in `tests/` files

## 3. OpenSpec Specs

- [ ] 3.1 Replace all `clawforge` references in `openspec/specs/` files
- [ ] 3.2 Replace all `clawforge` references in `openspec/prds/` files

## 4. OpenSpec Archives

- [ ] 4.1 Replace all `clawforge` references in `openspec/changes/archive/` files

## 5. Documentation

- [ ] 5.1 Replace all `clawforge` references in `README.md`

## 6. Verification

- [ ] 6.1 Grep for any remaining `clawforge` references and fix
- [ ] 6.2 Run `npx tsc --noEmit` to verify compilation
- [ ] 6.3 Run `npx vitest run` to verify all tests pass
