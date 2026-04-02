## 1. Proxy Static Config

- [x] 1.1 Define `ProxyConfigFile` interface (role, toolFilters, approvalPatterns, upstreams) in `@clawmasons/shared` or `@clawmasons/proxy`
- [x] 1.2 Add config generation logic to `ensureProxyDependencies()` in `proxy-dependencies.ts` — resolve role, compute tool filters, collect MCP servers, serialize to `proxy-config.json`
- [x] 1.3 Remove BFS dependency collection, hoisting, workspace package copying, .bin link creation, and package.json generation from `ensureProxyDependencies()`
- [x] 1.4 Remove `synthesizeRolePackages()` function and its callers in `build.ts` and `run-agent.ts`

## 2. Proxy Entry Rewrite

- [x] 2.1 Rewrite `proxy-entry.ts` to read `proxy-config.json` from cwd, resolve env var placeholders, and create `UpstreamManager` directly
- [x] 2.2 Remove `startProxy()` orchestrator, `resolveRoleName()`, `collectMcpServers()`, and `collectApprovalPatterns()` from `proxy.ts` (or simplify to config-based flow)
- [x] 2.3 Remove unused imports: `discoverPackages`, `resolveRolePackage` from proxy code path
- [ ] 2.4 Verify proxy bundle size reduction after removing discovery/resolution modules

## 3. Dockerfile Generator Updates

- [x] 3.1 Update `generateProxyDockerfile()` — remove `COPY node_modules/` and `COPY package.json`, add `COPY --chown=mason:mason proxy-config.json`, move user creation before COPY statements, update ENTRYPOINT/CMD
- [x] 3.2 Update `generateAgentDockerfile()` — remove `COPY node_modules/` and `ENV PATH` for node_modules/.bin, move user creation before COPY statements, add `--chown=mason:mason` to all application file COPYs
- [x] 3.3 Update Dockerfile tests in `packages/cli/tests/generator/agent-dockerfile.test.ts` and any proxy Dockerfile tests

## 4. Cleanup

- [x] 4.1 Remove dead internal functions from `proxy-dependencies.ts`: `collectPackages`, `copyPackages`, `hoistNestedDependencies`, `createBinLinks`, `walkScopedPackages`, `copyWorkspacePackages`
- [x] 4.2 Verify `discoverPackages()` and `resolveRolePackage()` have no other production callers — if none, consider marking as internal/removing exports
- [x] 4.3 Delete generated `.mason/docker/node_modules/` from any existing build contexts (add to `.gitignore` if not already)

## 5. Verification

- [x] 5.1 Run `npx tsc --noEmit` — no type errors
- [x] 5.2 Run `npx vitest run packages/cli/tests/` — unit tests pass
- [ ] 5.3 Run `mason build` on a test project and verify Docker build context contains only `proxy-bundle.cjs` + `proxy-config.json` (no `node_modules/`)
- [ ] 5.4 Run `mason run` and verify proxy container starts successfully from config file
- [ ] 5.5 Verify agent container starts successfully without `node_modules/`
