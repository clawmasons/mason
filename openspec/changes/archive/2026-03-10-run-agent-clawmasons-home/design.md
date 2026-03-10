# Design: `run-agent` CLAWMASONS_HOME & Auto-Init

## Architecture

The `runAgent()` function is refactored to replace the project-local `.clawmasons/chapter.json` lookup with a host-wide `CLAWMASONS_HOME/chapters.json` lookup. When the role is not found, it auto-invokes `initRole()`.

### Flow

```
runAgent(projectDir, agent, role)
  1. checkDockerCompose()
  2. getClawmasonsHome() → home
  3. findRoleEntry(home, lodge, chapter, role)
     ├─ Found → use entry.dockerBuild as docker-build path
     └─ Not found → call initRole(cwd, { role }) then re-read entry
  4. validateDockerfiles(dockerBuildPath, agent, role)
  5. ensureGitignoreEntry(projectDir, ".clawmasons")
  6. Create session dir at projectDir/.clawmasons/sessions/<id>/docker/
  7. Generate compose, start proxy → cred-service → agent (unchanged)
  8. Teardown on exit (unchanged)
```

### Key Design Decisions

1. **Chapter workspace detection for auto-init**: When auto-init is triggered, `run-agent` needs to know the chapter workspace root to pass to `initRole()`. It uses `process.cwd()` as the workspace root (same as how `init-role` CLI works). This assumes the user runs `run-agent` from the chapter workspace OR that the role is already initialized.

2. **Lodge/chapter parsing**: The lodge and chapter names are derived from the `chapters.json` entry when the role exists. For auto-init, they come from the chapter workspace's `.clawmasons/chapter.json` config (read by `initRole`).

3. **Backward compatibility for readRunConfig**: The old `readRunConfig()` function and its tests are kept as-is since they test valid utility functions. The `runAgent()` function no longer calls it — instead it reads from `chapters.json`.

4. **Dependencies injection**: Add `getClawmasonsHomeFn`, `findRoleEntryFn`, `initRoleFn`, and `ensureGitignoreEntryFn` to the `RunAgentDeps` interface for testability.

### Interface Changes

```typescript
export interface RunAgentDeps {
  execComposeFn?: (...) => Promise<number>;
  generateSessionIdFn?: () => string;
  checkDockerComposeFn?: () => void;
  // New:
  getClawmasonsHomeFn?: () => string;
  findRoleEntryFn?: (home: string, lodge: string, chapter: string, role: string) => ChapterEntry | undefined;
  initRoleFn?: (rootDir: string, options: InitRoleOptions) => Promise<void>;
  ensureGitignoreEntryFn?: (dir: string, pattern: string) => boolean;
}
```

### Error messages update

- Old: `No .clawmasons/chapter.json found. Run "chapter run-init" first...`
- New: `Role "${role}" not initialized and auto-init failed. Run "chapter init-role --role ${role}" from your chapter workspace.`
