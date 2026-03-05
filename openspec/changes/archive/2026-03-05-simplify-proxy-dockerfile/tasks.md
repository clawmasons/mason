## 1. Update generateProxyDockerfile()

- [x] 1.1 Rewrite `src/generator/proxy-dockerfile.ts` to produce a single-stage Dockerfile: single `FROM node:22-slim`, copy package manifests first, `RUN npm ci --omit=dev --ignore-scripts`, copy `forge/dist` and `forge/bin`, copy `workspace/`, mkdir+chown, `USER node`, `WORKDIR /app/workspace`, `ENTRYPOINT ["node", "/app/forge/bin/forge.js"]`, `CMD ["proxy", "--agent", "<agentName>"]`
- [x] 1.2 Update the JSDoc comment to reflect single-stage pre-built approach

## 2. Update runInstall() forge build context

- [x] 2.1 In `src/cli/commands/install.ts`, replace the forge source copy section with copying pre-built forge: `dist/`, `bin/` from `getForgeProjectRoot()`
- [x] 2.2 Copy `package.json` and `package-lock.json` for dependency installation in Docker
- [x] 2.3 Remove the config file loop that copied `tsconfig.json`, `tsconfig.build.json`
- [x] 2.4 Add configurable `skipDirs` parameter to `copyDirToFiles()` helper (default: `["node_modules", ".git"]`)

## 3. Update tests

- [x] 3.1 Update `tests/generator/proxy-dockerfile.test.ts`: replace multi-stage expectations with single-stage, update entrypoint path to `/app/forge/bin/forge.js`, add tests for `npm ci --omit=dev`, package manifest copying
- [x] 3.2 Update `tests/cli/install.test.ts`: change "copies forge source" test to verify no `src/` or `tsconfig` in build context, verify `package.json` still present

## 4. Verify

- [x] 4.1 Run `npx tsc --noEmit` — no new errors in changed files
- [x] 4.2 Run `npx eslint src/ tests/` — clean
- [x] 4.3 Run `npx vitest run` — all 550 tests pass
