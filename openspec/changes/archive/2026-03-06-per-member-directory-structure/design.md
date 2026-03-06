# Design: Per-Member Directory Structure & Install Pipeline

## Overview

This change updates the install pipeline to create per-member directory structures that differentiate between agent and human members, use the member's `slug` field for directory naming, and introduce `log/` and `proxy/` subdirectories.

## Directory Layout

### Agent Member (after install)

```
.chapter/members/<slug>/
  ├── docker-compose.yml
  ├── .env
  ├── chapter.lock.json
  ├── log/                          # Activity log directory
  ├── proxy/                        # Proxy build context (was chapter-proxy/)
  │   ├── Dockerfile
  │   └── chapter/                  # Pre-built chapter artifacts
  │       ├── package.json
  │       ├── dist/
  │       └── bin/
  └── <runtime>/                    # Per-runtime workspace
      ├── Dockerfile
      ├── .claude.json              # (claude-code only)
      ├── .claude/                  # (claude-code only, empty for volume mount)
      └── workspace/
          ├── .mcp.json
          ├── .claude/settings.json
          ├── AGENTS.md
          └── skills/
```

### Human Member (after install)

```
.chapter/members/<slug>/
  └── log/                          # Activity log directory only
```

## Implementation Details

### 1. `install.ts` Changes

#### Use slug for directory naming

Replace `getAppShortName(member.name)` with `member.slug` for the default output directory:

```typescript
// Before
const memberShortName = getAppShortName(member.name);
// ...
const outputDir = path.join(rootDir, ".chapter", "members", memberShortName);

// After
const outputDir = path.join(rootDir, ".chapter", "members", member.slug);
```

#### Create log/ directory

After writing files, create the `log/` directory:

```typescript
fs.mkdirSync(path.join(outputDir, "log"), { recursive: true });
```

#### Handle human members

Early return for human members after creating the log directory:

```typescript
if (member.memberType === "human") {
  const outputDir = options.outputDir
    ? path.resolve(rootDir, options.outputDir)
    : path.join(rootDir, ".chapter", "members", member.slug);

  fs.mkdirSync(path.join(outputDir, "log"), { recursive: true });
  console.log(`\n✔ Member "${memberName}" installed successfully!\n`);
  console.log(`  Output: ${outputDir}`);
  console.log(`  Type: human`);
  return;
}
```

#### Rename chapter-proxy → proxy

Change all `chapter-proxy/` references to `proxy/`:

```typescript
// Before
allFiles.set("chapter-proxy/Dockerfile", proxyDockerfile);
copyDirToFiles(..., "chapter-proxy/chapter/dist", ...);

// After
allFiles.set("proxy/Dockerfile", proxyDockerfile);
copyDirToFiles(..., "proxy/chapter/dist", ...);
```

### 2. `docker-compose.ts` Changes

Update the proxy service build path:

```typescript
// Before
lines.push("    build: ./chapter-proxy");
lines.push("      - ./chapter-proxy/logs:/logs");

// After
lines.push("    build: ./proxy");
lines.push("      - ./proxy/logs:/logs");
```

### 3. `docker-utils.ts` Changes

The `resolveMemberDir()` function currently uses `getAppShortName()` which derives from the package name. Since the slug is not available at this layer (it's a schema-level field, not passed as an argument), we keep using `getAppShortName()` for the run/stop commands. The install command directly uses `member.slug` (it has the resolved member).

No changes needed to `docker-utils.ts` -- the `resolveMemberDir()` function is used by run/stop which receive the package name as a CLI argument. Since `getAppShortName("@test/member-ops")` produces `"ops"` and the slug for that member would also be `"ops"`, the paths align naturally. If a user's slug differs from their package short name, they can use `--output-dir`.

### 4. Test Changes

#### `tests/cli/install.test.ts`

- Update all `chapter-proxy/` references to `proxy/`
- Add test: `log/` directory is created for agent members
- Add test: human member install creates only `log/` directory
- Add test: human member install does not create docker artifacts

#### `tests/compose/docker-compose.test.ts`

- Update `build: ./chapter-proxy` to `build: ./proxy`
- Update `./chapter-proxy/logs:/logs` to `./proxy/logs:/logs`

## Edge Cases

1. **Slug vs short name mismatch**: If `slug: "my-custom-slug"` but package name is `@acme/member-different-name`, the install dir uses `my-custom-slug` but run/stop would derive `different-name`. Mitigated by `--output-dir` flag. Future changes can store the slug in `members.json` registry.

2. **Re-install overwrites**: Same as current behavior -- re-running install overwrites all files. The `log/` directory persists because `mkdirSync` with `recursive: true` is a no-op on existing directories.

3. **Human member with roles only**: Human members have roles but no runtimes. The install should validate successfully but skip all Docker-related generation.
