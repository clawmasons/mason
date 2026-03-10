# Spec: `clawmasons acp --chapter initiate` — Bootstrap Flow

**Change:** #7 from [IMPLEMENTATION.md](../../prds/clawmasons-cli/IMPLEMENTATION.md)
**PRD refs:** REQ-004 (Initiate Chapter Bootstrap Flow)
**Status:** complete

---

## Problem

New users must manually run multiple commands (`clawmasons init`, `clawmasons chapter init --template initiate`, `clawmasons chapter build`, then `clawmasons acp --role <role>`) before they can start using the system. There is no single-command bootstrap path.

## Solution

Add `--chapter <name>` and `--init-agent <name>` options to the `clawmasons acp` command. When `--chapter initiate` is specified, automatically run the full bootstrap flow before starting the ACP endpoint:

1. **Lodge init** — Call `initLodge()` to ensure the lodge exists
2. **Chapter check** — Check if the initiate chapter exists at `LODGE_HOME/chapters/initiate/`
3. **Chapter init** — If not, run `chapter init --template initiate` with `--name <lodge>.initiate`
4. **Chapter build** — Run `chapter build` in the chapter directory
5. **Continue** — Proceed with standard ACP startup using the chapter workspace as rootDir

Non-`initiate` `--chapter` values set the chapter context (resolve rootDir to `LODGE_HOME/chapters/<name>/`) without running the bootstrap flow.

## Design

### Modified: `packages/cli/src/cli/commands/run-acp-agent.ts`

**New options:**
- `--chapter <name>` — Chapter name. When `initiate`, triggers bootstrap.
- `--init-agent <name>` — Agent name override for the initiate chapter (default: auto-detect).

**New types/interfaces:**
- Extend `RunAcpAgentOptions` with `chapter?: string` and `initAgent?: string`
- Extend `RunAcpAgentDeps` with:
  - `initLodgeFn` — Injectable lodge init (from lodge-init.ts)
  - `runInitFn` — Injectable chapter init (from init.ts)
  - `runBuildFn` — Injectable chapter build (from build.ts)
  - `resolveLodgeVarsFn` — Injectable lodge var resolution
  - `existsSyncFn` — Injectable fs.existsSync

**Bootstrap logic (new function `bootstrapChapter`):**

```typescript
async function bootstrapChapter(
  chapterName: string,
  deps: BootstrapDeps,
): Promise<string> {
  // 1. Init lodge
  const lodgeResult = deps.initLodgeFn({});
  const { lodge, lodgeHome } = lodgeResult;

  // 2. Resolve chapter directory
  const chapterDir = path.join(lodgeHome, "chapters", chapterName);

  // 3. If chapter doesn't exist, init + build
  if (!deps.existsSyncFn(path.join(chapterDir, ".clawmasons"))) {
    fs.mkdirSync(chapterDir, { recursive: true });
    await deps.runInitFn(chapterDir, {
      name: `${lodge}.${chapterName}`,
      template: chapterName,
    }, { skipNpmInstall: true });
    await deps.runBuildFn(chapterDir, undefined, {});
  }

  return chapterDir; // becomes the new rootDir
}
```

**Flow modification in `runAcpAgent`:**
- Before existing Step 1, if `options.chapter` is provided:
  - If chapter is `initiate`: run full bootstrap, set rootDir to chapter directory
  - If chapter is something else: resolve rootDir to `LODGE_HOME/chapters/<name>/`

### Idempotency

- `initLodge()` is already idempotent (skips if lodge exists)
- `runInit()` is already idempotent (skips if `.clawmasons/` directory exists)
- `runBuild()` can safely re-run (overwrites lock file and Docker artifacts)
- The bootstrap checks for `.clawmasons/` directory existence to decide whether to init

## Tasks

- [x] Add `--chapter` and `--init-agent` options to command registration
- [x] Add bootstrap deps to `RunAcpAgentDeps`
- [x] Implement `bootstrapChapter()` function
- [x] Wire bootstrap into `runAcpAgent()` flow
- [x] Add unit tests for bootstrap logic
- [x] Add unit tests for non-initiate chapter resolution
- [x] Verify TypeScript compiles
- [x] Verify linter passes
- [x] Verify all tests pass

## Test Plan

1. **Bootstrap calls init and build in correct order** — Mock deps, verify `initLodge` -> `runInit` -> `runBuild` sequence
2. **Idempotent** — When chapter already exists (`.clawmasons/` present), skip init and build
3. **Non-initiate chapter** — `--chapter foo` resolves rootDir to `LODGE_HOME/chapters/foo/` without bootstrap
4. **No chapter flag** — Existing behavior unchanged, rootDir = process.cwd()
5. **Bootstrap failure** — If init or build fails, error propagates with clear message
6. **Command registration** — `--chapter` and `--init-agent` appear in help output
