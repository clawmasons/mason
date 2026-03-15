## Context

`run-agent.ts` accumulated three deprecated exports during the ACP refactor: `registerRunAgentCommand` (wrapper around `registerRunCommand`), `registerRunAcpAgentCommand` (explicit no-op), and `runAcpAgent` (thin ACP wrapper around `runAgent`). The companion `RunAcpAgentOptions` interface is only used by `runAcpAgent`. None of these are imported by any active source file — only compiled `dist/` output and `e2e/tmp/` ephemeral artifacts reference them.

`build.ts` (`runBuild`) has no unit test file despite being one of the more complex CLI commands: it does role discovery, filtering, adapter round-trip validation, .gitignore management, Docker artifact generation, and proxy dependency synthesis.

## Goals / Non-Goals

**Goals:**
- Delete the three deprecated exports and their supporting type from `run-agent.ts`
- Add `build.test.ts` covering the key branches of `runBuild`

**Non-Goals:**
- Changing any public behavior of `chapter build` or `run`
- Adding e2e tests (already covered)
- Touching the `dist/` or `e2e/tmp/` references (ephemeral artifacts, not source)

## Decisions

**Remove all three deprecated exports together**
Rather than deprecating with a future-removal notice, delete them now. Reason: they have zero callers in source, and the `run-agent.ts` file is already long. Keeping them adds confusion and export surface area for no benefit.

**Test `runBuild` directly (not via CLI registration)**
The other command tests (e.g. `pack.test.ts`, `permissions.test.ts`) test the exported function directly with mocked deps, not through `program.parse`. This is the established pattern — follow it for consistency.

**Mock at the module boundary**
Mock `discoverRoles`, `generateRoleDockerBuildDir`, `ensureProxyDependencies`, `synthesizeRolePackages`, and `fs` primitives. This isolates `runBuild`'s orchestration logic from the materializer implementations.

## Risks / Trade-offs

[Risk] Removing `RunAcpAgentOptions` could break external consumers who import the type → Mitigation: grep confirms no imports in active source; the type was only used by the deleted `runAcpAgent`

[Risk] Test mocking could diverge from real behavior → Mitigation: e2e tests remain as the integration safety net; unit tests cover branches e2e can't easily exercise (e.g., "no roles found", "role not found by name")

## Open Questions

None — the scope is narrow and well-defined.
