## 1. Core Implementation

- [x] 1.1 Create `packages/cli/src/cli/commands/pack.ts` with `registerPackCommand` and `runPack` functions
- [x] 1.2 Implement dist/ cleaning logic (remove existing .tgz files, create dir if missing)
- [x] 1.3 Implement build step (exec `npm run build` from project root)
- [x] 1.4 Implement workspace discovery (glob `packages/*/package.json` to get package names)
- [x] 1.5 Implement pack step (exec `npm pack` per workspace with `--pack-destination dist/`)
- [x] 1.6 Add progress logging and final summary

## 2. CLI Registration

- [x] 2.1 Register `pack` command in `packages/cli/src/cli/commands/index.ts`

## 3. Integration

- [x] 3.1 Update `docker-init.ts` error message to reference `chapter pack`

## 4. Testing

- [x] 4.1 Add unit tests for `runPack` in `packages/cli/tests/cli/pack.test.ts`
- [x] 4.2 Verify typecheck, lint, and existing tests pass
