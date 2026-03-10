## 1. Generator

- [x] 1.1 Create `packages/cli/src/generator/credential-service-dockerfile.ts` with `generateCredentialServiceDockerfile()` function
- [x] 1.2 Update `packages/cli/src/generator/index.ts` to export the new generator

## 2. Docker-init Integration

- [x] 2.1 Import the generator in `packages/cli/src/cli/commands/docker-init.ts`
- [x] 2.2 Add credential service Dockerfile generation in `generateDockerfiles()` — write to `docker/credential-service/Dockerfile`

## 3. Tests

- [x] 3.1 Create `packages/cli/tests/generator/credential-service-dockerfile.test.ts` with unit tests
- [x] 3.2 Verify tests cover: non-empty output, node:22-slim base, USER mason, build tools, credential-service entrypoint, native addon rebuild, no registry references

## 4. Verification

- [x] 4.1 `npx tsc --noEmit` compiles
- [x] 4.2 `npx eslint packages/cli/src/ packages/cli/tests/` passes
- [x] 4.3 `npx vitest run` passes
